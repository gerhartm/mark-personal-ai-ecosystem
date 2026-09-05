import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = resolve(
  process.env.CRYPTO_DB ?? join(HERE, '..', '..', 'data', 'crypto-intelligence.db'),
);

if (!existsSync(DB_PATH)) {
  throw new Error(
    `active database not found at ${DB_PATH}. Run "npm run build:db" in dashboard/server first.`,
  );
}

/**
 * One database. Nothing is attached, there are no temp views, and there is one
 * full-text index. Foreign keys are real and enforced by SQLite.
 */
export const db = new Database(DB_PATH, { readonly: false, timeout: 5_000 });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/**
 * Runtime migration 006: durable handoff from Satoshi's native OpenViking
 * ingestion into the existing dashboard corpus. The queue stores references
 * and safe metadata only; complete source bodies remain in OpenViking.
 */
const hasMigration = (id: string) => Boolean(db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id));

if (!hasMigration('006')) db.transaction(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_sync_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      submitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      actor TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued','processing','ready','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      not_before TEXT NOT NULL,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT,
      openviking_uri TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      canonical_id TEXT,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_source_sync_jobs_queue
      ON source_sync_jobs(status, not_before, id);
  `);
  db.prepare(
    `INSERT OR IGNORE INTO schema_migrations (id, name, applied_at)
     VALUES ('006', 'telegram_source_sync', ?)`,
  ).run(new Date().toISOString());
})();
if (process.env.NODE_ENV !== 'test') db.prepare(
  `UPDATE source_sync_jobs
      SET status='queued', updated_at=?, not_before=?, last_error='recovered_after_restart'
    WHERE status='processing'`,
).run(new Date().toISOString(), new Date().toISOString());

/** Runtime migration 007: searchable, durable Ask history. */
if (!hasMigration('007')) db.transaction(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ask_history (
      id TEXT PRIMARY KEY,
      asked_at TEXT NOT NULL,
      actor TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      evidence_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_ask_history_asked_at
      ON ask_history(asked_at DESC);
  `);
  db.prepare(
    `INSERT OR IGNORE INTO schema_migrations (id, name, applied_at)
     VALUES ('007', 'ask_history', ?)`,
  ).run(new Date().toISOString());
})();

/** Runtime migration 008: Mark-owned page instructions with append-only revision history. */
if (!hasMigration('008')) db.transaction(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_settings (
      page_id TEXT PRIMARY KEY,
      instructions TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 1),
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompt_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      instructions TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('save','restore')),
      created_at TEXT NOT NULL,
      UNIQUE(page_id, revision)
    );
    CREATE INDEX IF NOT EXISTS idx_prompt_revisions_page
      ON prompt_revisions(page_id, revision DESC);
  `);
  db.prepare(
    `INSERT OR IGNORE INTO schema_migrations (id, name, applied_at)
     VALUES ('008', 'prompt_controls', ?)`,
  ).run(new Date().toISOString());
})();

/** The private media archive. Unset means media is unavailable in this environment. */
export const MEDIA_ROOT = process.env.CRYPTO_MEDIA_ROOT ?? null;

export type Origin = 'migrated' | 'ingested';

export const one = <T = any>(sql: string, ...params: any[]): T | undefined =>
  db.prepare(sql).get(...params) as T | undefined;

export const all = <T = any>(sql: string, ...params: any[]): T[] =>
  db.prepare(sql).all(...params) as T[];

export const run = (sql: string, ...params: any[]) => db.prepare(sql).run(...params);

export function audit(actor: string, action: string, target?: string, detail?: unknown) {
  run(
    'INSERT INTO audit_log (created_at, actor, action, target, detail_json) VALUES (?, ?, ?, ?, ?)',
    new Date().toISOString(),
    actor,
    action,
    target ?? null,
    detail ? JSON.stringify(detail) : null,
  );
}
