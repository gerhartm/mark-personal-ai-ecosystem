import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { audit, db, one, run } from './db.js';
import { readOpenVikingResource, registerExistingOpenVikingSource } from './ingestion.js';

const MAX_ATTEMPTS = 5;
const MAX_SOURCE_CHARACTERS = 1_000_000;
let workerRunning = false;
let workerTimer: NodeJS.Timeout | null = null;

export type TelegramSyncRequest = {
  external_id?: string;
  title?: string;
  source_type?: string;
  source_url?: string;
  openviking_uri?: string;
  captured_at?: string;
  metadata?: Record<string, unknown>;
};

type SyncJob = {
  id: number;
  external_id: string;
  actor: string;
  attempts: number;
  title: string;
  source_type: string;
  source_url: string | null;
  openviking_uri: string;
  captured_at: string;
};

export class TelegramSyncError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'TelegramSyncError';
  }
}

function secretValue() {
  const file = process.env.SATOSHI_DASHBOARD_SYNC_SECRET_FILE?.trim();
  if (file) return readFileSync(file, 'utf8').trim();
  return process.env.SATOSHI_DASHBOARD_SYNC_SECRET?.trim() ?? '';
}

export function telegramSyncConfigured() {
  try {
    return secretValue().length >= 32;
  } catch {
    return false;
  }
}

export function telegramSyncAuthorized(header: unknown) {
  let expected = '';
  try {
    expected = secretValue();
  } catch {
    return false;
  }
  const supplied = String(header ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!expected || !supplied) return false;
  const expectedHash = createHash('sha256').update(expected).digest();
  const suppliedHash = createHash('sha256').update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

function cleanText(value: unknown, field: string, min: number, max: number, pattern?: RegExp) {
  const valueText = String(value ?? '').trim();
  if (valueText.length < min || valueText.length > max || (pattern && !pattern.test(valueText))) {
    throw new TelegramSyncError('invalid_sync_packet', `${field} is invalid.`);
  }
  return valueText;
}

function validTimestamp(value: unknown) {
  const valueText = cleanText(value, 'captured_at', 10, 40);
  if (!Number.isFinite(Date.parse(valueText))) {
    throw new TelegramSyncError('invalid_sync_packet', 'captured_at is invalid.');
  }
  return new Date(valueText).toISOString();
}

export function enqueueTelegramSource(input: TelegramSyncRequest, actor = 'satoshi') {
  const now = new Date().toISOString();
  const externalId = cleanText(input.external_id, 'external_id', 3, 200, /^[A-Za-z0-9_.:-]+$/);
  const title = cleanText(input.title, 'title', 2, 200);
  const sourceType = cleanText(input.source_type, 'source_type', 2, 50, /^[a-z0-9_-]+$/i).toLowerCase();
  const openVikingUri = cleanText(input.openviking_uri, 'openviking_uri', 10, 1_000, /^viking:\/\//i);
  const capturedAt = validTimestamp(input.captured_at ?? now);
  const sourceUrl = input.source_url
    ? cleanText(input.source_url, 'source_url', 8, 4_000, /^https?:\/\//i)
    : null;
  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? input.metadata
    : {};
  const metadataJson = JSON.stringify(metadata);
  if (metadataJson.length > 20_000) {
    throw new TelegramSyncError('invalid_sync_packet', 'metadata is too large.');
  }

  run(
    `INSERT OR IGNORE INTO source_sync_jobs
     (external_id, submitted_at, updated_at, actor, status, attempts, not_before,
      title, source_type, source_url, openviking_uri, captured_at, metadata_json)
     VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?, ?, ?)`,
    externalId,
    now,
    now,
    actor,
    now,
    title,
    sourceType,
    sourceUrl,
    openVikingUri,
    capturedAt,
    metadataJson,
  );
  const job = one<any>(
    `SELECT id, external_id, status, attempts, canonical_id, submitted_at, updated_at, last_error
       FROM source_sync_jobs WHERE external_id=?`,
    externalId,
  );
  audit(actor, 'source.telegram_sync_enqueued', externalId, { job_id: job.id, status: job.status });
  void processNextTelegramSyncJob();
  return job;
}

export function telegramSyncJob(externalId: string) {
  return one<any>(
    `SELECT id, external_id, status, attempts, canonical_id, submitted_at, updated_at, last_error
       FROM source_sync_jobs WHERE external_id=?`,
    externalId,
  );
}

export function recentTelegramSyncJobs(limit = 20) {
  return db.prepare(
    `SELECT id, external_id, status, attempts, canonical_id, title, source_type,
            submitted_at, updated_at, last_error
       FROM source_sync_jobs ORDER BY id DESC LIMIT ?`,
  ).all(Math.max(1, Math.min(limit, 100)));
}

function claimNextJob() {
  return db.transaction(() => {
    const job = one<SyncJob>(
      `SELECT id, external_id, actor, attempts, title, source_type, source_url,
              openviking_uri, captured_at
         FROM source_sync_jobs
        WHERE status='queued' AND not_before<=?
        ORDER BY id LIMIT 1`,
      new Date().toISOString(),
    );
    if (!job) return null;
    run(
      `UPDATE source_sync_jobs
          SET status='processing', attempts=attempts+1, updated_at=?, last_error=NULL
        WHERE id=? AND status='queued'`,
      new Date().toISOString(),
      job.id,
    );
    return { ...job, attempts: job.attempts + 1 };
  })();
}

function retryDelaySeconds(attempt: number) {
  return Math.min(300, 5 * (2 ** Math.max(0, attempt - 1)));
}

export async function processNextTelegramSyncJob() {
  if (workerRunning) return false;
  workerRunning = true;
  try {
    const job = claimNextJob();
    if (!job) return false;
    try {
      const content = await readOpenVikingResource(job.openviking_uri, MAX_SOURCE_CHARACTERS);
      if (content.trim().length < 20) {
        throw new TelegramSyncError('source_not_ready', 'The complete OpenViking source is not ready yet.');
      }
      const registered = registerExistingOpenVikingSource({
        title: job.title,
        sourceType: job.source_type,
        sourceUrl: job.source_url,
        capturedAt: job.captured_at,
        openVikingUri: job.openviking_uri,
        content,
      });
      run(
        `UPDATE source_sync_jobs
            SET status='ready', canonical_id=?, updated_at=?, last_error=NULL
          WHERE id=?`,
        registered.sourceId,
        new Date().toISOString(),
        job.id,
      );
      run(
        `INSERT INTO ingestion_receipts (created_at, status, canonical_id, detail_json)
         VALUES (?, 'created', ?, ?)`,
        new Date().toISOString(),
        registered.sourceId,
        JSON.stringify({
          kind: 'telegram',
          title: job.title,
          source_type: job.source_type,
          openviking_uri: job.openviking_uri,
          character_count: content.length,
          external_id: job.external_id,
          duplicate: registered.duplicate,
        }),
      );
      audit(job.actor, 'source.telegram_sync_ready', registered.sourceId, {
        job_id: job.id,
        external_id: job.external_id,
        duplicate: registered.duplicate,
        character_count: content.length,
      });
    } catch (error) {
      const code = error instanceof TelegramSyncError ? error.code : 'sync_failed';
      if (job.attempts < MAX_ATTEMPTS) {
        const notBefore = new Date(Date.now() + retryDelaySeconds(job.attempts) * 1_000).toISOString();
        run(
          `UPDATE source_sync_jobs
              SET status='queued', not_before=?, updated_at=?, last_error=?
            WHERE id=?`,
          notBefore,
          new Date().toISOString(),
          code,
          job.id,
        );
      } else {
        run(
          `UPDATE source_sync_jobs
              SET status='failed', updated_at=?, last_error=?
            WHERE id=?`,
          new Date().toISOString(),
          code,
          job.id,
        );
        audit(job.actor, 'source.telegram_sync_failed', job.external_id, {
          job_id: job.id,
          error_code: code,
        });
      }
    }
    return true;
  } finally {
    workerRunning = false;
  }
}

export function startTelegramSyncWorker() {
  if (workerTimer || !telegramSyncConfigured()) return;
  workerTimer = setInterval(() => void processNextTelegramSyncJob(), 1_000);
  workerTimer.unref();
  void processNextTelegramSyncJob();
}
