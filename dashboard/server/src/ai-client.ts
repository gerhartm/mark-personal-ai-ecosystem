import { readFileSync } from 'node:fs';
import { audit, one, run } from './db.js';
import { generateWithHermes, type HermesGenerationOptions } from './hermes-client.js';

/**
 * Where the site's long AI jobs run.
 *
 * Hermes is the central brain and answers everything by default, but its
 * one-shot calls end any answer that shows no progress for 60 seconds, which a
 * reasoning model working on a large request often needs. Topic sorting and
 * analysis pages can therefore go straight to OpenAI instead: the request runs
 * in OpenAI's background mode and the site checks back until it is done, with
 * no 60-second limit. Each job's route, model and reasoning level are chosen in
 * Control Center. Without an OpenAI key every job goes through Hermes, and a
 * failed direct call is reported, never quietly sent elsewhere.
 */
/** Why an AI call (through Hermes or OpenAI) produced no answer. Only these fixed descriptions are shown; provider messages never are. */
export type HermesFailure = 'timeout' | 'empty' | 'quota' | 'rate_limit' | 'auth' | 'connection' | 'error';
const FAILURE_TEXT: Record<HermesFailure, string> = {
  timeout: 'The AI took longer than the time limit to answer.',
  empty: 'The AI returned an empty answer, which usually means the request was too large.',
  quota: 'The AI provider reported that the account is out of credits.',
  rate_limit: 'The AI provider reported a rate limit.',
  auth: 'The AI provider refused the API key.',
  connection: 'The AI service could not be reached.',
  error: 'The AI service returned an error.',
};
export const failureText = (failure: HermesFailure | null | undefined) => (failure ? FAILURE_TEXT[failure] : '');

export function classifyHermesFailure(error: unknown): HermesFailure {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (/timeout|timed out/i.test(text)) return 'timeout';
  // Hermes ends a streamed answer that shows no progress for 60 seconds ("stalled", "produced no
  // output"), and the cut-off also breaks a call running beside it ("Broken pipe"). Hermes then falls
  // back to its main model, which rejects the task's reasoning setting; that 400 is what arrives here.
  // All of these mean the answer took too long.
  if (/stalled|produced no output|no-progress|broken pipe|unknown parameter: 'reasoning'/i.test(text)) return 'timeout';
  if (/empty response/i.test(text)) return 'empty';
  if (/insufficient_quota|quota|billing|credit/i.test(text)) return 'quota';
  if (/\b429\b|rate.?limit/i.test(text)) return 'rate_limit';
  if (/\b401\b|invalid_api_key|incorrect api key|no openai key/i.test(text)) return 'auth';
  if (/websocket|socket|ECONN|ENOTFOUND|ticket|login|fetch failed|network/i.test(text)) return 'connection';
  return 'error';
}

const FAILURE_LABEL: Record<HermesFailure, string> = {
  timeout: 'time limit', empty: 'empty answer', quota: 'out of credits', rate_limit: 'rate limit',
  auth: 'key refused', connection: 'unreachable', error: 'error',
};
/**
 * What a usage record keeps about a failed call: the kind of failure, plus
 * OpenAI's status and code when it sent them ("rate limit, OpenAI 429
 * rate_limit_exceeded"). Never a provider's own message, which can quote part of a key.
 */
export function failureLabel(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? '');
  const code = /^OpenAI (\d{3} [\w.-]+)/.exec(text)?.[1];
  return `${FAILURE_LABEL[classifyHermesFailure(error)]}${code ? `, OpenAI ${code}` : ''}`;
}

export const AI_JOBS = [
  { task: 'crypto_topics', label: 'Topic sorting', detail: 'Filing new claims, grouping waiting claims, rebuilds and previews' },
  { task: 'crypto_analysis', label: 'Analysis pages', detail: 'One call per topic page' },
] as const;
export type AiTask = (typeof AI_JOBS)[number]['task'];
export const AI_MODELS = ['gpt-6-astra', 'gpt-5.6-sol'] as const;
export const AI_REASONING = ['low', 'medium', 'high'] as const;
export type AiRoute = { via: 'openai' | 'hermes'; model: (typeof AI_MODELS)[number]; reasoning: (typeof AI_REASONING)[number] };

const DEFAULT_ROUTE: AiRoute = { via: 'openai', model: 'gpt-6-astra', reasoning: 'high' };
const ROUTES_KEY = 'ai.routes';
const USAGE_KEY = 'ai.usage';
const USAGE_DAYS = 30;

/** Waiting between checks on a background answer, the longest an answer may stay queued, and per-job time limits. */
export const openAITiming = { pollMs: 4_000, queuedLimitMs: 5 * 60_000, httpTimeoutMs: 60_000 };
const OPENAI_TIME_LIMIT: Record<string, number> = { crypto_topics: 25 * 60_000, crypto_analysis: 30 * 60_000 };

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigurationError';
  }
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

const isTask = (value: unknown): value is AiTask => AI_JOBS.some((job) => job.task === value);

export function aiRoutes(): Record<AiTask, AiRoute> {
  let saved: Partial<Record<AiTask, Partial<AiRoute>>> = {};
  try {
    saved = JSON.parse(one<{ value: string }>('SELECT value FROM app_settings WHERE key=?', ROUTES_KEY)?.value ?? '{}');
  } catch {
    saved = {};
  }
  return Object.fromEntries(AI_JOBS.map((job) => [job.task, { ...DEFAULT_ROUTE, ...(saved[job.task] ?? {}) }])) as Record<AiTask, AiRoute>;
}

/** Validates and saves every job's route; an unknown model or reasoning level is refused, not guessed. */
export function saveAiRoutes(actor: string, input: unknown) {
  if (!input || typeof input !== 'object') throw new AiConfigurationError('Send a route for each job.');
  const current = aiRoutes();
  const next = { ...current };
  for (const [task, value] of Object.entries(input as Record<string, any>)) {
    if (!isTask(task)) throw new AiConfigurationError(`Unknown job: ${task}.`);
    const via = value?.via;
    const model = value?.model;
    const reasoning = value?.reasoning;
    if (via !== 'openai' && via !== 'hermes') throw new AiConfigurationError('Choose OpenAI direct or Hermes.');
    if (!AI_MODELS.includes(model)) throw new AiConfigurationError(`Choose one of these models: ${AI_MODELS.join(', ')}.`);
    if (!AI_REASONING.includes(reasoning)) throw new AiConfigurationError('Choose low, medium or high reasoning.');
    next[task] = { via, model, reasoning };
  }
  run('INSERT OR REPLACE INTO app_settings(key,value) VALUES (?,?)', ROUTES_KEY, JSON.stringify(next));
  audit(actor, 'ai.routes', ROUTES_KEY, { before: current, after: next });
  return next;
}

/* ------------------------------------------------------------------ *
 * The OpenAI key
 * ------------------------------------------------------------------ */

/** The key from OPENAI_API_KEY_FILE (a mounted secret file), else OPENAI_API_KEY. Never logged or returned. */
function openAIKey() {
  const file = process.env.OPENAI_API_KEY_FILE?.trim();
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim();
    } catch {
      return '';
    }
  }
  return process.env.OPENAI_API_KEY?.trim() ?? '';
}

export const openAIConfigured = () => openAIKey().length >= 20;
const apiBase = () => (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');

type EffectiveRoute = { via: 'openai' | 'hermes'; model?: string; reasoning?: string; reason: '' | 'no_key' };

/** Which route a job will take right now: a direct route without a key falls back to Hermes, and says so. */
export function effectiveRoute(task: string | undefined): EffectiveRoute {
  if (!isTask(task)) return { via: 'hermes', reason: '' };
  const route = aiRoutes()[task];
  if (route.via === 'openai' && !openAIConfigured()) return { via: 'hermes', model: route.model, reasoning: route.reasoning, reason: 'no_key' };
  return { ...route, reason: '' };
}

/* ------------------------------------------------------------------ *
 * Usage
 * ------------------------------------------------------------------ */

type DayUsage = { calls: number; failures: number; input: number; output: number; reasoning: number; seconds: number };
type JobUsage = { days: Record<string, DayUsage>; last?: { at: string; ok: boolean; via: string; model?: string; seconds: number; error?: string } };

function readUsage(): Record<string, JobUsage> {
  try {
    return JSON.parse(one<{ value: string }>('SELECT value FROM app_settings WHERE key=?', USAGE_KEY)?.value ?? '{}');
  } catch {
    return {};
  }
}

function recordUsage(task: string, entry: { ok: boolean; via: string; model?: string; seconds: number; error?: unknown; input?: number; output?: number; reasoning?: number }) {
  if (!isTask(task)) return;
  const usage = readUsage();
  const job = usage[task] ?? { days: {} };
  const day = new Date().toISOString().slice(0, 10);
  const today = job.days[day] ?? { calls: 0, failures: 0, input: 0, output: 0, reasoning: 0, seconds: 0 };
  today.calls += 1;
  if (!entry.ok) today.failures += 1;
  today.input += entry.input ?? 0;
  today.output += entry.output ?? 0;
  today.reasoning += entry.reasoning ?? 0;
  today.seconds += Math.round(entry.seconds);
  job.days[day] = today;
  for (const old of Object.keys(job.days).sort().slice(0, -USAGE_DAYS)) delete job.days[old];
  job.last = { at: new Date().toISOString(), ok: entry.ok, via: entry.via, model: entry.model, seconds: Math.round(entry.seconds), ...(entry.ok ? {} : { error: failureLabel(entry.error) }) };
  usage[task] = job;
  run('INSERT OR REPLACE INTO app_settings(key,value) VALUES (?,?)', USAGE_KEY, JSON.stringify(usage));
}

/** Each job's route, what it will actually use, and its calls and tokens over the last seven days. */
export function aiConnection() {
  const routes = aiRoutes();
  const usage = readUsage();
  const since = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  return {
    key: openAIConfigured(),
    models: AI_MODELS,
    reasoning: AI_REASONING,
    jobs: AI_JOBS.map((job) => {
      const days = Object.entries(usage[job.task]?.days ?? {}).filter(([day]) => day >= since).map(([, value]) => value);
      const sum = (field: keyof DayUsage) => days.reduce((total, value) => total + (value[field] ?? 0), 0);
      return {
        ...job,
        route: routes[job.task],
        effective: effectiveRoute(job.task).via,
        week: { calls: sum('calls'), failures: sum('failures'), input: sum('input'), output: sum('output'), reasoning: sum('reasoning'), seconds: sum('seconds') },
        last: usage[job.task]?.last ?? null,
      };
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

export type AiGenerationOptions = HermesGenerationOptions & { task: string };

/**
 * Sends one request along the job's route and returns the answer text. Errors
 * keep the wording the topic and analysis code already classifies (time limit,
 * rate limit, credits, connection), so retries and splitting work on both routes.
 */
export async function generate(input: string, options: AiGenerationOptions): Promise<string> {
  const route = effectiveRoute(options.task);
  const started = Date.now();
  if (route.via === 'hermes') {
    try {
      const text = await generateWithHermes(input, options);
      recordUsage(options.task, { ok: true, via: 'hermes', seconds: (Date.now() - started) / 1000 });
      return text;
    } catch (error) {
      recordUsage(options.task, { ok: false, via: 'hermes', seconds: (Date.now() - started) / 1000, error });
      throw error;
    }
  }
  const model = route.model ?? DEFAULT_ROUTE.model;
  const reasoning = route.reasoning ?? DEFAULT_ROUTE.reasoning;
  try {
    const answer = await generateWithOpenAI(input, { instructions: options.instructions ?? [], model, reasoning, timeoutMs: OPENAI_TIME_LIMIT[options.task] ?? 20 * 60_000 });
    recordUsage(options.task, { ok: true, via: 'openai', model, seconds: (Date.now() - started) / 1000, ...answer.usage });
    return answer.text;
  } catch (error) {
    recordUsage(options.task, { ok: false, via: 'openai', model, seconds: (Date.now() - started) / 1000, error });
    throw error;
  }
}

type OpenAIResponse = {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'incomplete' | 'cancelled' | string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  error?: { code?: string; message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openAIRequest<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const key = openAIKey();
  if (!key) throw new AiConfigurationError('No OpenAI key is set on the server.');
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: init.method,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(openAITiming.httpTimeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    // An HTTP request that hangs is a connection problem; the job's own time limit is reported separately.
    throw new Error(`OpenAI network error (fetch failed): ${reason.replace(/timeout/gi, 'stall')}`);
  }
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const code = body?.error?.code || body?.error?.type || 'error';
    const message = String(body?.error?.message ?? text ?? '').slice(0, 300);
    throw new Error(`OpenAI ${response.status} ${code}: ${message}`);
  }
  return body as T;
}

/** The text of a finished response: every output_text part of its message items. */
export function outputText(response: OpenAIResponse) {
  return (response.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

/**
 * One request in OpenAI's background mode: create it, check back until it
 * finishes, read the answer, then delete the stored copy. The answer is asked
 * for as JSON. A request still queued after five minutes, or unfinished at the
 * job's time limit, is cancelled and reported as over the time limit.
 */
export async function generateWithOpenAI(input: string, options: { instructions: string[]; model: string; reasoning: string; timeoutMs: number }) {
  const started = Date.now();
  const created = await openAIRequest<OpenAIResponse>('/responses', {
    method: 'POST',
    body: {
      model: options.model,
      instructions: options.instructions.join('\n\n'),
      input,
      reasoning: { effort: options.reasoning },
      text: { format: { type: 'json_object' } },
      background: true,
      // Stored so a long answer can still be read when it finishes; deleted as soon as it has been read.
      store: true,
    },
  });
  let response = created;
  let networkErrors = 0;
  while (response.status === 'queued' || response.status === 'in_progress') {
    const elapsed = Date.now() - started;
    if (elapsed > options.timeoutMs || (response.status === 'queued' && elapsed > openAITiming.queuedLimitMs)) {
      await openAIRequest(`/responses/${created.id}/cancel`, { method: 'POST' }).catch(() => undefined);
      throw new Error(`OpenAI request timeout: no answer after ${Math.round(elapsed / 60_000)} minutes (${response.status}).`);
    }
    await pause(openAITiming.pollMs);
    try {
      response = await openAIRequest<OpenAIResponse>(`/responses/${created.id}`, { method: 'GET' });
      networkErrors = 0;
    } catch (error) {
      // A dropped check does not lose the answer, which keeps running on OpenAI's side.
      if (++networkErrors >= 5) throw error;
    }
  }
  void openAIRequest(`/responses/${created.id}`, { method: 'DELETE' }).catch(() => undefined);
  const usage = {
    input: response.usage?.input_tokens ?? 0,
    output: response.usage?.output_tokens ?? 0,
    reasoning: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
  };
  if (response.status === 'completed') {
    const text = outputText(response);
    if (!text) throw new Error('OpenAI returned an empty response.');
    return { text, usage };
  }
  if (response.status === 'incomplete') throw new Error(`OpenAI returned an empty response: the answer was incomplete (${response.incomplete_details?.reason ?? 'unknown reason'}).`);
  if (response.status === 'cancelled') throw new Error('OpenAI request timeout: the request was cancelled before it finished.');
  throw new Error(`OpenAI ${response.error?.code ?? 'error'}: ${response.error?.message ?? `the request ended as ${response.status}`}`);
}

/** A small request along a job's route, to check the key, model and reasoning setting before a long run. */
export async function testAiRoute(task: string) {
  if (!isTask(task)) throw new AiConfigurationError(`Unknown job: ${task}.`);
  const route = effectiveRoute(task);
  const started = Date.now();
  const text = await generate('Reply with the JSON object {"ok": true}.', {
    task, instructions: ['You check that a connection works. Return JSON only.'], maxTokens: 200, timeoutMs: 120_000, temperature: 0,
  });
  let ok = false;
  try {
    ok = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))?.ok === true;
  } catch {
    ok = false;
  }
  return { ok, via: route.via, model: route.via === 'openai' ? route.model ?? null : null, seconds: Math.round((Date.now() - started) / 100) / 10 };
}
