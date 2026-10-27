import { randomUUID } from 'node:crypto';
import { one, run } from './db.js';
import { rebuildTopics } from './prompt-controls.js';
import { TopicOrganizationError, type Progress } from './topic-organization.js';

type TopicJob = {
  id?: string;
  status: 'idle' | 'queued' | 'running' | 'ready' | 'failed';
  actor?: string;
  requested_at?: string;
  updated_at?: string;
  topic_count?: number;
  unsorted_count?: number;
  uncategorized_count?: number;
  failed_groups?: number;
  progress?: Progress;
  error?: string;
};
const KEY = 'topics.rebuild.job';
let busy = false;
let timer: NodeJS.Timeout | undefined;

export function topicRebuildStatus(): TopicJob {
  const row = one<{ value: string }>('SELECT value FROM app_settings WHERE key=?', KEY);
  return row ? JSON.parse(row.value) : { status: 'idle' };
}

function save(job: TopicJob) {
  run('INSERT OR REPLACE INTO app_settings(key,value) VALUES (?,?)', KEY, JSON.stringify(job));
  return job;
}

export function queueTopicRebuild(actor: string) {
  const current = topicRebuildStatus();
  if (current.status === 'queued' || current.status === 'running') return current;
  const now = new Date().toISOString();
  return save({ id: randomUUID(), status: 'queued', actor, requested_at: now, updated_at: now });
}

export async function processTopicRebuildJob() {
  if (busy) return false;
  const job = topicRebuildStatus();
  if (job.status !== 'queued') return false;
  busy = true;
  const running: TopicJob = { ...job, status: 'running', updated_at: new Date().toISOString() };
  save(running);
  try {
    const result = await rebuildTopics(job.actor ?? 'mark', (progress) => {
      save({ ...running, progress, updated_at: new Date().toISOString() });
    });
    save({ ...job, status: 'ready', topic_count: result.topics.length, unsorted_count: result.unsorted,
      uncategorized_count: result.uncategorized, failed_groups: result.failed_groups, updated_at: new Date().toISOString() });
    return true;
  } catch (error) {
    // Our own messages are safe to show; provider details never are.
    const known = error instanceof TopicOrganizationError ? `${error.message} The previous Topics are still available.` : null;
    save({ ...job, status: 'failed', updated_at: new Date().toISOString(),
      error: known ?? 'Topics could not be rebuilt. The previous organization is still available. Check Hermes availability and retry.' });
    return false;
  } finally { busy = false; }
}

export function recoverInterruptedTopicRebuild() {
  const job = topicRebuildStatus();
  if (job.status === 'running') save({ ...job, status: 'failed', updated_at: new Date().toISOString(),
    error: 'The rebuild was interrupted by a dashboard restart. Review the current Topics and retry if needed.' });
}

export const topicRebuildBusy = () => ['queued', 'running'].includes(topicRebuildStatus().status);

/** After an undo, the last rebuild's result no longer describes what is live. */
export function resetTopicRebuildStatus() {
  const current = topicRebuildStatus();
  if (current.status === 'ready') save({ status: 'idle', updated_at: new Date().toISOString() });
}

export function startTopicRebuildWorker() {
  if (timer) return;
  recoverInterruptedTopicRebuild();
  timer = setInterval(() => void processTopicRebuildJob(), 5_000);
  timer.unref();
}
