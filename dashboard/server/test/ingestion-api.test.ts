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
const TEMP_DIR = mkdtempSync(join(tmpdir(), 'mark-crypto-ingestion-'));
const TEMP_DB = join(TEMP_DIR, 'crypto-intelligence.db');
const resources = new Set<string>();
const resourceBodies: Record<string, any>[] = [];
let blockDeletes = false;

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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // The child has not started listening yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`isolated dashboard did not start\n${appOutput}`);
}

async function postCapture(body: Record<string, unknown>) {
  const response = await fetch(`${base}/api/ingestion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() as any };
}

beforeAll(async () => {
  copyFileSync(SOURCE_DB, TEMP_DB);

  mock = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/api/v1/system/status') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'success', result: { state: 'ready' } }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/fs/stat') {
      const uri = url.searchParams.get('uri') ?? '';
      response.setHeader('content-type', 'application/json');
      if (resources.has(uri)) {
        response.end(JSON.stringify({ status: 'success', result: { uri } }));
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ status: 'error', error: { code: 'not_found' } }));
      }
      return;
    }
    if (request.method === 'DELETE' && url.pathname === '/api/v1/fs') {
      if (blockDeletes) {
        response.statusCode = 409;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ status: 'error', error: { code: 'conflict' } }));
        return;
      }
      resources.delete(url.searchParams.get('uri') ?? '');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'success', result: { removed: true } }));
      return;
    }

    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.method === 'POST' && url.pathname === '/api/v1/resources/temp_upload') {
        response.end(JSON.stringify({ status: 'success', result: { temp_file_id: 'fixture-upload' } }));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/resources') {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resourceBodies.push(body);
        if (String(body.path ?? '').includes('/quota')) {
          // OpenViking can materialize the target before its semantic model fails.
          resources.add(body.to);
          response.statusCode = 429;
          response.end(JSON.stringify({ status: 'error', error: { code: 'insufficient_quota' } }));
          return;
        }
        resources.add(body.to);
        response.end(JSON.stringify({ status: 'success', result: { root_uri: body.to } }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ status: 'error', error: { code: 'not_found' } }));
    });
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
      OPENVIKING_API_KEY: 'test-only-key',
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

describe('authenticated source capture boundary', () => {
  it('captures a URL once and reconciles a tracking variant as the same source', async () => {
    const first = await postCapture({
      kind: 'url',
      value: 'https://research.example/report/?utm_source=feed&b=2&a=1#section',
      title: 'Market structure report',
    });
    expect(first.response.status).toBe(200);
    expect(first.body.status).toBe('ready');

    const second = await postCapture({
      kind: 'url',
      value: 'https://research.example/report?a=1&b=2',
    });
    expect(second.response.status).toBe(200);
    expect(second.body.status).toBe('duplicate');
    expect(second.body.source_id).toBe(first.body.source_id);
    expect(resourceBodies.filter((body) => body.path).length).toBe(1);
  });

  it('captures pasted text through native upload and records its stable identity', async () => {
    const result = await postCapture({ kind: 'text', value: '# Panel briefing\n\nStablecoin evidence.' });
    expect(result.response.status).toBe(200);
    expect(result.body.status).toBe('ready');
    expect(resourceBodies.some((body) => body.temp_file_id === 'fixture-upload')).toBe(true);
  });

  it('reports provider failure without registering a false-ready source', async () => {
    const result = await postCapture({ kind: 'url', value: 'https://research.example/quota' });
    expect(result.response.status).toBe(503);
    expect(result.body.error).toBe('provider_quota');
    expect(result.body.message).toMatch(/credits/i);

    const db = new Database(TEMP_DB, { readonly: true });
    const failed = db.prepare("SELECT canonical_id FROM ingestion_receipts WHERE status='failed' ORDER BY id DESC LIMIT 1").get() as any;
    expect(failed.canonical_id).toBeTruthy();
    expect(db.prepare('SELECT count(*) count FROM sources WHERE source_id=?').get(failed.canonical_id)).toEqual({ count: 0 });
    expect(resources.has(`viking://user/hermes/resources/crypto/sources/source-${failed.canonical_id.slice(7)}.md`)).toBe(false);
    expect((db.pragma('foreign_key_check') as unknown[]).length).toBe(0);
    db.close();
  });

  it('never promotes a locked remote-only remainder as ready', async () => {
    blockDeletes = true;
    const first = await postCapture({ kind: 'url', value: 'https://research.example/quota-locked' });
    expect(first.response.status).toBe(503);
    expect(first.body.error).toBe('provider_quota');

    const retry = await postCapture({ kind: 'url', value: 'https://research.example/quota-locked' });
    expect(retry.response.status).toBe(503);
    expect(retry.body.error).toBe('memory_processing');

    const db = new Database(TEMP_DB, { readonly: true });
    expect(db.prepare('SELECT count(*) count FROM sources WHERE source_url=?').get('https://research.example/quota-locked')).toEqual({ count: 0 });
    db.close();
    blockDeletes = false;
  });

  it('returns honest receipt history', async () => {
    const response = await fetch(`${base}/api/ingestion`);
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.configured).toBe(true);
    expect(body.connected).toBe(true);
    expect(body.receipts.map((receipt: any) => receipt.status)).toEqual(
      expect.arrayContaining(['ready', 'duplicate', 'failed']),
    );
  });
});
