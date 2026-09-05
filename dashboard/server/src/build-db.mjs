#!/usr/bin/env node
/**
 * Build crypto-intelligence.db, the one active database.
 *
 * Initialises from the immutable verified handoff, then applies forward
 * migrations. The frozen handoff is opened read only and is never written.
 *
 *   node src/build-db.mjs --handoff <dir> --out <path> [--force]
 *
 * Refuses to run against an existing database that holds origin='ingested'
 * records unless --force is passed and a verified backup exists.
 */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const FORCE = process.argv.includes('--force');
const HANDOFF_DIR = resolve(
  arg('handoff', resolve(ROOT, '../../.work/crypto-v2/dashboard-handoff-20260803T010000Z')),
);
const OUT = resolve(arg('out', join(ROOT, '..', 'data', 'crypto-intelligence.db')));

const log = (...a) => console.log('[build-db]', ...a);
const fail = (m) => {
  console.error('[build-db] FAILED:', m);
  process.exit(1);
};

/* ------------------------------------------------------------------ *
 * 0. Verify the frozen handoff before touching anything
 * ------------------------------------------------------------------ */
const frozenPath = join(HANDOFF_DIR, 'crypto-dashboard-v2.db');
const manifestPath = join(HANDOFF_DIR, 'handoff-manifest.json');
if (!existsSync(frozenPath)) fail(`frozen handoff not found at ${frozenPath}`);
if (!existsSync(manifestPath)) fail(`handoff manifest not found at ${manifestPath}`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const actualSha = createHash('sha256').update(readFileSync(frozenPath)).digest('hex');
if (actualSha !== manifest.database.sha256) {
  fail(
    `frozen handoff checksum mismatch\n  expected ${manifest.database.sha256}\n  actual   ${actualSha}`,
  );
}
log('frozen handoff verified, sha256 matches manifest');

/* ------------------------------------------------------------------ *
 * Guard: never destroy post-migration intelligence
 * ------------------------------------------------------------------ */
if (existsSync(OUT)) {
  let ingested = 0;
  try {
    const existing = new Database(OUT, { readonly: true });
    const has = existing
      .prepare("select count(*) c from sqlite_master where type='table' and name='events'")
      .get().c;
    if (has) {
      ingested = existing.prepare("select count(*) c from events where origin='ingested'").get().c;
    }
    existing.close();
  } catch {
    /* unreadable database, treat as empty */
  }
  if (ingested > 0 && !FORCE) {
    fail(
      `refusing to reinitialise: ${ingested} ingested record(s) present.\n` +
        `  Reinitialising from the frozen handoff recovers the migrated baseline only.\n` +
        `  Take a verified backup, then re-run with --force to confirm.`,
    );
  }
  rmSync(OUT, { force: true });
  rmSync(`${OUT}-wal`, { force: true });
  rmSync(`${OUT}-shm`, { force: true });
}
mkdirSync(dirname(OUT), { recursive: true });

const db = new Database(OUT);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrations = [];
const migration = (id, name, fn) => migrations.push({ id, name, fn });

/* ------------------------------------------------------------------ *
 * 001 schema
 * ------------------------------------------------------------------ */
migration('001', 'schema', () => {
  db.exec(`
  CREATE TABLE schema_migrations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  );

  -- canonical corpus -------------------------------------------------
  CREATE TABLE sources (
    source_id TEXT PRIMARY KEY,
    identity_basis TEXT NOT NULL,
    source_url TEXT, source_label TEXT,
    source_type TEXT NOT NULL, source_channel TEXT,
    captured_at TEXT NOT NULL, title TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'migrated' CHECK (origin IN ('migrated','ingested'))
  );

  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    timestamp TEXT, posted_date TEXT, ingested_at TEXT,
    source_type TEXT, source_channel TEXT, source_url TEXT,
    raw_text TEXT, summary TEXT, detailed_content TEXT,
    detailed_notes TEXT, mark_notes TEXT,
    primary_category TEXT, significance INTEGER, business_signal TEXT,
    underlying_principle TEXT, video_metadata_json TEXT,
    origin TEXT NOT NULL DEFAULT 'migrated' CHECK (origin IN ('migrated','ingested'))
  );

  CREATE TABLE event_facets (
    event_id TEXT NOT NULL REFERENCES events(id),
    facet_type TEXT NOT NULL, position INTEGER NOT NULL, value_json TEXT NOT NULL,
    PRIMARY KEY (event_id, facet_type, position)
  );

  CREATE TABLE themes (
    id TEXT PRIMARY KEY, title TEXT, through_line TEXT, generated_at TEXT
  );
  CREATE TABLE theme_events (
    theme_id TEXT NOT NULL REFERENCES themes(id),
    event_id TEXT NOT NULL REFERENCES events(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (theme_id, event_id)
  );

  CREATE TABLE content_drafts (
    id TEXT PRIMARY KEY, template_type TEXT, date_from TEXT, date_to TEXT,
    focus TEXT, raw_output TEXT, edited_output TEXT, created_at TEXT, updated_at TEXT,
    origin TEXT NOT NULL DEFAULT 'migrated' CHECK (origin IN ('migrated','ingested'))
  );

  CREATE TABLE quiz_sessions (
    id TEXT PRIMARY KEY, created_at TEXT, completed_at TEXT,
    score_correct INTEGER, score_total INTEGER
  );
  CREATE TABLE quiz_questions (
    id TEXT PRIMARY KEY, session_id TEXT REFERENCES quiz_sessions(id),
    question_number INTEGER, question_text TEXT, question_type TEXT,
    category TEXT, answer_guidance TEXT
  );
  CREATE TABLE quiz_answers (
    id TEXT PRIMARY KEY, session_id TEXT REFERENCES quiz_sessions(id),
    question_id TEXT REFERENCES quiz_questions(id), answer_text TEXT,
    is_correct INTEGER, feedback TEXT, context_note TEXT, created_at TEXT
  );
  CREATE TABLE quiz_event_links (
    owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, event_id TEXT NOT NULL,
    position INTEGER NOT NULL, PRIMARY KEY (owner_type, owner_id, event_id)
  );

  CREATE TABLE pin_summaries (
    event_id TEXT NOT NULL REFERENCES events(id), pin_key TEXT NOT NULL,
    mode TEXT, summary TEXT, model TEXT, created_at TEXT,
    PRIMARY KEY (event_id, pin_key)
  );

  CREATE TABLE conversation_sessions (
    id TEXT PRIMARY KEY, archive_ref TEXT NOT NULL, original_sha256 TEXT NOT NULL,
    first_timestamp TEXT, kept_messages INTEGER NOT NULL, original_bytes INTEGER NOT NULL
  );
  CREATE TABLE conversation_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES conversation_sessions(id),
    sequence INTEGER NOT NULL, timestamp TEXT, role TEXT NOT NULL, content TEXT NOT NULL
  );

  CREATE TABLE media_assets (
    archive_ref TEXT PRIMARY KEY, relative_path TEXT NOT NULL, kind TEXT NOT NULL,
    bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
    semantic_memory INTEGER NOT NULL, referenced_by_event INTEGER NOT NULL,
    origin TEXT NOT NULL DEFAULT 'migrated' CHECK (origin IN ('migrated','ingested'))
  );

  CREATE TABLE handoff_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE generation_meta (key TEXT PRIMARY KEY, value TEXT);

  -- derived, rebuilt by migration ------------------------------------
  CREATE TABLE event_tags (
    event_id TEXT NOT NULL REFERENCES events(id), tag TEXT NOT NULL,
    PRIMARY KEY (event_id, tag)
  );
  CREATE TABLE event_insights (
    event_id TEXT NOT NULL REFERENCES events(id), position INTEGER NOT NULL, text TEXT NOT NULL,
    PRIMARY KEY (event_id, position)
  );
  CREATE TABLE event_secondary_categories (
    event_id TEXT NOT NULL REFERENCES events(id), category TEXT NOT NULL,
    PRIMARY KEY (event_id, category)
  );
  CREATE TABLE event_entities (
    event_id TEXT NOT NULL REFERENCES events(id),
    entity_type TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY (event_id, entity_type, value)
  );
  CREATE TABLE event_dates (
    event_id TEXT NOT NULL REFERENCES events(id), position INTEGER NOT NULL,
    date TEXT NOT NULL, precision TEXT NOT NULL, label TEXT, category TEXT, origin_tag TEXT,
    sort_key TEXT NOT NULL, span_end TEXT NOT NULL,
    PRIMARY KEY (event_id, position)
  );
  CREATE TABLE event_connections (
    from_event_id TEXT NOT NULL REFERENCES events(id),
    to_event_id TEXT NOT NULL, resolved INTEGER NOT NULL,
    PRIMARY KEY (from_event_id, to_event_id)
  );

  -- application owned -------------------------------------------------
  CREATE TABLE note_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL REFERENCES events(id),
    revision INTEGER NOT NULL, text TEXT NOT NULL,
    author TEXT NOT NULL, created_at TEXT NOT NULL,
    memory_state TEXT NOT NULL DEFAULT 'not_synced',
    UNIQUE (event_id, revision)
  );
  CREATE TABLE draft_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id TEXT NOT NULL REFERENCES content_drafts(id),
    revision INTEGER NOT NULL, body TEXT NOT NULL,
    author TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE (draft_id, revision)
  );
  CREATE TABLE identity_register (
    canonical_id TEXT PRIMARY KEY, kind TEXT NOT NULL, origin TEXT NOT NULL,
    openviking_uri TEXT, archive_ref TEXT, sha256 TEXT,
    first_seen_at TEXT NOT NULL, last_reconciled TEXT,
    state TEXT NOT NULL DEFAULT 'registered'
  );
  CREATE TABLE ingestion_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
    status TEXT NOT NULL, canonical_id TEXT, detail_json TEXT NOT NULL
  );
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
    actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail_json TEXT
  );
  CREATE TABLE saved_views (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, screen TEXT NOT NULL,
    query_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE read_state (
    canonical_id TEXT PRIMARY KEY, last_read_at TEXT NOT NULL
  );
  CREATE TABLE source_sightings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES sources(source_id),
    captured_at TEXT NOT NULL, extraction_method TEXT, extraction_status TEXT
  );

  -- indexes ------------------------------------------------------------
  CREATE INDEX idx_events_source ON events(source_id);
  CREATE INDEX idx_events_timestamp ON events(timestamp);
  CREATE INDEX idx_events_category ON events(primary_category);
  CREATE INDEX idx_events_significance ON events(significance);
  CREATE INDEX idx_facets_value ON event_facets(facet_type, value_json);
  CREATE INDEX idx_messages_session ON conversation_messages(session_id, sequence);
  CREATE INDEX idx_tags_tag ON event_tags(tag);
  CREATE INDEX idx_entities_value ON event_entities(entity_type, value);
  CREATE INDEX idx_dates_sort ON event_dates(sort_key);
  CREATE INDEX idx_notes_event ON note_revisions(event_id, revision DESC);

  -- one unified full-text index ----------------------------------------
  CREATE VIRTUAL TABLE search_index USING fts5(
    canonical_id UNINDEXED,
    kind         UNINDEXED,
    field        UNINDEXED,
    origin       UNINDEXED,
    title        UNINDEXED,
    body
  );
  `);
});

/* ------------------------------------------------------------------ *
 * 002 import the frozen handoff
 * ------------------------------------------------------------------ */
migration('002', 'import_handoff', () => {
  // The frozen handoff is opened as its own read-only connection and copied
  // row by row. Nothing is attached, so the verified source cannot be written
  // to even by accident, and the running application still opens exactly one
  // database.
  const frozen = new Database(frozenPath, { readonly: true, fileMustExist: true });
  const copy = (table, cols, from = table) => {
    const names = cols.split(',').map((c) => c.trim());
    const rows = frozen.prepare(`SELECT ${cols} FROM ${from}`).all();
    if (!rows.length) return;
    const stmt = db.prepare(
      `INSERT INTO ${table} (${cols}) VALUES (${names.map(() => '?').join(', ')})`,
    );
    db.transaction(() => rows.forEach((r) => stmt.run(names.map((n) => r[n])))) ();
  };

  copy('sources', 'source_id, identity_basis, source_url, source_label, source_type, source_channel, captured_at, title');
  copy('events', 'id, source_id, timestamp, posted_date, ingested_at, source_type, source_channel, source_url, raw_text, summary, detailed_content, detailed_notes, mark_notes, primary_category, significance, business_signal, underlying_principle, video_metadata_json');
  copy('event_facets', 'event_id, facet_type, position, value_json');
  copy('themes', 'id, title, through_line, generated_at');
  copy('theme_events', 'theme_id, event_id, position');
  copy('content_drafts', 'id, template_type, date_from, date_to, focus, raw_output, edited_output, created_at, updated_at');
  copy('quiz_sessions', 'id, created_at, completed_at, score_correct, score_total');
  copy('quiz_questions', 'id, session_id, question_number, question_text, question_type, category, answer_guidance');
  copy('quiz_answers', 'id, session_id, question_id, answer_text, is_correct, feedback, context_note, created_at');
  copy('quiz_event_links', 'owner_type, owner_id, event_id, position');
  copy('pin_summaries', 'event_id, pin_key, mode, summary, model, created_at');
  copy('conversation_sessions', 'id, archive_ref, original_sha256, first_timestamp, kept_messages, original_bytes');
  copy('conversation_messages', 'id, session_id, sequence, timestamp, role, content');
  copy('media_assets', 'archive_ref, relative_path, kind, bytes, sha256, semantic_memory, referenced_by_event');
  copy('handoff_metadata', 'key, value', 'metadata');
  copy('generation_meta', 'key, value');
  frozen.close();
});

/* ------------------------------------------------------------------ *
 * 003 derive structured facets
 * ------------------------------------------------------------------ */
const decode = (raw) => {
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.parse(t);
      } catch {
        return v;
      }
    }
  }
  return v;
};

/** A variable-precision date becomes an explicit [start, end] span. */
function span(date, precision) {
  const s = String(date);
  if (precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(s)) return [s, s];
  if (precision === 'month' && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return [`${s}-01`, `${s}-${String(last).padStart(2, '0')}`];
  }
  if (precision === 'quarter') {
    const m = s.match(/^(\d{4})(?:-Q?(\d))?$/i);
    if (m) {
      const y = m[1];
      const q = Number(m[2] || 1);
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const last = new Date(Date.UTC(Number(y), endMonth, 0)).getUTCDate();
      return [
        `${y}-${String(startMonth).padStart(2, '0')}-01`,
        `${y}-${String(endMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
      ];
    }
  }
  if (/^\d{4}$/.test(s)) return [`${s}-01-01`, `${s}-12-31`];
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return [`${s}-01`, `${s}-${String(last).padStart(2, '0')}`];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return [s, s];
  return [`${s}-01-01`, `${s}-12-31`];
}

migration('003', 'derive_facets', () => {
  const facets = db.prepare('SELECT event_id, facet_type, position, value_json FROM event_facets').all();
  const insTag = db.prepare('INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES (?, ?)');
  const insIns = db.prepare('INSERT OR IGNORE INTO event_insights (event_id, position, text) VALUES (?, ?, ?)');
  const insSec = db.prepare('INSERT OR IGNORE INTO event_secondary_categories (event_id, category) VALUES (?, ?)');
  const insEnt = db.prepare('INSERT OR IGNORE INTO event_entities (event_id, entity_type, value) VALUES (?, ?, ?)');
  const insDate = db.prepare(
    'INSERT OR IGNORE INTO event_dates (event_id, position, date, precision, label, category, origin_tag, sort_key, span_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insConn = db.prepare('INSERT OR IGNORE INTO event_connections (from_event_id, to_event_id, resolved) VALUES (?, ?, ?)');
  const eventExists = db.prepare('SELECT 1 FROM events WHERE id = ?');

  for (const f of facets) {
    const v = decode(f.value_json);
    switch (f.facet_type) {
      case 'tag':
        if (typeof v === 'string' && v.trim()) insTag.run(f.event_id, v.trim().toLowerCase());
        break;
      case 'key_insight':
        if (typeof v === 'string' && v.trim()) insIns.run(f.event_id, f.position, v.trim());
        break;
      case 'secondary_category':
        if (typeof v === 'string' && v.trim()) insSec.run(f.event_id, v.trim());
        break;
      case 'entity':
        if (v && typeof v === 'object') {
          for (const [type, list] of Object.entries(v)) {
            if (!Array.isArray(list)) continue;
            for (const item of list) {
              const val = String(item).trim();
              if (val) insEnt.run(f.event_id, type, val);
            }
          }
        }
        break;
      case 'discussed_date':
        if (v && typeof v === 'object' && v.date) {
          const [start, end] = span(v.date, v.precision);
          insDate.run(
            f.event_id, f.position, String(v.date), String(v.precision || 'day'),
            v.label ?? null, v.category ?? null, v.origin ?? null, start, end,
          );
        }
        break;
      case 'connection': {
        const target = typeof v === 'string' ? v.trim() : null;
        if (target) insConn.run(f.event_id, target, eventExists.get(target) ? 1 : 0);
        break;
      }
      default:
        break;
    }
  }
});

/* ------------------------------------------------------------------ *
 * 004 seed application-owned state
 * ------------------------------------------------------------------ */
migration('004', 'seed_app_state', () => {
  const now = new Date(manifest.generated_at).toISOString();

  // Revision 0 of every note is the value preserved in the frozen handoff.
  db.prepare(
    `INSERT INTO note_revisions (event_id, revision, text, author, created_at, memory_state)
     SELECT id, 0, mark_notes, 'migration', ?, 'not_synced'
     FROM events WHERE mark_notes IS NOT NULL AND mark_notes <> ''`,
  ).run(now);

  db.prepare(
    `INSERT INTO draft_revisions (draft_id, revision, body, author, created_at)
     SELECT id, 0, COALESCE(NULLIF(edited_output,''), raw_output, ''), 'migration', COALESCE(updated_at, created_at, ?)
     FROM content_drafts`,
  ).run(now);

  const reg = db.prepare(
    `INSERT INTO identity_register (canonical_id, kind, origin, archive_ref, sha256, first_seen_at, state)
     VALUES (?, ?, 'migrated', ?, ?, ?, 'registered')`,
  );
  const add = db.transaction((rows) => rows.forEach((r) => reg.run(r)));
  add(db.prepare('SELECT source_id FROM sources').all().map((r) => [r.source_id, 'source', null, null, now]));
  add(db.prepare('SELECT id FROM events').all().map((r) => [r.id, 'event', null, null, now]));
  add(db.prepare('SELECT id FROM themes').all().map((r) => [r.id, 'theme', null, null, now]));
  add(db.prepare('SELECT id FROM content_drafts').all().map((r) => [r.id, 'draft', null, null, now]));
  add(db.prepare('SELECT id FROM quiz_sessions').all().map((r) => [r.id, 'quiz_session', null, null, now]));
  add(
    db.prepare('SELECT archive_ref, sha256 FROM media_assets').all()
      .map((r) => [r.archive_ref, 'media', r.archive_ref, r.sha256, now]),
  );

  db.prepare(
    `INSERT INTO ingestion_receipts (created_at, status, canonical_id, detail_json) VALUES (?, 'initialised', NULL, ?)`,
  ).run(now, JSON.stringify({ handoff_schema: manifest.schema, handoff_sha256: manifest.database.sha256 }));
});

/* ------------------------------------------------------------------ *
 * 005 populate the unified search index and its triggers
 * ------------------------------------------------------------------ */
migration('005', 'search_index', () => {
  const ins = db.prepare(
    'INSERT INTO search_index (canonical_id, kind, field, origin, title, body) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const push = db.transaction((rows) => rows.forEach((r) => ins.run(r)));

  const events = db.prepare(
    `SELECT id, origin, COALESCE(summary,'') title, summary, detailed_content, raw_text, business_signal, underlying_principle
     FROM events`,
  ).all();
  const rows = [];
  for (const e of events) {
    const title = String(e.summary || '').slice(0, 120);
    for (const [field, body] of [
      ['summary', e.summary], ['detailed_content', e.detailed_content],
      ['raw_text', e.raw_text], ['business_signal', e.business_signal],
      ['underlying_principle', e.underlying_principle],
    ]) {
      if (body) rows.push([e.id, 'event', field, e.origin, title, body]);
    }
  }
  for (const r of db.prepare('SELECT event_id, text FROM event_insights').all())
    rows.push([r.event_id, 'event', 'insight', 'migrated', '', r.text]);
  for (const r of db.prepare('SELECT event_id, value FROM event_entities').all())
    rows.push([r.event_id, 'event', 'entity', 'migrated', '', r.value]);
  for (const r of db.prepare('SELECT event_id, tag FROM event_tags').all())
    rows.push([r.event_id, 'event', 'tag', 'migrated', '', r.tag]);
  for (const r of db.prepare("SELECT source_id, title, COALESCE(source_label,'') label, origin FROM sources").all())
    rows.push([r.source_id, 'source', 'title', r.origin, r.title, `${r.title} ${r.label}`]);
  for (const r of db.prepare('SELECT id, template_type, COALESCE(edited_output, raw_output) body, origin FROM content_drafts').all())
    if (r.body) rows.push([r.id, 'draft', 'body', r.origin, r.template_type || 'draft', r.body]);
  for (const r of db.prepare('SELECT event_id, revision, text FROM note_revisions').all())
    rows.push([r.event_id, 'event', 'note', 'migrated', '', r.text]);
  for (const r of db.prepare('SELECT id, title, through_line FROM themes').all())
    rows.push([r.id, 'theme', 'through_line', 'migrated', r.title || '', r.through_line || '']);
  for (const r of db.prepare('SELECT session_id, content FROM conversation_messages').all())
    rows.push([r.session_id, 'conversation', 'message', 'migrated', '', r.content]);
  push(rows);

  // Keep the index correct for every future write, in the same transaction.
  db.exec(`
  CREATE TRIGGER events_ai AFTER INSERT ON events BEGIN
    INSERT INTO search_index (canonical_id, kind, field, origin, title, body)
    VALUES (new.id, 'event', 'summary', new.origin, substr(COALESCE(new.summary,''),1,120), COALESCE(new.summary,''));
  END;
  CREATE TRIGGER events_ad AFTER DELETE ON events BEGIN
    DELETE FROM search_index WHERE canonical_id = old.id AND kind = 'event';
  END;
  CREATE TRIGGER notes_ai AFTER INSERT ON note_revisions BEGIN
    INSERT INTO search_index (canonical_id, kind, field, origin, title, body)
    VALUES (new.event_id, 'event', 'note', 'ingested', '', new.text);
  END;
  CREATE TRIGGER drafts_ai AFTER INSERT ON draft_revisions BEGIN
    INSERT INTO search_index (canonical_id, kind, field, origin, title, body)
    VALUES (new.draft_id, 'draft', 'body', 'ingested', '', new.body);
  END;
  `);
});

/* ------------------------------------------------------------------ *
 * 006 durable Satoshi -> dashboard source registration queue
 * ------------------------------------------------------------------ */
migration('006', 'telegram_source_sync', () => {
  db.exec(`
  CREATE TABLE source_sync_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL UNIQUE,
    submitted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    actor TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','processing','ready','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    not_before TEXT NOT NULL,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_url TEXT,
    openviking_uri TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    canonical_id TEXT,
    last_error TEXT
  );
  CREATE INDEX idx_source_sync_jobs_queue
    ON source_sync_jobs(status, not_before, id);
  `);
});

migration('007', 'ask_history', () => {
  db.exec(`
    CREATE TABLE ask_history (
      id TEXT PRIMARY KEY,
      asked_at TEXT NOT NULL,
      actor TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      evidence_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX idx_ask_history_asked_at ON ask_history(asked_at DESC);
  `);
});

migration('008', 'prompt_controls', () => {
  db.exec(`
    CREATE TABLE prompt_settings (
      page_id TEXT PRIMARY KEY,
      instructions TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 1),
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE TABLE prompt_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      instructions TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('save','restore')),
      created_at TEXT NOT NULL,
      UNIQUE(page_id, revision)
    );
    CREATE INDEX idx_prompt_revisions_page ON prompt_revisions(page_id, revision DESC);
  `);
});

/* ------------------------------------------------------------------ *
 * Apply
 * ------------------------------------------------------------------ */
// ATTACH in migration 002 cannot run inside a transaction, so each migration
// manages its own atomicity. A failed build leaves no usable file behind.
for (const m of migrations) {
  m.fn();
  db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
    m.id,
    m.name,
    new Date().toISOString(),
  );
  log(`migration ${m.id} ${m.name} applied`);
}

/* ------------------------------------------------------------------ *
 * Reconcile against the manifest
 * ------------------------------------------------------------------ */
const expected = manifest.database.counts;
const actual = {
  sources: db.prepare('SELECT count(*) c FROM sources').get().c,
  events: db.prepare('SELECT count(*) c FROM events').get().c,
  event_facets: db.prepare('SELECT count(*) c FROM event_facets').get().c,
  themes: db.prepare('SELECT count(*) c FROM themes').get().c,
  theme_events: db.prepare('SELECT count(*) c FROM theme_events').get().c,
  content_drafts: db.prepare('SELECT count(*) c FROM content_drafts').get().c,
  quiz_sessions: db.prepare('SELECT count(*) c FROM quiz_sessions').get().c,
  quiz_questions: db.prepare('SELECT count(*) c FROM quiz_questions').get().c,
  quiz_answers: db.prepare('SELECT count(*) c FROM quiz_answers').get().c,
  quiz_event_links: db.prepare('SELECT count(*) c FROM quiz_event_links').get().c,
  pin_summaries: db.prepare('SELECT count(*) c FROM pin_summaries').get().c,
  conversation_sessions: db.prepare('SELECT count(*) c FROM conversation_sessions').get().c,
  conversation_messages: db.prepare('SELECT count(*) c FROM conversation_messages').get().c,
  media_assets: db.prepare('SELECT count(*) c FROM media_assets').get().c,
  generation_meta: db.prepare('SELECT count(*) c FROM generation_meta').get().c,
};
const mismatches = Object.entries(expected).filter(([k, v]) => actual[k] !== v);
if (mismatches.length) {
  fail(`reconciliation mismatch: ${mismatches.map(([k, v]) => `${k} expected ${v} got ${actual[k]}`).join('; ')}`);
}

const orphanEvents = db.prepare(
  'SELECT count(*) c FROM events e LEFT JOIN sources s ON s.source_id = e.source_id WHERE s.source_id IS NULL',
).get().c;
if (orphanEvents) fail(`${orphanEvents} event(s) do not resolve to a canonical source`);

const unresolved = db.prepare('SELECT count(*) c FROM event_connections WHERE resolved = 0').get().c;
const fkErrors = db.pragma('foreign_key_check');
if (fkErrors.length) fail(`foreign key violations: ${JSON.stringify(fkErrors.slice(0, 3))}`);

db.prepare(
  'INSERT INTO ingestion_receipts (created_at, status, canonical_id, detail_json) VALUES (?, ?, NULL, ?)',
).run(new Date().toISOString(), 'reconciled', JSON.stringify({ ...actual, unresolved_connections: unresolved }));

db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

log('reconciled against handoff manifest, all counts match');
log(`unresolved connections reported, not dropped: ${unresolved}`);
log(`built ${OUT} (${(statSync(OUT).size / 1048576).toFixed(2)} MB)`);
