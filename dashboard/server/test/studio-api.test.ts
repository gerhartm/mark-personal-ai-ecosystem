import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SOURCE_DB = resolve(ROOT, '..', 'data', 'crypto-intelligence.db');
const TEMP_DIR = mkdtempSync(join(tmpdir(), 'mark-crypto-studio-'));
const TEMP_DB = join(TEMP_DIR, 'crypto-intelligence.db');

let mock: Server;
let app: ChildProcessWithoutNullStreams;
let base = '';
let appOutput = '';
let generated = '';
let knownEvent = '';
let lastPrompt = '';
let requestSequence = 1;

const speakingDraft = (claim: string, eventId: string) => [
  '## Thesis',
  `${claim} [${eventId}]`,
  '## Talking points',
  `One grounded point [${eventId}]`,
  '## Evidence to cite',
  `Use the preserved record [${eventId}]`,
  '## Likely questions and concise answers',
  `What supports this? The preserved record [${eventId}]`,
  '## Counterarguments',
  `Keep uncertainty explicit [${eventId}]`,
  '## Closing takeaway',
  `Return to the verified thesis [${eventId}]`,
].join('\n\n');

async function freePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // The child has not started listening yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`isolated Studio dashboard did not start\n${appOutput}`);
}

async function postDraft(writingLens = 'mark') {
  const response = await fetch(`${base}/api/studio/drafts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `198.51.100.${requestSequence++}`,
    },
    body: JSON.stringify({
      template_type: 'speaking_prep',
      focus: 'Aave protocol risk',
      writing_lens: writingLens,
    }),
  });
  return { response, body: await response.json() as any };
}

beforeAll(async () => {
  copyFileSync(SOURCE_DB, TEMP_DB);
  const fixture = new Database(TEMP_DB, { readonly: true });
  knownEvent = (fixture.prepare('SELECT id FROM events ORDER BY id LIMIT 1').get() as any).id;
  fixture.close();
  generated = speakingDraft('Verified briefing based on the preserved record', knownEvent);

  const sockets = new WebSocketServer({ noServer: true });
  sockets.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const request = JSON.parse(String(raw));
      if (request.method === 'session.create') {
        socket.send(JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { session_id: 'studio-test-session' },
        }));
        return;
      }
      if (request.method === 'prompt.submit') {
        lastPrompt = request.params.text;
        if (generated === 'STRUCTURED_PREP') {
          const evidenceId = lastPrompt.match(/"id":"(\d{4}-\d{2}-\d{2}-\d{4}|sha256:[a-f0-9]{64})"/)?.[1];
          generated = JSON.stringify({ overview: 'The retained sources identify a specific operating constraint in protocol lending. The preparation brief keeps the mechanism and the remaining uncertainty visible.', suggested_tangents: ['liquidity', 'governance'], points: Array.from({length:3}, (_, n) => ({ title: `Supported mechanism ${n+1}`, body: 'The retained source supports a narrow mechanism in protocol lending and leaves broader market effects uncertain.', detail: ['A specific retained record supports this mechanism and provides context for the claim.'], counter: 'The record does not establish whether the effect persists across market cycles.', citations: [{ id: evidenceId, quote: null, inference: 'The retained record supplies the mechanism described in this point.' }] })) });
        }
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'accepted' } }));
        socket.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'event',
          params: {
            type: 'message.complete',
            session_id: request.params.session_id,
            payload: { text: generated, status: 'complete', usage: { total_tokens: 100 } },
          },
        }));
      }
    });
  });
  mock = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST' && url.pathname === '/auth/password-login') {
      response.setHeader('set-cookie', 'hermes-test=session; HttpOnly; Path=/');
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/ws-ticket') {
      response.end(JSON.stringify({ ticket: 'studio-test-ticket' }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  });
  mock.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/api/ws' || url.searchParams.get('ticket') !== 'studio-test-ticket') {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (websocket) => sockets.emit('connection', websocket, request));
  });

  const mockPort = await freePort();
  await new Promise<void>((resolveListen) => mock.listen(mockPort, '127.0.0.1', resolveListen));
  const appPort = await freePort();
  base = `http://127.0.0.1:${appPort}`;
  app = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(appPort),
      CRYPTO_DB: TEMP_DB,
      HERMES_BASE_URL: `http://127.0.0.1:${mockPort}`,
      HERMES_DASHBOARD_USERNAME: 'studio-test',
      HERMES_DASHBOARD_PASSWORD: 'test-only-password',
      OPENVIKING_BASE_URL: '',
    },
    stdio: 'pipe',
  });
  app.stdout.on('data', (chunk) => { appOutput += chunk.toString(); });
  app.stderr.on('data', (chunk) => { appOutput += chunk.toString(); });
  await waitForHealth();
});

afterAll(async () => {
  if (app && !app.killed) app.kill('SIGTERM');
  if (mock) await new Promise<void>((resolveClose) => mock.close(() => resolveClose()));
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe('Hermes-powered Studio boundary', () => {
  it('generates, validates, and atomically saves a cited draft', async () => {
    const status = await (await fetch(`${base}/api/studio/status`)).json() as any;
    expect(status.connected).toBe(true);
    expect(status.writing_lenses).toEqual(['mark', 'creator_reference']);

    const result = await postDraft();
    expect(result.response.status).toBe(200);
    expect(result.body.writing_lens).toBe('mark');
    expect(result.body.citations).toEqual(expect.arrayContaining([expect.objectContaining({ id: knownEvent })]));

    const db = new Database(TEMP_DB, { readonly: true });
    const draft = db.prepare('SELECT * FROM content_drafts WHERE id = ?').get(result.body.id) as any;
    const revisions = db.prepare('SELECT * FROM draft_revisions WHERE draft_id = ?').all(result.body.id) as any[];
    expect(draft.origin).toBe('ingested');
    expect(draft.raw_output).toBe(generated);
    expect(lastPrompt.startsWith('/crypto-intelligence /humanized-content')).toBe(true);
    expect((db.prepare('SELECT value FROM generation_meta WHERE key = ?').get(`draft_lens:${result.body.id}`) as any).value).toBe('mark');
    expect(revisions).toHaveLength(1);
    expect(revisions[0].revision).toBe(0);
    expect(revisions[0].author).toBe('Hermes');
    expect((db.prepare("SELECT count(*) count FROM search_index WHERE canonical_id = ? AND kind = 'draft'").get(result.body.id) as any).count).toBe(1);
    expect((db.pragma('foreign_key_check') as unknown[]).length).toBe(0);
    db.close();
  });

  it('routes Creator Reference through the native context skill and records the lens', async () => {
    generated = speakingDraft('Creator-lens draft grounded in the preserved record', knownEvent);
    const result = await postDraft('creator_reference');
    expect(result.response.status).toBe(200);
    expect(result.body.writing_lens).toBe('creator_reference');
    expect(lastPrompt.startsWith('/creator-reference /humanized-content')).toBe(true);
    expect(lastPrompt).toContain('WRITING LENS\nCreator Reference');

    const stored = await (await fetch(`${base}/api/drafts/${result.body.id}`)).json() as any;
    expect(stored.writing_lens).toBe('creator_reference');
  });

  it('refuses the Creator Reference lens when the corpus is not ready', async () => {
    generated = 'CREATOR_REFERENCE_UNAVAILABLE';
    const result = await postDraft('creator_reference');
    expect(result.response.status).toBe(422);
    expect(result.body.error).toBe('creator_reference_unavailable');
  });

  it('rejects unknown writing lenses before generation', async () => {
    generated = speakingDraft('Safe fallback', knownEvent);
    const result = await postDraft('unknown');
    expect(result.response.status).toBe(400);
    expect(result.body.error).toBe('invalid_writing_lens');
  });

  it('rejects an invented citation and leaves no partial draft', async () => {
    const db = new Database(TEMP_DB, { readonly: true });
    const before = (db.prepare('SELECT count(*) count FROM content_drafts').get() as any).count;
    db.close();
    generated = speakingDraft('Unsupported claim', '2099-01-01-9999');

    const result = await postDraft();
    expect(result.response.status).toBe(503);
    expect(result.body.error).toBe('citations_invalid');

    const afterDb = new Database(TEMP_DB, { readonly: true });
    expect((afterDb.prepare('SELECT count(*) count FROM content_drafts').get() as any).count).toBe(before);
    afterDb.close();
  });

  it('appends an edit without changing the original generation', async () => {
    const db = new Database(TEMP_DB, { readonly: true });
    const draft = db.prepare("SELECT id, raw_output FROM content_drafts WHERE origin = 'ingested' ORDER BY created_at DESC LIMIT 1").get() as any;
    db.close();
    const edited = `Mark's edited interpretation with the original evidence [${knownEvent}].`;
    const response = await fetch(`${base}/api/drafts/${draft.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: edited }),
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).revision).toBe(1);

    const afterDb = new Database(TEMP_DB, { readonly: true });
    const after = afterDb.prepare('SELECT raw_output, edited_output FROM content_drafts WHERE id = ?').get(draft.id) as any;
    const revisions = afterDb.prepare('SELECT revision, body FROM draft_revisions WHERE draft_id = ? ORDER BY revision').all(draft.id) as any[];
    expect(after.raw_output).toBe(draft.raw_output);
    expect(after.edited_output).toBe(edited);
    expect(revisions.map((revision) => revision.revision)).toEqual([0, 1]);
    expect((afterDb.prepare("SELECT count(*) count FROM search_index WHERE canonical_id = ? AND kind = 'draft'").get(draft.id) as any).count).toBe(1);
    afterDb.close();

    const invalid = await fetch(`${base}/api/drafts/${draft.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Edited to include an invented citation [2099-01-01-9999].' }),
    });
    expect(invalid.status).toBe(503);
    expect(((await invalid.json()) as any).error).toBe('citations_invalid');
    const finalDb = new Database(TEMP_DB, { readonly: true });
    expect((finalDb.prepare('SELECT count(*) count FROM draft_revisions WHERE draft_id = ?').get(draft.id) as any).count).toBe(2);
    finalDb.close();
  });
});


describe('saved structured workflows', () => {
  it('persists complete panels, citations and inputs for reopening a brief', async () => {
    generated = 'STRUCTURED_PREP';
    const response = await fetch(`${base}/api/prep`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.201' }, body: JSON.stringify({ topic: 'Aave protocol risk', lens: 1, tangents: ['liquidity'] }) });
    const result = await response.json() as any;
    expect(response.status, JSON.stringify(result)).toBe(200);
    const stored = await (await fetch(`${base}/api/workflows/${result.id}`)).json() as any;
    expect(stored.revisions[0].result).toEqual(result);
    expect(stored.revisions[0].input).toMatchObject({ topic: 'Aave protocol risk', lens: 1, tangents: ['liquidity'] });
    expect(stored.draft.revisions[0].body).toContain(result.points[0].title);
    const list = await (await fetch(`${base}/api/workflows`)).json() as any;
    expect(list.results.find((row: any) => row.id === result.id).kind).toBe('prep');
    const connection = new Database(TEMP_DB, { readonly: true });
    expect(connection.prepare('SELECT count(*) n FROM workflow_results WHERE draft_id=?').get(result.id)).toEqual({ n: 1 });
    expect(connection.pragma('foreign_key_check')).toEqual([]);
    connection.close();
  });
});
