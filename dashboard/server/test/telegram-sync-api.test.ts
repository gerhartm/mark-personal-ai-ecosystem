import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SOURCE_DB = resolve(ROOT, '..', 'data', 'crypto-intelligence.db');
const TEMP_DIR = mkdtempSync(join(tmpdir(), 'mark-telegram-sync-'));
const TEMP_DB = join(TEMP_DIR, 'crypto-intelligence.db');
const SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
const EXTERNAL_ID = 'telegram:test:9001';
const OPENVIKING_URI = 'viking://user/hermes/resources/crypto-intelligence/telegram-test-9001';
const UNIQUE_TERM = 'terminalsyncproof';
const SOURCE_BODY = `${'Full podcast transcript evidence. '.repeat(4_500)} ${UNIQUE_TERM}`;

let mock: Server;
let app: ChildProcessWithoutNullStreams;
let base = '';
let appOutput = '';

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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`isolated dashboard did not start\n${appOutput}`);
}

async function status() {
  const response = await fetch(
    `${base}/api/internal/telegram-sync/${encodeURIComponent(EXTERNAL_ID)}`,
    { headers: { authorization: `Bearer ${SECRET}` } },
  );
  return { response, body: await response.json() as any };
}

beforeAll(async () => {
  copyFileSync(SOURCE_DB, TEMP_DB);
  mock = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET' && url.pathname === '/api/v1/fs/tree') {
      response.end(JSON.stringify({
        status: 'success',
        result: [{ uri: `${OPENVIKING_URI}/transcript.md`, isDir: false }],
      }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/content/read') {
      response.end(JSON.stringify({ status: 'success', result: SOURCE_BODY }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ status: 'error', error: { code: 'not_found' } }));
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
      OPENVIKING_BASE_URL: `http://127.0.0.1:${mockPort}`,
      OPENVIKING_API_KEY: 'test-only-openviking-key',
      SATOSHI_DASHBOARD_SYNC_SECRET: SECRET,
      HERMES_BASE_URL: '',
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

describe('Satoshi source synchronization', () => {
  it('rejects missing internal credentials', async () => {
    const response = await fetch(`${base}/api/internal/telegram-sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(401);
  });

  it('queues, registers, indexes and deduplicates one complete Telegram source', async () => {
    const packet = {
      external_id: EXTERNAL_ID,
      title: 'Complete Telegram podcast transcript',
      source_type: 'podcast',
      source_url: 'https://t.me/example/9001?utm_source=test',
      openviking_uri: OPENVIKING_URI,
      captured_at: '2026-08-11T10:00:00Z',
    };
    const first = await fetch(`${base}/api/internal/telegram-sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(packet),
    });
    expect(first.status).toBe(202);

    let job: any = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      job = (await status()).body;
      if (job.status === 'ready') break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    expect(job.status).toBe('ready');
    expect(job.canonical_id).toMatch(/^sha256:/);

    const search = await fetch(`${base}/api/search?q=${UNIQUE_TERM}`);
    const searchBody = await search.json() as any;
    expect(searchBody.results.some((row: any) => row.canonical_id === job.canonical_id)).toBe(true);

    const database = new Database(TEMP_DB, { readonly: true });
    const source = database.prepare(
      'SELECT source_channel, source_label FROM sources WHERE source_id=?',
    ).get(job.canonical_id) as any;
    expect(source).toEqual({ source_channel: 'telegram', source_label: 'Satoshi / Telegram' });
    expect(database.prepare(
      "SELECT count(*) count FROM search_index WHERE canonical_id=? AND kind='source' AND search_index MATCH ?",
    ).get(job.canonical_id, `\"${UNIQUE_TERM}\"*`)).toEqual({ count: 1 });
    expect((database.pragma('foreign_key_check') as unknown[]).length).toBe(0);
    database.close();

    const replay = await fetch(`${base}/api/internal/telegram-sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(packet),
    });
    expect(replay.status).toBe(200);
    const replayBody = await replay.json() as any;
    expect(replayBody.canonical_id).toBe(job.canonical_id);

    const verify = new Database(TEMP_DB, { readonly: true });
    expect(verify.prepare('SELECT count(*) count FROM source_sync_jobs WHERE external_id=?').get(EXTERNAL_ID))
      .toEqual({ count: 1 });
    expect(verify.prepare('SELECT count(*) count FROM sources WHERE source_id=?').get(job.canonical_id))
      .toEqual({ count: 1 });
    verify.close();
  });
});
