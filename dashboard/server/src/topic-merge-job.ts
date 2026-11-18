import { randomUUID } from 'node:crypto';
import { one, run } from './db.js';
import { getPromptControl } from './prompt-controls.js';
import { TopicOrganizationError } from './topic-organization.js';
import { findDuplicateTopics, mergeProposalView, type MergeProgress } from './topic-merge.js';

/**
 * Finds duplicate topics in the background and saves a preview. It changes no
 * topic; applying the preview is a separate, quick step Mark takes. Filing and
 * the other Topics jobs wait while it runs.
 */
type MergeJob = {
  id?: string;
  status: 'idle' | 'queued' | 'running' | 'ready' | 'failed';
  actor?: string;
  requested_at?: string;
  updated_at?: string;
  progress?: MergeProgress;
  error?: string;
};
const KEY = 'topics.merge.job';
let busy = false;
let timer: NodeJS.Timeout | undefined;

function job(): MergeJob {
  const row = one<{ value: string }>('SELECT value FROM app_settings WHERE key=?', KEY);
  return row ? JSON.parse(row.value) : { status: 'idle' };
}

function save(value: MergeJob) {
  run('INSERT OR REPLACE INTO app_settings(key,value) VALUES (?,?)', KEY, JSON.stringify(value));
  return value;
}

export const topicMergeBusy = () => ['queued', 'running'].includes(job().status);

export function topicMergeStatus() {
  return { ...job(), ...mergeProposalView() };
}

export function queueTopicMerge(actor: string) {
  const current = job();
  if (current.status === 'queued' || current.status === 'running') return current;
  const now = new Date().toISOString();
  return save({ id: randomUUID(), status: 'queued', actor, requested_at: now, updated_at: now });
}

export async function processTopicMergeJob() {
  if (busy) return false;
  const current = job();
  if (current.status !== 'queued') return false;
  busy = true;
  const running: MergeJob = { ...current, status: 'running', updated_at: new Date().toISOString() };
  save(running);
  try {
    await findDuplicateTopics(current.actor ?? 'mark', getPromptControl('topics').instructions,
      (progress) => save({ ...running, progress, updated_at: new Date().toISOString() }));
    save({ ...current, status: 'ready', updated_at: new Date().toISOString() });
    return true;
  } catch (error) {
    // Our own messages are safe to show; provider details never are.
    save({ ...current, status: 'failed', updated_at: new Date().toISOString(),
      error: error instanceof TopicOrganizationError ? error.message : 'Duplicate topics could not be found. Nothing was changed. Check the AI connection and retry.' });
    return false;
  } finally { busy = false; }
}

export function startTopicMergeWorker() {
  if (timer) return;
  const current = job();
  if (current.status === 'running') save({ ...current, status: 'failed', updated_at: new Date().toISOString(),
    error: 'Finding duplicate topics was interrupted by a dashboard restart. Nothing was changed. Run it again when ready.' });
  timer = setInterval(() => void processTopicMergeJob(), 5_000);
  timer.unref();
}
