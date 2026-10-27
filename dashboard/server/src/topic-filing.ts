import { fileNewClaims } from './topic-organization.js';
import { topicRebuildBusy } from './topic-jobs.js';

/**
 * Files newly processed claims into Topics on its own timer, so source
 * processing never waits for it. Claims committed during a rebuild or before a
 * restart are picked up on a later run. When Hermes is unavailable, filing
 * pauses for a while instead of retrying every minute.
 */
const INTERVAL = 60_000;
const BACKOFF = 15 * 60_000;
let busy = false;
let pausedUntil = 0;
let timer: NodeJS.Timeout | undefined;

export async function runTopicFiling(now = Date.now()) {
  if (busy || now < pausedUntil) return null;
  busy = true;
  try {
    return await fileNewClaims({ limit: 40, rebuildBusy: topicRebuildBusy });
  } catch (error) {
    pausedUntil = Date.now() + BACKOFF;
    console.warn('[topics] filing paused', error instanceof Error ? error.message : error);
    return null;
  } finally { busy = false; }
}

export function startTopicFilingWorker() {
  if (timer || !process.env.HERMES_BASE_URL || process.env.SOURCE_PROCESSING_ENABLED === 'false') return;
  timer = setInterval(() => void runTopicFiling(), INTERVAL);
  timer.unref();
}
