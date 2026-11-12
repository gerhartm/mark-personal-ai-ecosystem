import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The direct OpenAI route, against a stand-in for OpenAI's Responses API that
 * runs in place of fetch. Hermes is a mock that records whether it was called.
 */
const hermes = vi.hoisted(() => ({ calls: 0, answer: '{"ok":true}' }));
vi.mock('../src/hermes-client.js', () => ({
  runHermesAgent: vi.fn(),
  generateWithHermes: vi.fn(async () => { hermes.calls++; return hermes.answer; }),
}));

type Call = { method: string; path: string; body: any; auth: string | null };
const openai = {
  calls: [] as Call[],
  /** What each check on a response returns, in order; the last one repeats. */
  checks: [] as Array<Record<string, unknown> | Error>,
  create: null as null | ((body: any) => { status: number; body: unknown }),
};
const KEY = 'sk-test-0123456789abcdefghijklmnop';
const completed = (text: string) => ({
  id: 'resp_1', status: 'completed',
  output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text }] }],
  usage: { input_tokens: 1200, output_tokens: 900, output_tokens_details: { reasoning_tokens: 700 } },
});

const folder = mkdtempSync(join(tmpdir(), 'crypto-ai-client-'));
let ai: typeof import('../src/ai-client.js');
let organization: typeof import('../src/topic-organization.js');
let database: typeof import('../src/db.js');

beforeAll(async () => {
  copyFileSync(resolve('../data/crypto-intelligence.db'), join(folder, 'test.db'));
  process.env.CRYPTO_DB = join(folder, 'test.db');
  process.env.OPENAI_API_KEY = KEY;
  process.env.OPENAI_BASE_URL = 'https://openai.test/v1';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('https://openai.test/v1', '');
    const call = { method: init.method ?? 'GET', path, body: init.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init.headers).get('authorization') };
    openai.calls.push(call);
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (call.method === 'POST' && path === '/responses') {
      const created = openai.create?.(call.body) ?? { status: 200, body: { id: 'resp_1', status: 'queued' } };
      if (created.body instanceof Error) throw created.body;
      return reply(created.status, created.body);
    }
    if (call.method === 'GET' && path === '/responses/resp_1') {
      const next = openai.checks.length > 1 ? openai.checks.shift()! : openai.checks[0];
      if (next instanceof Error) throw next;
      return reply(200, next);
    }
    if (path === '/responses/resp_1/cancel') return reply(200, { id: 'resp_1', status: 'cancelled' });
    if (call.method === 'DELETE') return reply(200, { id: 'resp_1', deleted: true });
    return reply(404, { error: { code: 'not_found', message: 'unknown path' } });
  }));
  database = await import('../src/db.js');
  ai = await import('../src/ai-client.js');
  organization = await import('../src/topic-organization.js');
  ai.openAITiming.pollMs = 1;
});
afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  database?.db.close();
  rmSync(folder, { recursive: true, force: true });
});
beforeEach(() => {
  openai.calls = [];
  openai.checks = [{ id: 'resp_1', status: 'in_progress' }, completed('{"thesis":"ok"}')];
  openai.create = null;
  hermes.calls = 0;
});

const failureOf = async (task = 'crypto_analysis') => organization.classifyHermesFailure(await ai.generate('x', { task, instructions: ['Return JSON only.'] }).catch((error) => error));

describe('the direct OpenAI route', () => {
  it('runs a long job in background mode, checks back until it finishes, and deletes the stored answer', async () => {
    const text = await ai.generate('TOPIC\n{"key":"a"}', { task: 'crypto_analysis', instructions: ['Write an analysis.', 'Return JSON only.'], maxTokens: 24_000, timeoutMs: 900_000 });
    expect(text).toBe('{"thesis":"ok"}');
    expect(hermes.calls).toBe(0);
    const created = openai.calls[0];
    expect(created).toMatchObject({ method: 'POST', path: '/responses', auth: `Bearer ${KEY}` });
    expect(created.body).toEqual({
      model: 'gpt-6-astra', instructions: 'Write an analysis.\n\nReturn JSON only.', input: 'TOPIC\n{"key":"a"}',
      reasoning: { effort: 'high' }, text: { format: { type: 'json_object' } }, background: true, store: true,
    });
    expect(openai.calls.filter((call) => call.method === 'GET')).toHaveLength(2);
    await new Promise((done) => setTimeout(done, 5));
    expect(openai.calls.some((call) => call.method === 'DELETE' && call.path === '/responses/resp_1')).toBe(true);
    const job = ai.aiConnection().jobs.find((item) => item.task === 'crypto_analysis')!;
    expect(job.effective).toBe('openai');
    expect(job.week).toMatchObject({ calls: 1, failures: 0, input: 1200, output: 900, reasoning: 700 });
    expect(job.last).toMatchObject({ ok: true, via: 'openai', model: 'gpt-6-astra' });
  });

  it('keeps checking through a dropped connection, since the answer keeps running on OpenAI', async () => {
    openai.checks = [new TypeError('fetch failed'), { id: 'resp_1', status: 'in_progress' }, completed('{"a":1}')];
    expect(await ai.generate('x', { task: 'crypto_topics', instructions: [] })).toBe('{"a":1}');
  });

  it('reports provider failures in the wording the topic and analysis jobs already handle', async () => {
    openai.create = () => ({ status: 429, body: { error: { code: 'insufficient_quota', message: 'You exceeded your current quota.' } } });
    expect(await failureOf()).toBe('quota');
    openai.create = () => ({ status: 429, body: { error: { code: 'rate_limit_exceeded', message: 'Rate limit reached.' } } });
    expect(await failureOf()).toBe('rate_limit');
    openai.create = () => ({ status: 401, body: { error: { code: 'invalid_api_key', message: 'Incorrect API key provided: sk-proj-****abcd.' } } });
    expect(await failureOf()).toBe('auth');
    // The usage record keeps a fixed label and OpenAI's code, never the provider's message (which can quote part of a key).
    expect(ai.aiConnection().jobs.find((item) => item.task === 'crypto_analysis')!.last?.error).toBe('key refused, OpenAI 401 invalid_api_key');
    openai.create = () => ({ status: 200, body: new TypeError('fetch failed') });
    expect(await failureOf()).toBe('connection');
    openai.create = null;
    openai.checks = [{ id: 'resp_1', status: 'failed', error: { code: 'server_error', message: 'boom' } }];
    expect(await failureOf()).toBe('error');
    openai.checks = [{ id: 'resp_1', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }];
    expect(await failureOf()).toBe('empty');
    // Failures are counted.
    const job = ai.aiConnection().jobs.find((item) => item.task === 'crypto_analysis')!;
    expect(job.week.failures).toBeGreaterThanOrEqual(6);
    expect(job.last?.error).toBe('empty answer');
    expect(JSON.stringify(ai.aiConnection())).not.toContain(KEY);
  });

  it('cancels a request that stays queued too long or runs past its time limit', async () => {
    const saved = { ...ai.openAITiming };
    openai.checks = [{ id: 'resp_1', status: 'queued' }];
    ai.openAITiming.queuedLimitMs = 5;
    try {
      expect(await failureOf()).toBe('timeout');
      expect(openai.calls.some((call) => call.path === '/responses/resp_1/cancel')).toBe(true);
    } finally {
      Object.assign(ai.openAITiming, saved);
    }
    openai.calls = [];
    openai.checks = [{ id: 'resp_1', status: 'in_progress' }];
    const error = await ai.generateWithOpenAI('x', { instructions: [], model: 'gpt-6-astra', reasoning: 'high', timeoutMs: 5 }).catch((caught) => caught);
    expect(organization.classifyHermesFailure(error)).toBe('timeout');
    expect(openai.calls.some((call) => call.path === '/responses/resp_1/cancel')).toBe(true);
  });

  it('reads the answer text from message items only', () => {
    expect(ai.outputText(completed('{"x":1}') as any)).toBe('{"x":1}');
    expect(ai.outputText({ id: 'r', status: 'completed', output: [{ type: 'reasoning' }] } as any)).toBe('');
  });
});

describe('choosing the route', () => {
  it('goes through Hermes when a job is set to Hermes, when no key is set, and for every other job', async () => {
    ai.saveAiRoutes('mark', { crypto_topics: { via: 'hermes', model: 'gpt-6-astra', reasoning: 'high' } });
    expect(await ai.generate('x', { task: 'crypto_topics', instructions: [] })).toBe(hermes.answer);
    expect(hermes.calls).toBe(1);
    expect(openai.calls).toHaveLength(0);
    expect(await ai.generate('x', { task: 'crypto_claims', instructions: [] })).toBe(hermes.answer);
    delete process.env.OPENAI_API_KEY;
    try {
      expect(ai.effectiveRoute('crypto_analysis')).toMatchObject({ via: 'hermes', reason: 'no_key', model: 'gpt-6-astra' });
      expect(ai.aiConnection()).toMatchObject({ key: false });
      await ai.generate('x', { task: 'crypto_analysis', instructions: [] });
      expect(openai.calls).toHaveLength(0);
      expect(hermes.calls).toBe(3);
    } finally {
      process.env.OPENAI_API_KEY = KEY;
    }
    ai.saveAiRoutes('mark', { crypto_topics: { via: 'openai', model: 'gpt-6-astra', reasoning: 'high' } });
  });

  it('reads the key from a mounted file before the environment', () => {
    const file = join(folder, 'openai-key');
    writeFileSync(file, `${KEY}-from-file\n`);
    process.env.OPENAI_API_KEY_FILE = file;
    try {
      expect(ai.openAIConfigured()).toBe(true);
    } finally {
      delete process.env.OPENAI_API_KEY_FILE;
    }
    process.env.OPENAI_API_KEY_FILE = join(folder, 'missing');
    try {
      expect(ai.openAIConfigured()).toBe(false);
    } finally {
      delete process.env.OPENAI_API_KEY_FILE;
    }
  });

  it('uses the model and reasoning chosen for each job, refuses unknown ones, and records the change', async () => {
    ai.saveAiRoutes('mark', { crypto_analysis: { via: 'openai', model: 'gpt-5.6-sol', reasoning: 'medium' } });
    await ai.generate('x', { task: 'crypto_analysis', instructions: [] });
    expect(openai.calls[0].body).toMatchObject({ model: 'gpt-5.6-sol', reasoning: { effort: 'medium' } });
    expect(() => ai.saveAiRoutes('mark', { crypto_analysis: { via: 'openai', model: 'gpt-9', reasoning: 'high' } })).toThrow(ai.AiConfigurationError);
    expect(() => ai.saveAiRoutes('mark', { crypto_analysis: { via: 'openai', model: 'gpt-6-astra', reasoning: 'max' } })).toThrow(/low, medium or high/);
    expect(() => ai.saveAiRoutes('mark', { crypto_nothing: { via: 'openai', model: 'gpt-6-astra', reasoning: 'high' } })).toThrow(/Unknown job/);
    expect(ai.aiRoutes().crypto_analysis).toEqual({ via: 'openai', model: 'gpt-5.6-sol', reasoning: 'medium' });
    const audit = database.one<any>("SELECT action, detail_json FROM audit_log WHERE action='ai.routes' ORDER BY id DESC LIMIT 1")!;
    expect(JSON.parse(audit.detail_json).after.crypto_analysis.model).toBe('gpt-5.6-sol');
    ai.saveAiRoutes('mark', { crypto_analysis: { via: 'openai', model: 'gpt-6-astra', reasoning: 'high' } });
  });

  it('tests a route with a small request', async () => {
    openai.checks = [completed('{"ok": true}')];
    expect(await ai.testAiRoute('crypto_analysis')).toMatchObject({ ok: true, via: 'openai', model: 'gpt-6-astra' });
    await expect(ai.testAiRoute('nope')).rejects.toThrow(/Unknown job/);
  });
});
