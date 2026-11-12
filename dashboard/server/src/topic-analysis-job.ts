import { randomUUID } from 'node:crypto';
import { audit, one, run } from './db.js';
import { getPromptControl } from './prompt-controls.js';
import { analysisSummary, analysisTargets, TopicAnalysisError, writeTopicAnalysis, type AnalysisTarget } from './topic-analysis.js';
import { HermesUnavailableError, activeOrganizationV2, failureText } from './topic-organization.js';

/**
 * Writes analysis pages in the background, one topic at a time, saving each
 * page as it is finished. "sample" writes the five largest topics that need a
 * page, "all" writes every topic whose page is missing or out of date, and
 * "one" rewrites a single topic. A topic that gets no usable answer is listed
 * with the reason and the job moves on; running it again retries those topics.
 * Two topics in a row with no answer from Hermes at all stop the job, keeping
 * every page already written.
 */
export type AnalysisMode = 'sample' | 'all' | 'one';
export const SAMPLE_SIZE = 5;
type Failure = { key: string; title: string; reason: string };
type AnalysisJob = {
  id?: string;
  status: 'idle' | 'queued' | 'running' | 'ready' | 'failed';
  mode?: AnalysisMode;
  topic?: string;
  actor?: string;
  requested_at?: string;
  updated_at?: string;
  progress?: { done: number; total: number; current: string };
  written?: number;
  /** The pages this run wrote, so the panel can link to them (up to 50). */
  written_topics?: Array<{ key: string; title: string }>;
  dropped?: number;
  failures?: Failure[];
  stopped?: boolean;
  error?: string;
};
const KEY = 'topics.analysis.job';
const MAX_SILENT_TOPICS = 2;
let busy = false;
let timer: NodeJS.Timeout | undefined;
// A queued job starts once a filing run already talking to Hermes has finished:
// the two share Hermes's connection, and a cut-off on one call breaks the other.
let hermesInUse: () => boolean = () => false;

function job(): AnalysisJob {
  const row = one<{ value: string }>('SELECT value FROM app_settings WHERE key=?', KEY);
  return row ? JSON.parse(row.value) : { status: 'idle' };
}

function save(value: AnalysisJob) {
  run('INSERT OR REPLACE INTO app_settings(key,value) VALUES (?,?)', KEY, JSON.stringify(value));
  return value;
}

export const topicAnalysisBusy = () => ['queued', 'running'].includes(job().status);

/** The job, the page counts, and what a run would write next. */
export function topicAnalysisStatus() {
  const organization = activeOrganizationV2();
  const targets = organization ? analysisTargets(organization) : [];
  return {
    ...job(),
    pages: analysisSummary(organization),
    remaining: targets.length,
    next_sample: targets.slice(0, SAMPLE_SIZE).map((target) => ({ key: target.key, title: target.title })),
  };
}

export function queueTopicAnalysis(actor: string, mode: AnalysisMode, topic?: string) {
  const current = job();
  if (current.status === 'queued' || current.status === 'running') return current;
  const now = new Date().toISOString();
  return save({ id: randomUUID(), status: 'queued', mode, topic, actor, requested_at: now, updated_at: now });
}

function targetsFor(current: AnalysisJob): AnalysisTarget[] {
  const organization = activeOrganizationV2();
  if (!organization) throw new TopicAnalysisError('no_topics', 'Rebuild Topics first. There are no topics to analyse yet.', 409);
  if (current.mode === 'one') {
    const topic = organization.topics.find((item) => item.key === current.topic);
    if (!topic) throw new TopicAnalysisError('not_found', 'That topic no longer exists.', 404);
    return [{ key: topic.key, title: topic.title, claims: topic.claims.length }];
  }
  const targets = analysisTargets(organization);
  return current.mode === 'sample' ? targets.slice(0, SAMPLE_SIZE) : targets;
}

export async function processTopicAnalysisJob() {
  if (busy || hermesInUse()) return false;
  const current = job();
  if (current.status !== 'queued') return false;
  busy = true;
  const running: AnalysisJob = { ...current, status: 'running', updated_at: new Date().toISOString(), written: 0, written_topics: [], dropped: 0, failures: [] };
  save(running);
  try {
    const targets = targetsFor(current);
    const control = getPromptControl('analysis');
    let silentInRow = 0;
    for (const [index, target] of targets.entries()) {
      save({ ...running, progress: { done: index, total: targets.length, current: target.title }, updated_at: new Date().toISOString() });
      try {
        const { dropped } = await writeTopicAnalysis(target.key, current.actor ?? 'mark', { text: control.instructions, revision: control.revision });
        running.written = (running.written ?? 0) + 1;
        running.written_topics = [...(running.written_topics ?? []), { key: target.key, title: target.title }].slice(-50);
        running.dropped = (running.dropped ?? 0) + dropped.length;
        silentInRow = 0;
      } catch (error) {
        const reason = error instanceof HermesUnavailableError
          ? (failureText(error.failure) || 'Hermes did not answer.')
          : error instanceof TopicAnalysisError ? error.message : 'The page could not be written.';
        running.failures = [...(running.failures ?? []), { key: target.key, title: target.title, reason }];
        if (error instanceof HermesUnavailableError) {
          if (++silentInRow >= MAX_SILENT_TOPICS) { running.stopped = true; break; }
        } else {
          silentInRow = 0;
        }
      }
    }
    save({ ...running, status: 'ready', progress: undefined, updated_at: new Date().toISOString() });
    audit(current.actor ?? 'mark', 'topics.analysis', current.mode === 'one' ? `topics.analysis.${current.topic}` : 'topics.analysis',
      { mode: current.mode, written: running.written, failed: running.failures?.length ?? 0, dropped: running.dropped, stopped: Boolean(running.stopped) });
    return true;
  } catch (error) {
    // Our own messages are safe to show; provider details never are.
    save({ ...running, status: 'failed', progress: undefined, updated_at: new Date().toISOString(),
      error: error instanceof TopicAnalysisError ? error.message : 'Analysis pages could not be written. Pages already written are kept. Check Hermes availability and retry.' });
    return false;
  } finally { busy = false; }
}

export function startTopicAnalysisWorker(options: { hermesInUse?: () => boolean } = {}) {
  if (timer) return;
  if (options.hermesInUse) hermesInUse = options.hermesInUse;
  const current = job();
  if (current.status === 'running') save({ ...current, status: 'failed', progress: undefined, updated_at: new Date().toISOString(),
    error: 'Writing analysis pages was interrupted by a dashboard restart. Pages already written are kept; run it again to finish the rest.' });
  timer = setInterval(() => void processTopicAnalysisJob(), 5_000);
  timer.unref();
}
