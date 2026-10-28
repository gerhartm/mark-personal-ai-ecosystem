import { randomUUID } from 'node:crypto';
import { one, run } from './db.js';
import { previewTopics } from './prompt-controls.js';
import { latestPreview, TopicOrganizationError, type Progress } from './topic-organization.js';

/** A preview groups a sample of claims with the current instruction and saves nothing else. */
type PreviewJob = {
  id?: string;
  status: 'idle' | 'queued' | 'running' | 'ready' | 'failed';
  actor?: string;
  requested_at?: string;
  updated_at?: string;
  progress?: Progress;
  error?: string;
};
const KEY = 'topics.preview.job';
let busy = false;
let timer: NodeJS.Timeout | undefined;

function job(): PreviewJob {
  const row = one<{ value: string }>('SELECT value FROM app_settings WHERE key=?', KEY);
  return row ? JSON.parse(row.value) : { status: 'idle' };
}

function save(value: PreviewJob) {
  run('INSERT OR REPLACE INTO app_settings(key,value) VALUES (?,?)', KEY, JSON.stringify(value));
  return value;
}

export function topicPreviewStatus() {
  return { ...job(), result: latestPreview() };
}

export function queueTopicPreview(actor: string) {
  const current = job();
  if (current.status === 'queued' || current.status === 'running') return current;
  const now = new Date().toISOString();
  return save({ id: randomUUID(), status: 'queued', actor, requested_at: now, updated_at: now });
}

export async function processTopicPreviewJob() {
  if (busy) return false;
  const current = job();
  if (current.status !== 'queued') return false;
  busy = true;
  const running: PreviewJob = { ...current, status: 'running', updated_at: new Date().toISOString() };
  save(running);
  try {
    await previewTopics(current.actor ?? 'mark', (progress) => save({ ...running, progress, updated_at: new Date().toISOString() }));
    save({ ...current, status: 'ready', updated_at: new Date().toISOString() });
    return true;
  } catch (error) {
    // Our own messages are safe to show (they say why Hermes gave no answer); provider details never are.
    save({ ...current, status: 'failed', updated_at: new Date().toISOString(),
      error: error instanceof TopicOrganizationError ? error.message : 'The preview could not be generated. Nothing was changed. Check Hermes availability and retry.' });
    return false;
  } finally { busy = false; }
}

export function startTopicPreviewWorker() {
  if (timer) return;
  const current = job();
  if (current.status === 'running') save({ ...current, status: 'failed', updated_at: new Date().toISOString(),
    error: 'The preview was interrupted by a dashboard restart. Retry it when ready.' });
  timer = setInterval(() => void processTopicPreviewJob(), 5_000);
  timer.unref();
}
