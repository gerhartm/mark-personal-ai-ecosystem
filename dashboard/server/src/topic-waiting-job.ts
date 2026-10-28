import { randomUUID } from 'node:crypto';
import { one, run } from './db.js';
import { groupWaitingTopics } from './prompt-controls.js';
import { TopicOrganizationError, totalStats, waitingSummary, type Progress } from './topic-organization.js';

/**
 * Regroups claims waiting for a topic in the background. It adds claims to
 * existing topics or starts new ones and never removes or recategorizes
 * anything. Filing and rebuilds wait while it runs.
 */
type WaitingJob = {
  id?: string;
  status: 'idle' | 'queued' | 'running' | 'ready' | 'failed';
  actor?: string;
  requested_at?: string;
  updated_at?: string;
  progress?: Progress;
  error?: string;
  waiting_before?: number;
  placed?: number;
  joined?: number;
  created?: number;
  waiting_after?: number;
  failed_groups?: number;
  grouping?: ReturnType<typeof totalStats>;
};
const KEY = 'topics.waiting.job';
let busy = false;
let timer: NodeJS.Timeout | undefined;

function job(): WaitingJob {
  const row = one<{ value: string }>('SELECT value FROM app_settings WHERE key=?', KEY);
  return row ? JSON.parse(row.value) : { status: 'idle' };
}

function save(value: WaitingJob) {
  run('INSERT OR REPLACE INTO app_settings(key,value) VALUES (?,?)', KEY, JSON.stringify(value));
  return value;
}

export const topicWaitingBusy = () => ['queued', 'running'].includes(job().status);

export function topicWaitingStatus() {
  return { ...job(), ...waitingSummary() };
}

/** After an undo, the last regrouping's result no longer describes what is live. */
export function resetTopicWaitingStatus() {
  const current = job();
  if (current.status === 'ready' || current.status === 'failed') save({ status: 'idle', updated_at: new Date().toISOString() });
}

export function queueTopicWaiting(actor: string) {
  const current = job();
  if (current.status === 'queued' || current.status === 'running') return current;
  const now = new Date().toISOString();
  return save({ id: randomUUID(), status: 'queued', actor, requested_at: now, updated_at: now });
}

export async function processTopicWaitingJob() {
  if (busy) return false;
  const current = job();
  if (current.status !== 'queued') return false;
  busy = true;
  const running: WaitingJob = { ...current, status: 'running', updated_at: new Date().toISOString() };
  save(running);
  try {
    const result = await groupWaitingTopics(current.actor ?? 'mark', (progress) => save({ ...running, progress, updated_at: new Date().toISOString() }));
    save({
      ...current, status: 'ready', updated_at: new Date().toISOString(),
      waiting_before: result.waiting_before, placed: result.placed, joined: result.joined, created: result.created,
      waiting_after: result.waiting_after, failed_groups: result.failed_groups, grouping: totalStats(result.batches),
    });
    return true;
  } catch (error) {
    // Our own messages are safe to show; provider details never are.
    save({ ...current, status: 'failed', updated_at: new Date().toISOString(),
      error: error instanceof TopicOrganizationError ? error.message : 'Waiting claims could not be grouped. Nothing was changed. Check Hermes availability and retry.' });
    return false;
  } finally { busy = false; }
}

export function startTopicWaitingWorker() {
  if (timer) return;
  const current = job();
  if (current.status === 'running') save({ ...current, status: 'failed', updated_at: new Date().toISOString(),
    error: 'Grouping waiting claims was interrupted by a dashboard restart. Nothing was changed. Run it again when ready.' });
  timer = setInterval(() => void processTopicWaitingJob(), 5_000);
  timer.unref();
}
