import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
const resourceContent = new Map<string, string>();
const resourceBodies: Record<string, any>[] = [];
const uploadedText = new Map<string, string>();
let blockDeletes = false;

let mock: Server;
let app: ChildProcessWithoutNullStreams;
let base = '';
let appOutput = '';
let requestSequence = 1;

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
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `198.51.100.${requestSequence++}`,
    },
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
    if (request.method === 'GET' && url.pathname === '/api/v1/fs/tree') {
      const uri = url.searchParams.get('uri') ?? '';
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        status: 'success',
        result: resources.has(uri) ? [{ uri: `${uri}/content.md`, isDir: false }] : [],
      }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/content/read') {
      const uri = url.searchParams.get('uri') ?? '';
      const root = uri.replace(/\/content\.md$/, '');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'success', result: resourceContent.get(root) ?? '' }));
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
      resourceContent.delete(url.searchParams.get('uri') ?? '');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'success', result: { removed: true } }));
      return;
    }

    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.method === 'POST' && url.pathname === '/api/v1/resources/temp_upload') {
        const body = Buffer.concat(chunks).toString('utf8');
        const id = `fixture-upload-${uploadedText.size}`;
        uploadedText.set(id, body.slice(body.indexOf('\r\n\r\n') + 4, body.lastIndexOf('\r\n--')));
        response.end(JSON.stringify({ status: 'success', result: { temp_file_id: id } }));
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
        resourceContent.set(body.to, uploadedText.get(body.temp_file_id) ?? 'Verified fixture source body with enough content to prove that acquisition stored the source itself, rather than only its URL or title.');
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
      SOURCE_PROCESSING_ENABLED: 'true',
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
    expect(resourceBodies.some((body) => uploadedText.has(body.temp_file_id))).toBe(true);
  });

  it('fails blocked social URLs honestly and asks for the source text', async () => {
    const result = await postCapture({ kind: 'url', value: 'https://x.com/example/status/12345' });
    expect(result.response.status).toBe(422);
    expect(result.body.error).toBe('unsupported_social_url');
    expect(result.body.message).toMatch(/paste/i);
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


describe('persistent bulk import', () => {
  it('rejects a malformed batch atomically', async () => {
    const response = await fetch(`${base}/api/imports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ kind: 'url', value: 'https://example.com/bulk-valid' }, { kind: 'url', value: 'http://127.0.0.1/private' }] }) });
    expect(response.status).toBe(400);
    const connection = new Database(TEMP_DB, { readonly: true });
    expect(connection.prepare('SELECT count(*) n FROM import_items').get()).toEqual({ n: 0 });
    connection.close();
  });
  it('retains accepted jobs and deduplicates repeated URLs through canonical capture', async () => {
    const response = await fetch(`${base}/api/imports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ kind: 'url', value: 'https://example.com/bulk-source', title: 'Bulk fixture' }, { kind: 'url', value: 'https://example.com/bulk-source?utm_source=test', title: 'Bulk duplicate' }] }) });
    expect(response.status).toBe(202);
    const receipt = await response.json() as any;
    let jobs: any[] = [];
    for (let attempt = 0; attempt < 65; attempt++) {
      const status = await (await fetch(`${base}/api/processing`)).json() as any;
      jobs = status.imports.filter((row: any) => row.batch_id === receipt.id);
      if (jobs.length === 2 && jobs.every(row => row.status === 'ready')) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    expect(jobs.map(row => row.status)).toEqual(['ready','ready']);
    expect(jobs[0].source_id).toBe(jobs[1].source_id);
    expect(jobs.every(row => row.evidence_status === 'queued')).toBe(true);
    const connection = new Database(TEMP_DB, { readonly: true });
    expect(connection.prepare('SELECT payload_json FROM import_items WHERE batch_id=?').all(receipt.id)).toEqual([{payload_json:'{}'},{payload_json:'{}'}]);
    connection.close();
  }, 16000);
  it('accepts Word and PDF over HTTP and retains their extracted content through memory and the dashboard', async () => {
    const items = ['doc', 'docx', 'pdf'].map(extension => ({ kind: 'document', filename: `transcript.${extension}`, source_type: 'transcript', value: readFileSync(join(HERE, 'fixtures/documents', `transcript.${extension}`)).toString('base64') }));
    const response = await fetch(`${base}/api/imports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) });
    expect(response.status).toBe(202);
    const receipt = await response.json() as any;
    expect(receipt.count).toBe(3);
    let jobs: any[] = [];
    for (let attempt = 0; attempt < 95; attempt++) {
      const status = await (await fetch(`${base}/api/processing`)).json() as any;
      jobs = status.imports.filter((row: any) => row.batch_id === receipt.id);
      if (jobs.length === 3 && jobs.every(row => row.status === 'ready')) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    expect(jobs.map(row => row.status)).toEqual(['ready', 'ready', 'ready']);
    for (const job of jobs) {
      const retained = await (await fetch(`${base}/api/sources/${encodeURIComponent(job.source_id)}`)).json() as any;
      expect(retained.content).toContain('Alice: The team discussed a fixed-rate lending vault.');
      expect(retained.content).toContain('Bob: Preserve the source wording and speaker labels.');
      expect(retained.source_type).toBe('transcript');
      expect(job.evidence_status).toBe('queued');
    }
    expect(Array.from(resourceContent.values()).some(body => body.includes('Alice:'))).toBe(true);
  }, 22000);
});
