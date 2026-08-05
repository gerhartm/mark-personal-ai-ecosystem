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
const TEMP_DIR = mkdtempSync(join(tmpdir(), 'mark-crypto-quiz-'));
const TEMP_DB = join(TEMP_DIR, 'crypto-intelligence.db');

let mock: Server;
let app: ChildProcessWithoutNullStreams;
let base = '';
let appOutput = '';
let knownEvent = '';

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
  throw new Error(`isolated Quiz dashboard did not start\n${appOutput}`);
}

beforeAll(async () => {
  copyFileSync(SOURCE_DB, TEMP_DB);
  const fixture = new Database(TEMP_DB, { readonly: true });
  knownEvent = (fixture.prepare('SELECT id FROM events ORDER BY id LIMIT 1').get() as any).id;
  fixture.close();

  const sockets = new WebSocketServer({ noServer: true });
  sockets.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const request = JSON.parse(String(raw));
      const task = request.params?.task;
      let text = '';
      if (task === 'quiz_generation') {
        text = JSON.stringify({
          questions: [
            { question_text: 'What central fact does this stored event establish?', question_type: 'factual', category: 'narrative', answer_guidance: 'State the central fact accurately and in context.', event_ids: [knownEvent] },
            { question_text: 'Why does this event matter to a crypto investor?', question_type: 'principle', category: 'narrative', answer_guidance: 'Explain the durable implication for investors.', event_ids: [knownEvent] },
            { question_text: 'Which stored evidence would you cite when discussing this event?', question_type: 'cite_source', category: 'narrative', answer_guidance: 'Identify the linked event and explain why it supports the claim.', event_ids: [knownEvent] },
          ],
        });
      } else if (task === 'quiz_grading') {
        const ids = [...new Set(String(request.params?.input ?? '').match(/question_[0-9a-f-]+/g) ?? [])];
        text = JSON.stringify({
          results: ids.map((questionId, index) => ({
            question_id: questionId,
            is_correct: index < 2,
            feedback: index < 2 ? 'Correct. The answer captures the key stored idea.' : 'Not quite. Revisit the linked evidence and its central implication.',
          })),
        });
      }
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { text } }));
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
      response.end(JSON.stringify({ ticket: 'quiz-test-ticket' }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  });
  mock.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/api/ws' || url.searchParams.get('ticket') !== 'quiz-test-ticket') {
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
      HERMES_DASHBOARD_USERNAME: 'quiz-test',
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

describe('Hermes-powered Quiz boundary', () => {
  it('creates an evidence-linked quiz and grades all answers in one request', async () => {
    const status = await (await fetch(`${base}/api/quiz/status`)).json() as any;
    expect(status).toEqual({ connected: true, default_question_count: 5 });

    const createdResponse = await fetch(`${base}/api/quiz/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ focus: 'Aave risk', question_count: 3 }),
    });
    expect(createdResponse.status).toBe(200);
    const created = await createdResponse.json() as any;
    expect(created.questions).toHaveLength(3);
    expect(created.questions.every((question: any) => question.events[0].event_id === knownEvent)).toBe(true);

    const answers = created.questions.map((question: any, index: number) => ({
      question_id: question.id,
      answer_text: `Answer ${index + 1} using the stored evidence.`,
    }));
    const gradedResponse = await fetch(`${base}/api/quiz/sessions/${created.id}/answers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    expect(gradedResponse.status).toBe(200);
    const graded = await gradedResponse.json() as any;
    expect(graded.score_correct).toBe(2);
    expect(graded.score_total).toBe(3);
    expect(graded.completed_at).toBeTruthy();
    expect(graded.questions.every((question: any) => question.answer?.feedback)).toBe(true);

    const db = new Database(TEMP_DB, { readonly: true });
    expect((db.prepare('SELECT count(*) count FROM quiz_event_links WHERE owner_id IN (SELECT id FROM quiz_questions WHERE session_id = ?)').get(created.id) as any).count).toBe(3);
    expect((db.prepare('SELECT count(*) count FROM quiz_answers WHERE session_id = ?').get(created.id) as any).count).toBe(3);
    expect((db.pragma('foreign_key_check') as unknown[]).length).toBe(0);
    db.close();
  });

  it('does not accept an incomplete answer set', async () => {
    const sessions = await (await fetch(`${base}/api/quiz/sessions`)).json() as any;
    const completed = sessions.sessions.find((session: any) => session.completed_at);
    const response = await fetch(`${base}/api/quiz/sessions/${completed.id}/answers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: [] }),
    });
    expect([400, 409]).toContain(response.status);
  });
});
