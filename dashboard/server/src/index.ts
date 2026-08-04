import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_ROOT, audit, all, one, run } from './db.js';
import { buildAskContext } from './ask-context.js';
import { askHermes, cleanHermesError } from './hermes-client.js';
import {
  CaptureInputError,
  captureSource,
  ingestionConfigured,
  ingestionStatus,
  recentIngestionReceipts,
} from './ingestion.js';
import { accessHeaderRequired, requestActor, requestIdentity } from './request-auth.js';
import {
  StudioInputError,
  appendStudioRevision,
  createStudioDraft,
  draftCitations,
  studioStatus,
} from './studio.js';
import * as t from './tools.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(HERE, '..', '..', 'web', 'dist');
const PORT = Number(process.env.PORT ?? 5183);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = Fastify({ logger: false, bodyLimit: 1_000_000 });

app.addHook('onSend', async (req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('X-Frame-Options', 'DENY');
  reply.header(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:",
  );
  if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'private, no-store');
});

app.addHook('preHandler', async (req, reply) => {
  if (!accessHeaderRequired || req.url.startsWith('/api/health')) return;
  const identity = requestIdentity(req);
  if (!identity.authorized) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Authentication is required.' });
  }
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

app.get('/api/brief', async () => t.brief());

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

app.get('/api/sources', async () => ({ sources: t.listSources() }));
app.get('/api/sources/:id', async (req, reply) => {
  const source = t.getSource((req.params as { id: string }).id);
  return source ?? reply.code(404).send({ error: 'not_found' });
});

app.get('/api/timeline', async (req) => {
  const q = req.query as Record<string, string>;
  return t.timeline(q.from, q.to);
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
    'pending',
  );
  audit(requestActor(req), 'note.append', id, { revision: next });
  return { event_id: id, revision: next, memory_state: 'pending' };
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
      const status = error.code.startsWith('invalid_') || error.code === 'text_too_long' ? 400 : 503;
      return reply.code(status).send({ error: error.code, message: error.message });
    }
    return reply.code(503).send({
      error: 'memory_unavailable',
      message: 'The source could not be added to private memory. Nothing was recorded as ready.',
    });
  }
});

app.post('/api/ask', async (req, reply) => {
  const body = req.body as { question?: string };
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
  audit(actor, 'ask', undefined, { length: question.length });

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
  const context = buildAskContext(question);
  try {
    const answer = await askHermes(context.input);
    return {
      mode: 'hermes',
      state: 'connected',
      answer,
      message: answer,
      question,
      results: context.hits,
      evidence_count: context.records,
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
  console.log(`Crypto Intelligence backend on http://${HOST}:${PORT}`);
  console.log(`  media archive: ${MEDIA_ROOT ? 'mounted' : 'not mounted (degraded, documented)'}`);
  console.log(`  intelligence plane: ${process.env.HERMES_BASE_URL ? 'configured' : 'not connected (degraded)'}`);
  console.log(`  ingestion plane: ${ingestionConfigured() ? 'configured' : 'not connected (degraded)'}`);
  console.log(`  access header: ${accessHeaderRequired ? 'required' : 'local development mode'}`);
}

export { app };
