/**
 * The narrow read layer over the one active database.
 *
 * Every function here is deterministic and does no reasoning, no ranking
 * beyond SQLite's own match ordering, and no context assembly. This is the
 * same surface that would be exposed to Hermes as read-only MCP tools.
 */
import { all, one, db } from './db.js';
import { buildSourceBrief, eventPresentation } from './presentation.js';
import { activeTopicOrganization } from './prompt-controls.js';
import { eventEditorial, RESEARCH_EVENT } from './editorial-store.js';
import { repeats } from './editorial.js';

/* ------------------------------------------------------------------ */
/* filters                                                             */
/* ------------------------------------------------------------------ */

export interface EventFilters {
  q?: string;
  category?: string[];
  significanceMin?: number;
  significanceMax?: number;
  sourceType?: string[];
  entity?: string;
  tag?: string;
  from?: string;
  to?: string;
  axis?: 'subject' | 'capture';
  hasNotes?: boolean;
  sort?: 'subject' | 'capture' | 'significance' | 'relevance';
  limit?: number;
  offset?: number;
}

const SORTS: Record<string, string> = {
  subject: 'subject_date DESC, e.id ASC',
  capture: 'e.timestamp DESC, e.id ASC',
  significance: 'e.significance DESC, subject_date DESC, e.id ASC',
};

/** Event dates remain separate from capture timestamps, including undated records. */
const SUBJECT_DATE = `(SELECT MIN(d.sort_key) FROM event_dates d WHERE d.event_id = e.id)`;

/** Distinct retained sources connected to an event, including its own source. */
const REFERENCE_COUNT = `(SELECT count(DISTINCT linked.source_id) FROM (
  SELECT e.source_id AS source_id
  UNION ALL
  SELECT related.source_id
    FROM event_connections c
    JOIN events related ON related.id = CASE WHEN c.from_event_id=e.id THEN c.to_event_id ELSE c.from_event_id END
   WHERE c.resolved=1 AND (c.from_event_id=e.id OR c.to_event_id=e.id)
) linked)`;

export function findEvents(f: EventFilters = {}) {
  const where: string[] = [RESEARCH_EVENT];
  const p: any[] = [];

  if (f.q?.trim()) {
    where.push(
      `e.id IN (SELECT canonical_id FROM search_index WHERE kind='event' AND search_index MATCH ?)`,
    );
    p.push(ftsQuery(f.q));
  }
  if (f.category?.length) {
    where.push(`e.primary_category IN (${f.category.map(() => '?').join(',')})`);
    p.push(...f.category);
  }
  if (f.sourceType?.length) {
    where.push(`e.source_type IN (${f.sourceType.map(() => '?').join(',')})`);
    p.push(...f.sourceType);
  }
  if (f.significanceMin != null) {
    where.push('e.significance >= ?');
    p.push(f.significanceMin);
  }
  if (f.significanceMax != null) {
    where.push('e.significance <= ?');
    p.push(f.significanceMax);
  }
  if (f.entity) {
    where.push('EXISTS (SELECT 1 FROM event_entities x WHERE x.event_id = e.id AND x.value = ?)');
    p.push(f.entity);
  }
  if (f.tag) {
    where.push('EXISTS (SELECT 1 FROM event_tags t WHERE t.event_id = e.id AND t.tag = ?)');
    p.push(f.tag);
  }
  if (f.hasNotes != null) {
    where.push(
      f.hasNotes
        ? 'EXISTS (SELECT 1 FROM note_revisions n WHERE n.event_id = e.id)'
        : 'NOT EXISTS (SELECT 1 FROM note_revisions n WHERE n.event_id = e.id)',
    );
  }
  if (f.from || f.to) {
    if ((f.axis ?? 'subject') === 'subject') {
      const clauses: string[] = [];
      if (f.from) {
        clauses.push('d.span_end >= ?');
        p.push(f.from);
      }
      if (f.to) {
        clauses.push('d.sort_key <= ?');
        p.push(f.to);
      }
      where.push(`EXISTS (SELECT 1 FROM event_dates d WHERE d.event_id = e.id AND ${clauses.join(' AND ')})`);
    } else {
      if (f.from) {
        where.push('substr(e.timestamp,1,10) >= ?');
        p.push(f.from);
      }
      if (f.to) {
        where.push('substr(e.timestamp,1,10) <= ?');
        p.push(f.to);
      }
    }
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = SORTS[f.sort ?? 'subject'] ?? SORTS.subject;
  const limit = Math.min(f.limit ?? 200, 500);
  const offset = f.offset ?? 0;

  const rows = all(
    `SELECT e.id, e.origin, e.timestamp, e.primary_category, e.significance,
            e.summary, e.business_signal, e.source_id, e.source_type, e.source_channel,
            ${SUBJECT_DATE} AS subject_date,
            s.title AS source_title, s.source_label, s.source_url,
            ${REFERENCE_COUNT} AS reference_count,
            (SELECT count(*) FROM event_insights i WHERE i.event_id = e.id) AS insight_count,
            (SELECT count(*) FROM event_entities x WHERE x.event_id = e.id) AS entity_count,
            (SELECT count(*) FROM event_dates d WHERE d.event_id = e.id) AS date_count,
            (SELECT text FROM note_revisions n WHERE n.event_id = e.id
              ORDER BY n.revision DESC LIMIT 1) AS note,
            (SELECT count(*) FROM media_assets m WHERE m.referenced_by_event = 1
              AND m.relative_path LIKE '%' || e.id || '%') AS media_count
       FROM events e JOIN sources s ON s.source_id = e.source_id
       ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...p,
    limit,
    offset,
  );

  const total = one<{ c: number }>(
    `SELECT count(*) c FROM events e JOIN sources s ON s.source_id = e.source_id ${clause}`,
    ...p,
  )!.c;

  return { total, limit, offset, events: rows.map(withTags) };
}

const tagStmt = () => db.prepare('SELECT tag FROM event_tags WHERE event_id = ? ORDER BY tag');
let _tagStmt: ReturnType<typeof tagStmt> | null = null;
function withTags<T extends { id: string }>(row: T) {
  _tagStmt ??= tagStmt();
  return { ...row, tags: (_tagStmt.all(row.id) as { tag: string }[]).map((t) => t.tag) };
}

/** FTS5 is given a quoted phrase-safe query, never raw user text. */
export function ftsQuery(input: string) {
  const terms = input
    .toLowerCase()
    .replace(/["'()*:^-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (!terms.length) return '""';
  return terms.map((t) => `"${t}"*`).join(' OR ');
}

/* ------------------------------------------------------------------ */
/* single objects                                                      */
/* ------------------------------------------------------------------ */

export function getEvent(id: string) {
  const event = one(
    `SELECT e.*, ${SUBJECT_DATE} AS subject_date FROM events e WHERE e.id = ?`,
    id,
  );
  if (!event) return null;

  const source = one('SELECT * FROM sources WHERE source_id = ?', event.source_id);
  const insights = all('SELECT position, text FROM event_insights WHERE event_id = ? ORDER BY position', id);
  const tags = all('SELECT tag FROM event_tags WHERE event_id = ? ORDER BY tag', id).map((r) => r.tag);
  const secondary = all('SELECT category FROM event_secondary_categories WHERE event_id = ?', id).map((r) => r.category);
  const entityRows = all('SELECT entity_type, value FROM event_entities WHERE event_id = ? ORDER BY entity_type, value', id);
  const entities: Record<string, string[]> = {};
  for (const r of entityRows) (entities[r.entity_type] ??= []).push(r.value);

  const dates = all(
    'SELECT position, date, precision, label, category, sort_key, span_end FROM event_dates WHERE event_id = ? ORDER BY sort_key',
    id,
  );

  const connections = all(
    `SELECT c.to_event_id AS id, c.resolved,
            e.summary, e.primary_category, e.significance,
            ${SUBJECT_DATE} AS subject_date
       FROM event_connections c LEFT JOIN events e ON e.id = c.to_event_id
      WHERE c.from_event_id = ? ORDER BY c.resolved DESC, c.to_event_id`,
    id,
  );

  const notes = all(
    'SELECT revision, text, author, created_at, memory_state FROM note_revisions WHERE event_id = ? ORDER BY revision DESC',
    id,
  );

  const pins = all('SELECT pin_key, mode, summary, model, created_at FROM pin_summaries WHERE event_id = ?', id);

  const quiz = all(
    `SELECT q.id, q.question_text, q.question_type, q.category, q.session_id
       FROM quiz_event_links l JOIN quiz_questions q ON q.id = l.owner_id
      WHERE l.owner_type = 'question' AND l.event_id = ?`,
    id,
  );

  const themes = all(
    'SELECT t.id, t.title, te.position FROM theme_events te JOIN themes t ON t.id = te.theme_id WHERE te.event_id = ?',
    id,
  );

  const media = all(
    `SELECT archive_ref, relative_path, kind, bytes, sha256, semantic_memory
       FROM media_assets WHERE relative_path LIKE '%' || ? || '%'`,
    id,
  );

  const related = relatedEvents(id);

  const editorial = eventEditorial(id);
  const presentation = eventPresentation({ ...event, insights, editorial });
  return { ...event, editorial, source, insights, tags, secondary, entities, dates, connections, notes, pins, quiz, themes, media, related, presentation };
}

/** The preserved relatedness rule: two or more shared entities. */
export function relatedEvents(id: string, minShared = 2, limit = 12) {
  return all(
    `SELECT e.id, e.summary, e.primary_category, e.significance, ${SUBJECT_DATE} AS subject_date,
            count(*) AS shared
       FROM event_entities a
       JOIN event_entities b ON b.value = a.value AND b.entity_type = a.entity_type AND b.event_id <> a.event_id
       JOIN events e ON e.id = b.event_id
      WHERE a.event_id = ? AND ${RESEARCH_EVENT}
      GROUP BY e.id HAVING shared >= ?
      ORDER BY shared DESC, subject_date DESC LIMIT ?`,
    id,
    minShared,
    limit,
  );
}

export function getSource(id: string) {
  const source = one('SELECT * FROM sources WHERE source_id = ?', id);
  if (!source) return null;
  const events = all(
    `SELECT e.id, e.summary, e.primary_category, e.significance, e.timestamp,
            e.detailed_content, e.detailed_notes, e.raw_text,
            ${SUBJECT_DATE} AS subject_date,
            (SELECT group_concat(i.text, char(10)) FROM event_insights i WHERE i.event_id=e.id) AS insight_text
       FROM events e WHERE e.source_id = ? AND ${RESEARCH_EVENT} ORDER BY subject_date DESC`,
    id,
  );
  return { ...source, events, research_brief: buildSourceBrief(source, events) };
}

export function listSources() {
  return all(
    `SELECT s.*, count(e.id) AS event_count,
            max(e.significance) AS max_significance,
            max(${SUBJECT_DATE}) AS latest_subject_date,
            (SELECT count(*) FROM event_insights i JOIN events ie ON ie.id=i.event_id WHERE ie.source_id=s.source_id AND NOT EXISTS(SELECT 1 FROM event_editorial ed WHERE ed.event_id=ie.id AND ed.kind!='research')) AS insight_count,
            (SELECT group_concat(DISTINCT t.tag) FROM event_tags t JOIN events te ON te.id=t.event_id WHERE te.source_id=s.source_id AND NOT EXISTS(SELECT 1 FROM event_editorial ed WHERE ed.event_id=te.id AND ed.kind!='research')) AS tags
       FROM sources s LEFT JOIN events e ON e.source_id = s.source_id AND ${RESEARCH_EVENT}
      GROUP BY s.source_id ORDER BY event_count DESC, s.captured_at DESC`,
  );
}

/* ------------------------------------------------------------------ */
/* aggregate views                                                     */
/* ------------------------------------------------------------------ */

export function timeline(from?: string, to?: string) {
  const p: any[] = [];
  let clause = `WHERE ${RESEARCH_EVENT}`;
  if (from || to) {
    const c: string[] = [];
    if (from) {
      c.push('d.span_end >= ?');
      p.push(from);
    }
    if (to) {
      c.push('d.sort_key <= ?');
      p.push(to);
    }
    clause += ` AND ${c.join(' AND ')}`;
  }
  const pins = all(
    `SELECT d.event_id, d.position, d.date, d.precision,
            COALESCE((SELECT headline FROM event_editorial ed WHERE ed.event_id=e.id AND ed.kind='research'),d.label) AS label, d.category,
            d.sort_key, d.span_end, e.primary_category, e.significance, e.summary,
            e.detailed_content, e.source_id, s.title AS source_title,
            s.source_label, s.source_url,
            (SELECT i.text FROM event_insights i WHERE i.event_id=e.id ORDER BY i.position LIMIT 1) AS key_takeaway,
            ${REFERENCE_COUNT} AS reference_count
       FROM event_dates d JOIN events e ON e.id = d.event_id
       JOIN sources s ON s.source_id=e.source_id
       ${clause} ORDER BY d.sort_key`,
    ...p,
  );
  const captures = all(
    `SELECT e.id, substr(e.timestamp,1,10) AS date, e.primary_category, e.significance, e.summary
       FROM events e WHERE e.timestamp IS NOT NULL AND ${RESEARCH_EVENT} ORDER BY e.timestamp`,
  );
  const bounds = one<{ min: string; max: string }>(
    `SELECT min(sort_key) AS min, max(span_end) AS max FROM event_dates d JOIN events e ON e.id=d.event_id WHERE ${RESEARCH_EVENT}`,
  )!;
  const undated = all(`SELECT e.id AS event_id,e.summary,e.primary_category,e.source_id,e.significance,
    ${REFERENCE_COUNT} AS reference_count,
    COALESCE((SELECT headline FROM event_editorial ed WHERE ed.event_id=e.id AND ed.kind='research'),e.summary) AS label,
    s.title AS source_title,s.source_url,s.captured_at,
    (SELECT quote FROM event_evidence proof WHERE proof.event_id=e.id) AS evidence_quote
    FROM events e JOIN sources s ON s.source_id=e.source_id
    WHERE ${RESEARCH_EVENT} AND NOT EXISTS(SELECT 1 FROM event_dates d WHERE d.event_id=e.id)
    ORDER BY s.captured_at DESC,e.id`);
  return { pins, captures, bounds, undated, event_count: new Set(pins.map((pin) => pin.event_id)).size };
}

function dossierParagraph(value: unknown, limit = 420) {
  const text = String(value ?? '')
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/);
  let result = '';
  for (const sentence of sentences) {
    const next = `${result} ${sentence.trim()}`.trim();
    if (next.length > limit) break;
    result = next;
  }
  if (result.length >= Math.min(170, limit / 2)) return result;
  const clipped = text.slice(0, limit);
  const boundary = Math.max(clipped.lastIndexOf('; '), clipped.lastIndexOf(', '), clipped.lastIndexOf(' '));
  return `${clipped.slice(0, boundary > limit * .65 ? boundary : limit).trim()}…`;
}

/**
 * The Timeline dossier mirrors Mark's approved expanded-event design while
 * remaining evidence-only. Every sentence below already exists in the active
 * database. This function selects and groups stored material, but never asks a
 * model to invent reactions, sources, or follow-up claims.
 */
export function timelineDossier(id: string): any {
  const editorial = eventEditorial(id);
  if (editorial?.kind === 'source_metadata') return null;
  if (editorial?.kind === 'duplicate' && editorial.related_event_id && editorial.related_event_id !== id) return timelineDossier(editorial.related_event_id);
  const event = one<any>(
    `SELECT e.*, ${SUBJECT_DATE} AS subject_date,
            ${REFERENCE_COUNT} AS reference_count
       FROM events e WHERE e.id = ?`,
    id,
  );
  if (!event) return null;

  const source = one<any>('SELECT * FROM sources WHERE source_id = ?', event.source_id);
  const insights = all<any>(
    'SELECT position, text FROM event_insights WHERE event_id = ? ORDER BY position',
    id,
  );

  const related = all<any>(
    `WITH related_ids(id) AS (
       SELECT to_event_id FROM event_connections
        WHERE from_event_id = ? AND resolved = 1
       UNION
       SELECT from_event_id FROM event_connections
        WHERE to_event_id = ? AND resolved = 1
     )
     SELECT e.id, e.summary, e.primary_category, e.significance,
            ${SUBJECT_DATE} AS subject_date,
            e.source_id, s.title AS source_title, s.source_label,
            s.source_type, s.source_channel, s.source_url, s.captured_at,
            (SELECT i.text FROM event_insights i
              WHERE i.event_id = e.id ORDER BY i.position LIMIT 1) AS insight
       FROM related_ids r
       JOIN events e ON e.id = r.id
       JOIN sources s ON s.source_id = e.source_id
      WHERE ${RESEARCH_EVENT}
      ORDER BY e.significance DESC, subject_date DESC, e.id`,
    id,
    id,
  );

  const sourceRows = [
    source
      ? {
          source_id: source.source_id,
          headline: source.title,
          outlet: source.source_label || source.source_channel || source.source_type,
          kind: source.source_type || event.source_type || 'source',
          when: source.captured_at,
          url: source.source_url || event.source_url || null,
          event_id: event.id,
        }
      : null,
    ...related.map((row) => ({
      source_id: row.source_id,
      headline: row.source_title,
      outlet: row.source_label || row.source_channel || row.source_type,
      kind: row.source_type || 'source',
      when: row.captured_at,
      url: row.source_url || null,
      event_id: row.id,
    })),
  ].filter(Boolean) as any[];

  const seenSources = new Set<string>();
  const sources = sourceRows.filter((row) => {
    if (!row.source_id || seenSources.has(row.source_id)) return false;
    seenSources.add(row.source_id);
    return true;
  });

  const reactions = related
    .filter((row) => row.summary || row.insight)
    .map((row) => ({
      event_id: row.id,
      source_id: row.source_id,
      who: row.source_label || row.source_channel || row.source_title || 'Stored source',
      stance: row.primary_category,
      line: dossierParagraph(row.insight || row.summary, 340),
    }))
    .filter((row, index, rows) =>
      rows.findIndex((candidate) =>
        candidate.source_id === row.source_id && candidate.line === row.line,
      ) === index,
    )
    .slice(0, 6);

  const soWhat = editorial?.why_it_matters || event.underlying_principle || event.business_signal || event.mark_notes
    || insights.find(item => !repeats(item.text, event.summary))?.text || null;
  const normalizedSoWhat = String(soWhat ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const significance = editorial ? [editorial.explanation] : [
    event.summary,
    event.detailed_notes || event.mark_notes,
    event.underlying_principle || event.business_signal || event.detailed_content,
  ].filter((value, index, rows) => {
    const text = String(value ?? '').trim();
    if (!text) return false;
    const normalized = text.toLowerCase().replace(/\s+/g, ' ');
    if (normalizedSoWhat && normalized === normalizedSoWhat) return false;
    const key = normalized.slice(0, 180);
    return rows.findIndex((candidate) =>
      String(candidate ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 180) === key,
    ) === index;
  }).map((value) => dossierParagraph(value));

  const forwardLooking = /\b(watch|next|will|could|may|remains|depends|pending|expected|risk|determine|follow)\b/i;
  const watch = editorial ? editorial.watch.map(item => item.text) : insights
    .map((item) => item.text)
    .filter((text) => text && text !== soWhat && forwardLooking.test(text))
    .filter((text, index, rows) => rows.indexOf(text) === index)
    .slice(0, 3);

  return {
    event: {
      id: event.id,
      title: editorial?.headline || event.summary,
      category: event.primary_category,
      date: event.subject_date,
      reference_count: event.reference_count,
      significance: event.significance,
    },
    significance,
    so_what: soWhat,
    reactions: reactions.filter(row => row.event_id !== id && ![event.summary, ...significance, soWhat].some(text => repeats(row.line, text))),
    sources,
    watch,
    analysis_labeled: Boolean(editorial),
    evidence_quote: editorial?.evidence_excerpt || one<{ quote: string }>('SELECT quote FROM event_evidence WHERE event_id=?', id)?.quote || null,
    verified_at: source?.captured_at || event.ingested_at || event.timestamp || event.subject_date,
  };
}

export function graph(opts: { focus?: string; minShared?: number; entityTypes?: string[]; limit?: number } = {}) {
  const minShared = opts.minShared ?? 2;
  const types = opts.entityTypes?.length ? opts.entityTypes : ['protocols', 'people', 'tokens', 'chains'];

  const events = all(
    `SELECT e.id, e.summary, e.primary_category, e.significance, ${SUBJECT_DATE} AS subject_date
       FROM events e ORDER BY subject_date`,
  );

  const entities = all(
    `SELECT entity_type, value, count(*) AS events
       FROM event_entities WHERE entity_type IN (${types.map(() => '?').join(',')})
      GROUP BY entity_type, value HAVING events >= 2
      ORDER BY events DESC, value LIMIT ?`,
    ...types,
    opts.limit ?? 120,
  );

  const membership = entities.length
    ? all(
        `SELECT x.event_id, x.entity_type, x.value
           FROM event_entities x
          WHERE x.entity_type IN (${types.map(() => '?').join(',')})
            AND x.value IN (${entities.map(() => '?').join(',')})`,
        ...types,
        ...entities.map((e) => e.value),
      )
    : [];

  const explicit = all(
    'SELECT from_event_id, to_event_id FROM event_connections WHERE resolved = 1',
  );

  const shared = all(
    `SELECT a.event_id AS a, b.event_id AS b, count(*) AS weight
       FROM event_entities a
       JOIN event_entities b ON b.value = a.value AND b.entity_type = a.entity_type AND b.event_id > a.event_id
      GROUP BY a.event_id, b.event_id HAVING weight >= ?`,
    minShared,
  );

  return { events, entities, membership, explicit, shared, minShared };
}

export function listThemes() {
  return all('SELECT id, title, through_line, generated_at FROM themes');
}

export function getTheme(id: string) {
  const theme = one('SELECT * FROM themes WHERE id = ?', id);
  if (!theme) return null;
  const events = all(
    `SELECT te.position, e.id, e.summary, e.primary_category, e.significance,
            ${SUBJECT_DATE} AS subject_date
       FROM theme_events te JOIN events e ON e.id = te.event_id
      WHERE te.theme_id = ? ORDER BY te.position`,
    id,
  );
  const unplaced = all(
    `SELECT e.id, e.summary, e.primary_category, e.significance, ${SUBJECT_DATE} AS subject_date
       FROM events e WHERE e.id NOT IN (SELECT event_id FROM theme_events WHERE theme_id = ?)
      ORDER BY subject_date DESC`,
    id,
  );
  return { ...theme, events, unplaced };
}

/**
 * One index, one bm25 corpus, one total ordering.
 * bm25 ASC, significance DESC, subject_date DESC, canonical_id ASC.
 */
export function search(q: string, limit = 40) {
  if (!q.trim()) return { query: q, results: [] };
  const results = all(
    `SELECT si.canonical_id, si.kind, si.field, si.origin, si.title,
            snippet(search_index, 5, '<<', '>>', ' ... ', 18) AS snippet,
            bm25(search_index) AS score,
            COALESCE(e.significance, 0) AS significance,
            COALESCE((SELECT MIN(d.sort_key) FROM event_dates d WHERE d.event_id = si.canonical_id), '') AS subject_date
       FROM search_index si LEFT JOIN events e ON e.id = si.canonical_id
      WHERE search_index MATCH ? AND ${RESEARCH_EVENT}
      ORDER BY score ASC, significance DESC, subject_date DESC, si.canonical_id ASC
      LIMIT ?`,
    ftsQuery(q),
    limit,
  );
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const key = `${r.kind}:${r.canonical_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { query: q, results: deduped };
}

export function brief() {
  const counts = one<any>(
    `SELECT (SELECT count(*) FROM events e WHERE ${RESEARCH_EVENT}) events,
            (SELECT count(*) FROM sources) sources,
            (SELECT count(*) FROM event_facets) facets,
            (SELECT count(*) FROM media_assets) media,
            (SELECT count(*) FROM content_drafts) drafts,
            (SELECT count(*) FROM quiz_sessions) quiz_sessions,
            (SELECT count(*) FROM conversation_sessions) conversations,
            (SELECT count(*) FROM events e WHERE origin='ingested' AND ${RESEARCH_EVENT}) ingested_events,
            (SELECT count(*) FROM event_editorial WHERE kind!='research') archived_source_records`,
  )!;

  const telegramSync = one<any>(
    `SELECT count(*) AS received,
            coalesce(sum(CASE WHEN status='ready' THEN 1 ELSE 0 END), 0) AS ready,
            coalesce(sum(CASE WHEN status IN ('queued','processing') THEN 1 ELSE 0 END), 0) AS processing,
            coalesce(sum(CASE WHEN status='failed' THEN 1 ELSE 0 END), 0) AS failed,
            max(updated_at) AS updated_at
       FROM source_sync_jobs`,
  )!;
  telegramSync.synced = one<{ c: number }>(
    "SELECT count(*) c FROM sources WHERE origin='ingested' AND source_channel='telegram'",
  )!.c;

  const theme = one('SELECT id, title, through_line FROM themes LIMIT 1');
  const themeCoverage = one<{ c: number }>('SELECT count(DISTINCT event_id) c FROM theme_events')!.c;

  const gaps = {
    withoutNotes: one<{ c: number }>(
      'SELECT count(*) c FROM events e WHERE NOT EXISTS (SELECT 1 FROM note_revisions n WHERE n.event_id = e.id)',
    )!.c,
    outsideTheme: counts.events - themeCoverage,
    neverQuizzed: one<{ c: number }>(
      'SELECT count(*) c FROM events e WHERE e.id NOT IN (SELECT event_id FROM quiz_event_links)',
    )!.c,
    unresolvedConnections: one<{ c: number }>(
      'SELECT count(*) c FROM event_connections WHERE resolved = 0',
    )!.c,
  };

  const highSignal = all(
    `SELECT e.id, e.summary, e.primary_category, e.significance, ${SUBJECT_DATE} AS subject_date,
            s.title AS source_title,
            (SELECT text FROM note_revisions n WHERE n.event_id = e.id ORDER BY n.revision DESC LIMIT 1) AS note
       FROM events e JOIN sources s ON s.source_id = e.source_id
      WHERE e.significance >= 4 AND ${RESEARCH_EVENT} ORDER BY e.significance DESC, subject_date DESC LIMIT 8`,
  );

  const categories = all(
    `SELECT primary_category AS category, count(*) AS count FROM events e WHERE ${RESEARCH_EVENT} GROUP BY 1 ORDER BY 2 DESC`,
  );

  const captureByMonth = all(
    `SELECT substr(timestamp,1,7) AS month, count(*) AS count FROM events
      WHERE timestamp IS NOT NULL GROUP BY 1 ORDER BY 1`,
  );

  const subjectByYear = all(
    `SELECT substr(sort_key,1,4) AS year, count(*) AS count FROM event_dates GROUP BY 1 ORDER BY 1`,
  );

  const recentDrafts = all(
    'SELECT id, template_type, focus, updated_at FROM content_drafts ORDER BY updated_at DESC LIMIT 4',
  );

  const lastRead = all(
    `SELECT r.canonical_id, r.last_read_at, e.summary
       FROM read_state r JOIN events e ON e.id = r.canonical_id
      ORDER BY r.last_read_at DESC LIMIT 3`,
  );

  const range = one<{ min: string; max: string }>(
    'SELECT min(sort_key) AS min, max(span_end) AS max FROM event_dates',
  )!;

  const recentSources = all(
    `SELECT s.*, count(e.id) AS event_count,
            (SELECT count(*) FROM event_insights i JOIN events ie ON ie.id=i.event_id WHERE ie.source_id=s.source_id AND NOT EXISTS(SELECT 1 FROM event_editorial ed WHERE ed.event_id=ie.id AND ed.kind!='research')) AS insight_count
       FROM sources s LEFT JOIN events e ON e.source_id=s.source_id AND ${RESEARCH_EVENT}
      GROUP BY s.source_id ORDER BY s.captured_at DESC LIMIT 8`,
  );
  const recentQuestions = listAskHistory('', 5);
  const topics = listTopics(8);

  return { counts, telegram_sync: telegramSync, theme, themeCoverage, gaps, highSignal, categories, captureByMonth, subjectByYear, recentDrafts, lastRead, range, recentSources, recentQuestions, topics };
}

type TopicGroup = { key: string; title: string; description?: string; event_ids: string[]; tags: string[]; unfiled?: boolean };

export function listTopics(limit?: number, selected?: string): any {
  const records = all<any>(`SELECT e.id,e.source_id,e.primary_category,e.significance,
    ${SUBJECT_DATE} AS subject_date,
    (SELECT count(*) FROM event_insights i WHERE i.event_id=e.id) AS claim_count
    FROM events e WHERE ${RESEARCH_EVENT}`);
  const byId = new Map(records.map((row) => [row.id, row]));
  const organized = activeTopicOrganization();
  const groups: TopicGroup[] = (organized?.topics ?? []).map((topic) => ({ ...topic,
    event_ids: topic.event_ids.filter((id) => byId.has(id)),
  })).filter((topic) => topic.event_ids.length);
  const assigned = new Set(groups.flatMap((topic) => topic.event_ids));
  const learned = new Map<string, TopicGroup>();
  for (const row of all<any>('SELECT topic_key,title,event_id FROM event_topics ORDER BY title')) {
    if (!byId.has(row.event_id) || assigned.has(row.event_id)) continue;
    const group: TopicGroup = learned.get(row.topic_key) ?? { key: row.topic_key, title: row.title, event_ids: [], tags: [] };
    group.event_ids.push(row.event_id);
    learned.set(row.topic_key, group);
  }
  for (const group of learned.values()) {
    groups.push(group);
    group.event_ids.forEach((id) => assigned.add(id));
  }
  if (!organized) {
    const tagGroups = new Map<string, TopicGroup>();
    for (const row of all<any>('SELECT tag,event_id FROM event_tags ORDER BY tag')) {
      if (!byId.has(row.event_id)) continue;
      const group: TopicGroup = tagGroups.get(row.tag) ?? { key: row.tag, title: row.tag, event_ids: [], tags: [] };
      group.event_ids.push(row.event_id);
      tagGroups.set(row.tag, group);
    }
    for (const group of tagGroups.values()) if (group.event_ids.length >= 2) {
      groups.push(group);
      group.event_ids.forEach((id) => assigned.add(id));
    }
  }
  const unfiled = records.filter((row) => !assigned.has(row.id)).map((row) => row.id);
  if (unfiled.length) groups.push({ key: '__unfiled__', title: 'Additional retained evidence',
    description: 'Source-backed claims that have not been grouped into a named topic yet.',
    event_ids: unfiled, tags: [], unfiled: true });
  const topics = groups.map((group) => {
    const members = group.event_ids.map((id) => byId.get(id)).filter(Boolean);
    const categories = [...new Set<string>(members.map((row) => row.primary_category).filter(Boolean))];
    return { tag: group.key, title: group.title, description: group.description, unfiled: group.unfiled ?? false,
      event_count: members.length, claim_count: members.reduce((n, row) => n + Number(row.claim_count), 0),
      source_count: new Set(members.map((row) => row.source_id)).size,
      category_count: categories.length, position_count: categories.length,
      latest_subject_date: members.map((row) => row.subject_date).filter(Boolean).sort().at(-1) ?? null,
      max_significance: Math.max(...members.map((row) => Number(row.significance) || 0), 0),
      tags: group.tags.length ? group.tags : categories,
    };
  });
  if (!selected) return limit == null ? topics : topics.slice(0, Math.max(1, limit));
  let chosen = groups.find((group) => group.key === selected);
  if (!chosen) {
    const tagged = all<{ event_id: string }>('SELECT event_id FROM event_tags WHERE tag=?', selected);
    chosen = { key: selected, title: selected, event_ids: tagged.map((row) => row.event_id).filter(id => byId.has(id)), tags: [] };
  }
  if (!chosen.event_ids.length) return { topics, selected, topic_title: chosen.title, events: [], claims: [], sources: [], related_tags: [] };
  const placeholders = chosen.event_ids.map(() => '?').join(',');
  const events = all<any>(`SELECT e.*,${SUBJECT_DATE} AS subject_date,
    s.title AS source_title,s.source_label,s.source_url
    FROM events e JOIN sources s ON s.source_id=e.source_id WHERE e.id IN (${placeholders})
    ORDER BY subject_date DESC,e.significance DESC,e.id`, ...chosen.event_ids).map(withTags);
  const claims = all<any>(`SELECT i.event_id,i.position,i.text,e.primary_category,e.significance,
    ${SUBJECT_DATE} AS subject_date,e.source_id,s.title AS source_title,s.source_label,s.source_channel,s.source_type,s.source_url,
    (SELECT quote FROM event_evidence proof WHERE proof.event_id=e.id) AS evidence_quote
    FROM events e JOIN event_insights i ON i.event_id=e.id JOIN sources s ON s.source_id=e.source_id
    WHERE e.id IN (${placeholders}) ORDER BY e.significance DESC,subject_date DESC,i.position`, ...chosen.event_ids);
  const sources = all(`SELECT DISTINCT s.* FROM sources s JOIN events e ON e.source_id=s.source_id
    WHERE e.id IN (${placeholders}) ORDER BY s.captured_at DESC`, ...chosen.event_ids);
  const relatedTags = all(`SELECT tag,count(DISTINCT event_id) AS event_count FROM event_tags
    WHERE event_id IN (${placeholders}) GROUP BY tag ORDER BY event_count DESC,tag LIMIT 8`, ...chosen.event_ids);
  return { topics, selected, topic_title: chosen.title, topic_description: chosen.description,
    events, sources, claims, related_tags: relatedTags };
}

export function listAskHistory(query = '', limit = 40) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const rows = query.trim()
    ? all<any>(
        `SELECT * FROM ask_history WHERE lower(question) LIKE lower(?) OR lower(answer) LIKE lower(?)
          ORDER BY asked_at DESC LIMIT ?`,
        `%${query.trim()}%`, `%${query.trim()}%`, safeLimit,
      )
    : all<any>('SELECT * FROM ask_history ORDER BY asked_at DESC LIMIT ?', safeLimit);
  return rows.map((row) => ({
    ...row,
    source_ids: JSON.parse(row.source_ids_json || '[]'),
    evidence: JSON.parse(row.evidence_json || '[]'),
  }));
}

export function listDrafts() {
  return all(
    `SELECT d.*,
            COALESCE((SELECT value FROM generation_meta g WHERE g.key = 'draft_lens:' || d.id), 'mark') AS writing_lens,
            (SELECT count(*) FROM draft_revisions r WHERE r.draft_id = d.id) AS revisions
       FROM content_drafts d ORDER BY d.updated_at DESC`,
  );
}

export function getDraft(id: string) {
  const draft = one(
    `SELECT d.*,
            COALESCE((SELECT value FROM generation_meta g WHERE g.key = 'draft_lens:' || d.id), 'mark') AS writing_lens
       FROM content_drafts d WHERE d.id = ?`,
    id,
  );
  if (!draft) return null;
  const revisions = all(
    'SELECT revision, body, author, created_at FROM draft_revisions WHERE draft_id = ? ORDER BY revision DESC',
    id,
  );
  return { ...draft, revisions };
}

export function listQuizSessions() {
  return all(
    `SELECT s.*, (SELECT count(*) FROM quiz_questions q WHERE q.session_id = s.id) AS questions,
            (SELECT count(*) FROM quiz_answers a WHERE a.session_id = s.id) AS answers
       FROM quiz_sessions s ORDER BY s.created_at DESC`,
  );
}

export function getQuizSession(id: string) {
  const session = one('SELECT * FROM quiz_sessions WHERE id = ?', id);
  if (!session) return null;
  const questions = all(
    'SELECT * FROM quiz_questions WHERE session_id = ? ORDER BY question_number',
    id,
  ).map((q) => ({
    ...q,
    answer: one('SELECT * FROM quiz_answers WHERE question_id = ?', q.id) ?? null,
    events: all(
      `SELECT l.event_id, e.summary, e.primary_category FROM quiz_event_links l
         LEFT JOIN events e ON e.id = l.event_id
        WHERE l.owner_type='question' AND l.owner_id = ? ORDER BY l.position`,
      q.id,
    ),
  }));
  return { ...session, questions };
}

export function listConversations() {
  return all(
    `SELECT c.*, (SELECT count(*) FROM conversation_messages m WHERE m.session_id = c.id) AS messages,
            (SELECT substr(m.content,1,160) FROM conversation_messages m
              WHERE m.session_id = c.id AND m.role='user' ORDER BY m.sequence LIMIT 1) AS opening
       FROM conversation_sessions c ORDER BY COALESCE(c.first_timestamp,'') DESC, c.id`,
  );
}

export function getConversation(id: string) {
  const session = one('SELECT * FROM conversation_sessions WHERE id = ?', id);
  if (!session) return null;
  const messages = all(
    'SELECT sequence, timestamp, role, content FROM conversation_messages WHERE session_id = ? ORDER BY sequence',
    id,
  );
  return { ...session, messages };
}

export function listMedia() {
  return all(
    `SELECT m.*, (SELECT e.id FROM events e WHERE m.relative_path LIKE '%' || e.id || '%' LIMIT 1) AS event_id
       FROM media_assets m ORDER BY m.kind, m.bytes DESC`,
  );
}

export function facetOptions() {
  return {
    categories: all('SELECT primary_category AS value, count(*) AS count FROM events GROUP BY 1 ORDER BY 2 DESC'),
    sourceTypes: all('SELECT source_type AS value, count(*) AS count FROM events GROUP BY 1 ORDER BY 2 DESC'),
    tags: all('SELECT tag AS value, count(*) AS count FROM event_tags GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 60'),
    entities: all(
      `SELECT value, entity_type, count(*) AS count FROM event_entities
        GROUP BY value, entity_type HAVING count >= 2 ORDER BY count DESC, value LIMIT 80`,
    ),
    significance: all('SELECT significance AS value, count(*) AS count FROM events GROUP BY 1 ORDER BY 1'),
  };
}

export function reconciliation() {
  const counts = {
    sources: one<{ c: number }>('SELECT count(*) c FROM sources')!.c,
    events: one<{ c: number }>('SELECT count(*) c FROM events')!.c,
    event_facets: one<{ c: number }>('SELECT count(*) c FROM event_facets')!.c,
    themes: one<{ c: number }>('SELECT count(*) c FROM themes')!.c,
    theme_events: one<{ c: number }>('SELECT count(*) c FROM theme_events')!.c,
    content_drafts: one<{ c: number }>('SELECT count(*) c FROM content_drafts')!.c,
    quiz_sessions: one<{ c: number }>('SELECT count(*) c FROM quiz_sessions')!.c,
    quiz_questions: one<{ c: number }>('SELECT count(*) c FROM quiz_questions')!.c,
    quiz_answers: one<{ c: number }>('SELECT count(*) c FROM quiz_answers')!.c,
    quiz_event_links: one<{ c: number }>('SELECT count(*) c FROM quiz_event_links')!.c,
    pin_summaries: one<{ c: number }>('SELECT count(*) c FROM pin_summaries')!.c,
    conversation_sessions: one<{ c: number }>('SELECT count(*) c FROM conversation_sessions')!.c,
    conversation_messages: one<{ c: number }>('SELECT count(*) c FROM conversation_messages')!.c,
    media_assets: one<{ c: number }>('SELECT count(*) c FROM media_assets')!.c,
  };
  const byOrigin = {
    events: all('SELECT origin, count(*) c FROM events GROUP BY 1'),
    sources: all('SELECT origin, count(*) c FROM sources GROUP BY 1'),
  };
  return {
    counts,
    byOrigin,
    orphanEvents: one<{ c: number }>(
      'SELECT count(*) c FROM events e LEFT JOIN sources s ON s.source_id=e.source_id WHERE s.source_id IS NULL',
    )!.c,
    unresolvedConnections: one<{ c: number }>('SELECT count(*) c FROM event_connections WHERE resolved=0')!.c,
    identityRegister: one<{ c: number }>('SELECT count(*) c FROM identity_register')!.c,
    searchRows: one<{ c: number }>('SELECT count(*) c FROM search_index')!.c,
    migrations: all('SELECT id, name, applied_at FROM schema_migrations ORDER BY id'),
    handoff: all('SELECT key, value FROM handoff_metadata'),
    receipts: all('SELECT created_at, status, detail_json FROM ingestion_receipts ORDER BY id DESC LIMIT 5'),
    foreignKeyErrors: (db.pragma('foreign_key_check') as unknown[]).length,
  };
}
