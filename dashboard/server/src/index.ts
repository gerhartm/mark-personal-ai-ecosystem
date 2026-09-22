import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_ROOT, audit, all, one, run } from './db.js';
import { buildAskContext } from './ask-context.js';
import { cleanHermesError, runHermesAgent } from './hermes-client.js';
import {
  IntelligenceError,
  intelligenceStatus,
  refreshIntelligence,
  startIntelligenceScheduler,
} from './intelligence.js';
import {
  CaptureInputError,
  captureSource,
  ingestionConfigured,
  ingestionStatus,
  recentIngestionReceipts,
} from './ingestion.js';
import {
  accessHeaderRequired,
  authActor,
  authMode,
  authUsername,
  issueSession,
  requestActor,
  requestIdentity,
  sessionCookieName,
  sharedAuthConfigurationValid,
  turnstileConfigured,
  turnstileSiteKey,
  verifyPassword,
  verifyTurnstile,
} from './request-auth.js';
import {
  StudioInputError,
  appendStudioRevision,
  createStudioDraft,
  draftCitations,
  studioStatus,
} from './studio.js';
import { generateCreatorDraft, generatePrepBrief } from './workflows.js';
import {
  PromptControlError,
  getPromptControl,
  listPromptControls,
  promptHistory,
  restorePromptControl,
  savePromptControl,
} from './prompt-controls.js';
import {
  QuizInputError,
  createQuizSession,
  gradeQuizSession,
  quizStatus,
} from './quiz.js';
import {
  TelegramSyncError,
  enqueueTelegramSource,
  recentTelegramSyncJobs,
  startTelegramSyncWorker,
  telegramSyncAuthorized,
  telegramSyncConfigured,
  telegramSyncJob,
} from './telegram-sync.js';
import * as t from './tools.js';
import { processingSummary, sourceProcessingRows, retrySource } from './source-queue.js';
import { startSourceProcessor } from './source-processor.js';
import { enqueueImport, listImports, retryImport, startImportWorker } from './imports.js';
import { queueTopicRebuild, topicRebuildStatus, startTopicRebuildWorker } from './topic-jobs.js';


const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(HERE, '..', '..', 'web', 'dist');
const PORT = Number(process.env.PORT ?? 5183);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = Fastify({ logger: false, bodyLimit: 1_000_000 });

app.addHook('onSend', async (req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com; worker-src 'self' blob:",
  );
  if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'private, no-store');
});

app.addHook('preHandler', async (req, reply) => {
  if (
    authMode === 'development'
    || req.url.startsWith('/api/health')
    || req.url.startsWith('/api/internal/telegram-sync')
    || req.url.startsWith('/api/auth/')
    || !req.url.startsWith('/api/')
  ) return;
  const identity = requestIdentity(req);
  if (!identity.authorized) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Authentication is required.' });
  }
});

const loginAttempts = new Map<string, { failures: number; windowStarted: number; blockedUntil: number }>();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

const loginAttempt = (key: string, now = Date.now()) => {
  const current = loginAttempts.get(key);
  if (!current || now - current.windowStarted >= LOGIN_WINDOW_MS) {
    const next = { failures: 0, windowStarted: now, blockedUntil: 0 };
    loginAttempts.set(key, next);
    return next;
  }
  return current;
};

const recordLoginFailure = (key: string, now = Date.now()) => {
  const attempt = loginAttempt(key, now);
  attempt.failures += 1;
  if (attempt.failures >= LOGIN_MAX_FAILURES) attempt.blockedUntil = now + LOGIN_BLOCK_MS;
};

const clearLoginFailures = (key: string) => loginAttempts.delete(key);

app.get('/api/auth/config', async () => ({
  mode: authMode,
  turnstile: turnstileConfigured(),
  turnstileSiteKey: turnstileConfigured() ? turnstileSiteKey() : '',
}));

app.get('/api/auth/session', async (req) => {
  const identity = requestIdentity(req);
  return { authenticated: identity.authorized, actor: identity.authorized ? identity.email : '' };
});

app.post('/api/auth/login', async (req, reply) => {
  if (authMode !== 'shared-password' || !sharedAuthConfigurationValid()) {
    return reply.code(503).send({
      error: 'login_unavailable',
      message: 'Workspace login is not available. Please contact the workspace administrator.',
    });
  }
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  const attempt = loginAttempt(remote);
  if (attempt.blockedUntil > Date.now()) {
    const retryAfter = Math.ceil((attempt.blockedUntil - Date.now()) / 1000);
    reply.header('Retry-After', String(retryAfter));
    return reply.code(429).send({
      error: 'rate_limited',
      message: 'Too many attempts. Please wait 15 minutes before trying again.',
    });
  }

  const body = (req.body ?? {}) as { username?: unknown; password?: unknown; turnstileToken?: unknown };
  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const turnstileToken = String(body.turnstileToken ?? '');
  if (username.length > 128 || password.length > 256 || turnstileToken.length > 4_096) {
    return reply.code(400).send({
      error: 'invalid_login_request',
      message: 'The login request is not valid. Please refresh and try again.',
    });
  }
  if (!(await verifyTurnstile(turnstileToken, remote))) {
    return reply.code(400).send({
      error: 'verification_failed',
      message: 'Human verification did not complete. Please try again.',
    });
  }

  const passwordAccepted = await verifyPassword(password);
  if (username !== authUsername() || !passwordAccepted) {
    recordLoginFailure(remote);
    return reply.code(401).send({
      error: 'invalid_credentials',
      message: 'The username or password is incorrect.',
    });
  }

  clearLoginFailures(remote);
  const token = issueSession(username, authActor());
  const secureAttribute = process.env.AUTH_COOKIE_SECURE === 'false' ? '' : '; Secure';
  reply.header(
    'Set-Cookie',
    `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly${secureAttribute}; SameSite=Lax; Max-Age=43200`,
  );
  return { authenticated: true, actor: authActor() };
});

app.post('/api/auth/logout', async (_req, reply) => {
  const secureAttribute = process.env.AUTH_COOKIE_SECURE === 'false' ? '' : '; Secure';
  reply.header(
    'Set-Cookie',
    `${sessionCookieName}=; Path=/; HttpOnly${secureAttribute}; SameSite=Lax; Max-Age=0`,
  );
  return { authenticated: false };
});

const list = (v: unknown): string[] | undefined => {
  if (v == null) return undefined;
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const clean = arr.map((s) => String(s).trim()).filter(Boolean);
  return clean.length ? clean : undefined;
};
const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v));

/* ------------------------------------------------------------------ */
/* read routes                                                         */
/* ------------------------------------------------------------------ */

app.get('/api/health', async () => ({ ok: true, mediaAvailable: Boolean(MEDIA_ROOT) }));

app.post('/api/internal/telegram-sync', async (req, reply) => {
  if (!telegramSyncConfigured()) {
    return reply.code(503).send({ error: 'sync_not_configured' });
  }
  if (!telegramSyncAuthorized(req.headers.authorization)) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  try {
    const job = enqueueTelegramSource(req.body as any, 'satoshi');
    return reply.code(job.status === 'ready' ? 200 : 202).send(job);
  } catch (error) {
    if (error instanceof TelegramSyncError) {
      return reply.code(400).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({ error: 'sync_unavailable' });
  }
});

app.get('/api/internal/telegram-sync/:externalId', async (req, reply) => {
  if (!telegramSyncAuthorized(req.headers.authorization)) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  const externalId = (req.params as { externalId: string }).externalId;
  const job = telegramSyncJob(externalId);
  return job ?? reply.code(404).send({ error: 'not_found' });
});

app.get('/api/brief', async () => {
  const brief = t.brief();
  return {
    ...brief,
    evidence_processing: processingSummary(),
    telegram_sync: {
      ...brief.telegram_sync,
      configured: telegramSyncConfigured(),
    },
  };
});

app.get('/api/intelligence', async () => intelligenceStatus());

app.get('/api/facets', async () => t.facetOptions());

app.get('/api/events', async (req) => {
  const q = req.query as Record<string, string>;
  return t.findEvents({
    q: q.q,
    category: list(q.category),
    sourceType: list(q.sourceType),
    significanceMin: num(q.significanceMin),
    significanceMax: num(q.significanceMax),
    entity: q.entity,
    tag: q.tag,
    from: q.from,
    to: q.to,
    axis: q.axis === 'capture' ? 'capture' : 'subject',
    hasNotes: q.hasNotes == null ? undefined : q.hasNotes === 'true',
    sort: (q.sort as any) ?? 'subject',
    limit: num(q.limit),
    offset: num(q.offset),
  });
});

app.get('/api/events/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const event = t.getEvent(id);
  if (!event) return reply.code(404).send({ error: 'not_found' });
  run(
    'INSERT INTO read_state (canonical_id, last_read_at) VALUES (?, ?) ON CONFLICT(canonical_id) DO UPDATE SET last_read_at = excluded.last_read_at',
    id,
    new Date().toISOString(),
  );
  return event;
});

app.get('/api/processing', async () => ({ summary: processingSummary(), sources: sourceProcessingRows(), imports: listImports() }));
app.post('/api/processing/:id/retry', async (req, reply) => {
  const id = (req.params as { id: string }).id;
  if (!one('SELECT 1 FROM sources WHERE source_id=?', id)) return reply.code(404).send({ error: 'not_found' });
  return { retried: retrySource(id) };
});
app.post('/api/imports', { bodyLimit: 8_000_000 }, async (req, reply) => {
  try { return reply.code(202).send(enqueueImport((req.body as any)?.items, requestActor(req))); }
  catch (error) {
    if (error instanceof CaptureInputError) return reply.code(400).send({ error: error.code, message: error.message });
    throw error;
  }
});
app.post('/api/imports/:id/retry', async (req) => ({ retried: retryImport(Number((req.params as any).id)) }));
app.get('/api/workflows', async () => ({ results: all(`SELECT d.id,d.focus,d.template_type,d.updated_at,
  w.kind,w.revision,json_extract(w.response_json,'$.creator') AS creator,json_extract(w.response_json,'$.format') AS format
  FROM content_drafts d LEFT JOIN workflow_results w ON w.draft_id=d.id
  AND w.revision=(SELECT max(revision) FROM workflow_results WHERE draft_id=d.id) ORDER BY d.updated_at DESC`) }));
app.get('/api/workflows/:id', async (req, reply) => {
  const id = (req.params as any).id;
  const draft = t.getDraft(id);
  if (!draft) return reply.code(404).send({ error: 'not_found' });
  const revisions = all<any>('SELECT * FROM workflow_results WHERE draft_id=? ORDER BY revision DESC', id)
    .map(row => ({ revision: row.revision, kind: row.kind, input: JSON.parse(row.input_json), result: JSON.parse(row.response_json) }));
  return { draft, revisions };
});
app.put('/api/intelligence/settings', async (req, reply) => {
  const enabled = (req.body as any)?.enabled;
  if (typeof enabled !== 'boolean') return reply.code(400).send({ message: 'Choose whether scheduled briefs are enabled.' });
  run("INSERT OR REPLACE INTO app_settings(key,value) VALUES ('intelligence.enabled',?)", String(enabled));
  audit(requestActor(req), 'intelligence.schedule_changed', 'intelligence', { enabled });
  return intelligenceStatus();
});
app.get('/api/sources', async () => ({ sources: t.listSources() }));
app.get('/api/sources/:id', async (req, reply) => {
  const source = t.getSource((req.params as { id: string }).id);
  if (!source) return reply.code(404).send({ error: 'not_found' });
  let content = '';
  try {
    const { sourceContent } = await import('./ingestion.js');
    content = await sourceContent((source as any).source_id, 1_000_001);
  } catch {}
  return { ...source, content: content.slice(0, 1_000_000), content_truncated: content.length > 1_000_000, processing: one('SELECT * FROM source_processing WHERE source_id=?', (source as any).source_id) };
});

app.get('/api/topics', async (req) => {
  const q = req.query as Record<string, string>;
  return q.tag ? t.listTopics(undefined, q.tag) : { topics: t.listTopics() };
});

app.get('/api/prompt-controls', async () => ({ controls: listPromptControls() }));

app.get('/api/prompt-controls/:page', async (req, reply) => {
  try {
    return getPromptControl((req.params as { page: string }).page);
  } catch (error) {
    if (error instanceof PromptControlError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    throw error;
  }
});

app.get('/api/prompt-controls/:page/history', async (req, reply) => {
  try {
    return { history: promptHistory((req.params as { page: string }).page) };
  } catch (error) {
    if (error instanceof PromptControlError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    throw error;
  }
});

app.put('/api/prompt-controls/:page', async (req, reply) => {
  try {
    return savePromptControl(
      (req.params as { page: string }).page,
      (req.body as { instructions?: unknown })?.instructions,
      requestActor(req),
    );
  } catch (error) {
    if (error instanceof PromptControlError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(500).send({ error: 'prompt_save_failed', message: 'The page instruction could not be saved.' });
  }
});

app.post('/api/prompt-controls/:page/restore', async (req, reply) => {
  try {
    return restorePromptControl((req.params as { page: string }).page, requestActor(req));
  } catch (error) {
    if (error instanceof PromptControlError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(500).send({ error: 'prompt_restore_failed', message: 'The default instruction could not be restored.' });
  }
});

app.get('/api/prompt-controls/topics/rebuild/status', async () => topicRebuildStatus());
app.post('/api/prompt-controls/topics/rebuild', async (req, reply) => {
  const actor = requestActor(req);
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  if (isStudioRateLimited(`${actor}:${remote}`)) {
    return reply.code(429).send({ error: 'rate_limited', message: 'Please wait before rebuilding Topics again.' });
  }
  try {
    return reply.code(202).send(queueTopicRebuild(actor));
  } catch (error) {
    if (error instanceof PromptControlError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({
      error: 'hermes_unavailable',
      message: cleanHermesError(error instanceof Error ? error.message : error),
    });
  }
});

app.get('/api/ask/history', async (req) => {
  const q = req.query as Record<string, string>;
  return { history: t.listAskHistory(q.q ?? '', num(q.limit) ?? 40) };
});

app.get('/api/timeline', async (req) => {
  const q = req.query as Record<string, string>;
  return t.timeline(q.from, q.to);
});

app.get('/api/timeline/:id/dossier', async (req, reply) => {
  const dossier = t.timelineDossier((req.params as { id: string }).id);
  return dossier ?? reply.code(404).send({ error: 'not_found' });
});

app.get('/api/graph', async (req) => {
  const q = req.query as Record<string, string>;
  return t.graph({
    focus: q.focus,
    minShared: num(q.minShared),
    entityTypes: list(q.entityTypes),
    limit: num(q.limit),
  });
});

app.get('/api/themes', async () => ({ themes: t.listThemes() }));
app.get('/api/themes/:id', async (req, reply) => {
  const theme = t.getTheme((req.params as { id: string }).id);
  return theme ?? reply.code(404).send({ error: 'not_found' });
});

app.get('/api/search', async (req) => {
  const q = req.query as Record<string, string>;
  return t.search(q.q ?? '', num(q.limit) ?? 40);
});

app.get('/api/drafts', async () => ({ drafts: t.listDrafts() }));
app.get('/api/drafts/:id', async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const draft = t.getDraft(id);
  return draft ? { ...draft, citations: draftCitations(id) } : reply.code(404).send({ error: 'not_found' });
});

app.get('/api/studio/status', async () => studioStatus());

app.get('/api/quiz/sessions', async () => ({ sessions: t.listQuizSessions() }));
app.get('/api/quiz/status', async () => quizStatus());
app.get('/api/quiz/sessions/:id', async (req, reply) => {
  const session = t.getQuizSession((req.params as { id: string }).id);
  return session ?? reply.code(404).send({ error: 'not_found' });
});

app.get('/api/conversations', async () => ({ sessions: t.listConversations() }));
app.get('/api/conversations/:id', async (req, reply) => {
  const session = t.getConversation((req.params as { id: string }).id);
  return session ?? reply.code(404).send({ error: 'not_found' });
});

app.get('/api/media', async () => ({ assets: t.listMedia(), available: Boolean(MEDIA_ROOT) }));

app.get('/api/reconciliation', async () => t.reconciliation());

app.get('/api/views', async () => ({ views: all('SELECT * FROM saved_views ORDER BY created_at DESC') }));

/* ------------------------------------------------------------------ */
/* writes: browser session only, append only, audited                  */
/* ------------------------------------------------------------------ */

app.put('/api/events/:id/notes', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { text?: string };
  if (typeof body?.text !== 'string' || !body.text.trim()) {
    return reply.code(400).send({ error: 'invalid_note', message: 'Note text is required.' });
  }
  if (body.text.length > 20_000) {
    return reply.code(400).send({ error: 'note_too_long', message: 'Notes are limited to 20,000 characters.' });
  }
  if (!one('SELECT 1 FROM events WHERE id = ?', id)) {
    return reply.code(404).send({ error: 'not_found' });
  }
  const next =
    (one<{ r: number }>('SELECT COALESCE(MAX(revision), -1) + 1 AS r FROM note_revisions WHERE event_id = ?', id)!.r);
  run(
    'INSERT INTO note_revisions (event_id, revision, text, author, created_at, memory_state) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    next,
    body.text.trim(),
    requestActor(req),
    new Date().toISOString(),
    'local_only',
  );
  audit(requestActor(req), 'note.append', id, { revision: next });
  return { event_id: id, revision: next, memory_state: 'local_only' };
});

app.post('/api/views', async (req, reply) => {
  const body = req.body as { name?: string; screen?: string; query?: unknown };
  if (!body?.name?.trim() || !body?.screen) {
    return reply.code(400).send({ error: 'invalid_view', message: 'Name and screen are required.' });
  }
  const id = `view_${Date.now().toString(36)}`;
  run(
    'INSERT INTO saved_views (id, name, screen, query_json, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    body.name.trim(),
    body.screen,
    JSON.stringify(body.query ?? {}),
    new Date().toISOString(),
  );
  audit(requestActor(req), 'view.create', id);
  return { id };
});

app.delete('/api/views/:id', async (req) => {
  const { id } = req.params as { id: string };
  run('DELETE FROM saved_views WHERE id = ?', id);
  audit(requestActor(req), 'view.delete', id);
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* the intelligence plane                                              */
/* ------------------------------------------------------------------ */

/**
 * Hermes is the brain. This backend does no reasoning: when the intelligence
 * plane is not connected it says so and offers deterministic lexical search
 * instead, clearly labelled as search rather than an answer.
 */
const askAttempts = new Map<string, number[]>();
const captureAttempts = new Map<string, number[]>();
const studioAttempts = new Map<string, number[]>();
const quizAttempts = new Map<string, number[]>();
const intelligenceAttempts = new Map<string, number[]>();

function isAskRateLimited(key: string) {
  const now = Date.now();
  const recent = (askAttempts.get(key) ?? []).filter((time) => time > now - 60_000);
  if (recent.length >= 12) return true;
  recent.push(now);
  askAttempts.set(key, recent);
  return false;
}

function isCaptureRateLimited(key: string) {
  const now = Date.now();
  const recent = (captureAttempts.get(key) ?? []).filter((time) => time > now - 60_000);
  if (recent.length >= 6) return true;
  recent.push(now);
  captureAttempts.set(key, recent);
  return false;
}

function isStudioRateLimited(key: string) {
  const now = Date.now();
  const recent = (studioAttempts.get(key) ?? []).filter((time) => time > now - 60_000);
  if (recent.length >= 4) return true;
  recent.push(now);
  studioAttempts.set(key, recent);
  return false;
}

function isQuizRateLimited(key: string) {
  const now = Date.now();
  const recent = (quizAttempts.get(key) ?? []).filter((time) => time > now - 60_000);
  if (recent.length >= 6) return true;
  recent.push(now);
  quizAttempts.set(key, recent);
  return false;
}

function isIntelligenceRateLimited(key: string) {
  const now = Date.now();
  const recent = (intelligenceAttempts.get(key) ?? []).filter((time) => time > now - 10 * 60_000);
  if (recent.length >= 1) return true;
  recent.push(now);
  intelligenceAttempts.set(key, recent);
  return false;
}

app.post('/api/intelligence/refresh', async (req, reply) => {
  const actor = requestActor(req);
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  if (isIntelligenceRateLimited(`${actor}:${remote}`)) {
    return reply.code(429).send({
      error: 'rate_limited',
      message: 'A fresh intelligence briefing can be requested once every ten minutes.',
    });
  }
  try {
    const brief = await refreshIntelligence(actor, 'manual');
    return { connected: true, stale: false, brief };
  } catch (error) {
    if (error instanceof IntelligenceError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({
      error: 'hermes_unavailable',
      message: cleanHermesError(error instanceof Error ? error.message : error),
    });
  }
});

app.post('/api/quiz/sessions', async (req, reply) => {
  const actor = requestActor(req);
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  if (isQuizRateLimited(`${actor}:${remote}`)) {
    return reply.code(429).send({ error: 'rate_limited', message: 'Please wait before generating another quiz.' });
  }
  try {
    return await createQuizSession(req.body as any, actor);
  } catch (error) {
    if (error instanceof QuizInputError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({
      error: 'hermes_unavailable',
      message: cleanHermesError(error instanceof Error ? error.message : error),
    });
  }
});

app.post('/api/quiz/sessions/:id/answers', async (req, reply) => {
  const actor = requestActor(req);
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  if (isQuizRateLimited(`${actor}:${remote}`)) {
    return reply.code(429).send({ error: 'rate_limited', message: 'Please wait before submitting another quiz.' });
  }
  try {
    const { id } = req.params as { id: string };
    const body = req.body as { answers?: any[] };
    return await gradeQuizSession(id, body?.answers ?? [], actor);
  } catch (error) {
    if (error instanceof QuizInputError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({
      error: 'hermes_unavailable',
      message: cleanHermesError(error instanceof Error ? error.message : error),
    });
  }
});

app.post('/api/studio/drafts', async (req, reply) => {
  const actor = requestActor(req);
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  if (isStudioRateLimited(`${actor}:${remote}`)) {
    return reply.code(429).send({ error: 'rate_limited', message: 'Please wait before generating another draft.' });
  }
  try {
    return await createStudioDraft(req.body as any, actor);
  } catch (error) {
    if (error instanceof StudioInputError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({
      error: 'hermes_unavailable',
      message: cleanHermesError(error instanceof Error ? error.message : error),
    });
  }
});

app.post('/api/prep', async (req, reply) => {
  const actor = requestActor(req);
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  if (isStudioRateLimited(`${actor}:${remote}`)) {
    return reply.code(429).send({ error: 'rate_limited', message: 'Please wait before building another brief.' });
  }
  try {
    return await generatePrepBrief(req.body as any, actor);
  } catch (error) {
    if (error instanceof StudioInputError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({
      error: 'hermes_unavailable',
      message: cleanHermesError(error instanceof Error ? error.message : error),
    });
  }
});

app.post('/api/creator', async (req, reply) => {
  const actor = requestActor(req);
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  if (isStudioRateLimited(`${actor}:${remote}`)) {
    return reply.code(429).send({ error: 'rate_limited', message: 'Please wait before generating another draft.' });
  }
  try {
    return await generateCreatorDraft(req.body as any, actor);
  } catch (error) {
    if (error instanceof StudioInputError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({
      error: 'hermes_unavailable',
      message: cleanHermesError(error instanceof Error ? error.message : error),
    });
  }
});

app.put('/api/drafts/:id', async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const body = req.body as { body?: string };
  try {
    return appendStudioRevision(id, body?.body, requestActor(req));
  } catch (error) {
    if (error instanceof StudioInputError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    return reply.code(500).send({ error: 'revision_failed', message: 'The draft revision could not be saved.' });
  }
});

app.get('/api/ingestion', async () => ({
  ...(await ingestionStatus()),
  receipts: recentIngestionReceipts(),
  telegram_sync: recentTelegramSyncJobs(),
}));

app.post('/api/ingestion', async (req, reply) => {
  const actor = requestActor(req);
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  if (isCaptureRateLimited(`${actor}:${remote}`)) {
    return reply.code(429).send({ error: 'rate_limited', message: 'Please wait before adding another source.' });
  }
  try {
    return await captureSource(req.body as any, actor);
  } catch (error) {
    if (error instanceof CaptureInputError) {
      const status = error.code.startsWith('invalid_') || error.code === 'text_too_long'
        ? 400
        : error.code === 'unsupported_social_url'
          ? 422
          : 503;
      return reply.code(status).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({
      error: 'memory_unavailable',
      message: 'The source could not be added to private memory. Nothing was recorded as ready.',
    });
  }
});

app.post('/api/ask', async (req, reply) => {
  const body = req.body as { question?: string; source_ids?: unknown };
  const question = (body?.question ?? '').trim();
  if (question.length < 3 || question.length > 2_000) {
    return reply.code(400).send({
      error: 'invalid_question',
      message: 'Enter a question between 3 and 2,000 characters.',
    });
  }
  const actor = requestActor(req);
  const remote = String(req.headers['cf-connecting-ip'] ?? req.ip);
  if (isAskRateLimited(`${actor}:${remote}`)) {
    return reply.code(429).send({ error: 'rate_limited', message: 'Please wait before asking again.' });
  }
  const sourceIds = Array.isArray(body.source_ids)
    ? [...new Set(body.source_ids.map(String).filter((id) => Boolean(t.getSource(id))))].slice(0, 12)
    : [];
  audit(actor, 'ask', undefined, { length: question.length, source_count: sourceIds.length });

  const connected = Boolean(process.env.HERMES_BASE_URL);
  if (!connected) {
    const results = question ? t.search(question, 12).results : [];
    return {
      mode: 'degraded',
      state: 'intelligence_plane_not_connected',
      message:
        'Hermes is not connected in this environment, so no answer is generated. These are exact lexical matches from the corpus, not an answer.',
      question,
      results,
    };
  }
  const context = await buildAskContext(question, sourceIds);
  try {
    const answer = (await runHermesAgent(context.input, {
      title: 'Crypto Intelligence question',
      reasoningEffort: 'low',
      timeoutMs: 180_000,
    })).text;
    const askedAt = new Date().toISOString();
    const id = randomUUID();
    run(
      `INSERT INTO ask_history (id, asked_at, actor, question, answer, source_ids_json, evidence_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, askedAt, actor, question, answer, JSON.stringify(sourceIds), JSON.stringify(context.hits),
    );
    return {
      mode: 'hermes',
      state: 'connected',
      answer,
      message: answer,
      question,
      results: context.hits,
      evidence_count: context.records,
      history_id: id,
      asked_at: askedAt,
      source_ids: sourceIds,
    };
  } catch (error) {
    return reply.code(503).send({
      mode: 'error',
      state: 'hermes_unavailable',
      message: cleanHermesError(error instanceof Error ? error.message : error),
      question,
      results: context.hits,
    });
  }
});

/* ------------------------------------------------------------------ */
/* media: authorized, never a static directory                         */
/* ------------------------------------------------------------------ */

app.get('/api/media/:ref', async (req, reply) => {
  const ref = decodeURIComponent((req.params as { ref: string }).ref);
  const asset = one<any>('SELECT * FROM media_assets WHERE archive_ref = ?', ref);
  if (!asset) return reply.code(404).send({ error: 'not_found' });

  if (!MEDIA_ROOT) {
    return reply.code(409).send({
      error: 'archive_unavailable',
      message: 'The private media archive is not mounted in this environment.',
      archive_ref: asset.archive_ref,
      bytes: asset.bytes,
      sha256: asset.sha256,
    });
  }

  const root = resolve(MEDIA_ROOT);
  const target = resolve(join(root, normalize(asset.relative_path)));
  if (!target.startsWith(root + '/')) {
    audit(requestActor(req), 'media.traversal_blocked', ref);
    return reply.code(404).send();
  }
  if (!existsSync(target)) {
    return reply.code(404).send({
      error: 'file_missing',
      message: 'This asset is recorded in the manifest but is not present in this environment.',
      archive_ref: asset.archive_ref,
      sha256: asset.sha256,
    });
  }

  audit(requestActor(req), 'media.read', ref);
  const size = statSync(target).size;
  const type =
    { json: 'application/json', txt: 'text/plain', pdf: 'application/pdf', mp4: 'video/mp4', mp3: 'audio/mpeg' }[
      asset.kind as string
    ] ?? 'application/octet-stream';

  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : size - 1;
      if (start >= size || end >= size || start > end) {
        return reply.code(416).header('content-range', `bytes */${size}`).send();
      }
      return reply
        .code(206)
        .header('content-type', type)
        .header('content-range', `bytes ${start}-${end}/${size}`)
        .header('accept-ranges', 'bytes')
        .header('content-length', String(end - start + 1))
        .send(createReadStream(target, { start, end }));
    }
  }
  return reply
    .header('content-type', type)
    .header('accept-ranges', 'bytes')
    .header('content-length', String(size))
    .send(createReadStream(target));
});

/* ------------------------------------------------------------------ */
/* static web app                                                      */
/* ------------------------------------------------------------------ */

if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST, index: ['index.html'] });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
    return reply.sendFile('index.html');
  });
}

if (process.env.NODE_ENV !== 'test') {
  await app.listen({ port: PORT, host: HOST });
  startTelegramSyncWorker();
  startSourceProcessor();
  startImportWorker();
  startTopicRebuildWorker();
  startIntelligenceScheduler();
  console.log(`Crypto Intelligence backend on http://${HOST}:${PORT}`);
  console.log(`  media archive: ${MEDIA_ROOT ? 'mounted' : 'not mounted (degraded, documented)'}`);
  console.log(`  intelligence plane: ${process.env.HERMES_BASE_URL ? 'configured' : 'not connected (degraded)'}`);
  console.log(`  ingestion plane: ${ingestionConfigured() ? 'configured' : 'not connected (degraded)'}`);
  console.log(`  Satoshi source sync: ${telegramSyncConfigured() ? 'configured' : 'not connected (degraded)'}`);
  console.log(`  authentication: ${authMode}`);
  if (authMode === 'shared-password') {
    console.log(`  human verification: ${turnstileConfigured() ? 'configured' : 'not configured'}`);
  } else {
    console.log(`  access header: ${accessHeaderRequired ? 'required' : 'local development mode'}`);
  }
}

export { app };
