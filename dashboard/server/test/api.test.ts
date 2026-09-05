import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = 'verification revision at ';

/**
 * Exercises the running server over HTTP, the same surface the browser uses.
 * Start it first:  npm start
 */
const BASE = process.env.TEST_BASE ?? 'http://127.0.0.1:5183';
const get = async (p: string) => fetch(`${BASE}${p}`);
const json = async (p: string): Promise<any> => (await get(p)).json();

beforeAll(async () => {
  const res = await get('/api/health').catch(() => null);
  if (!res?.ok) throw new Error(`server not reachable at ${BASE}. Run "npm start" first.`);
});

// The append-only note test writes real revisions. Remove only those, so the
// delivered database carries no test residue.
afterAll(() => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const path = resolve(process.env.CRYPTO_DB ?? join(HERE, '..', '..', 'data', 'crypto-intelligence.db'));
  const db = new Database(path);
  db.prepare('delete from note_revisions where text like ?').run(`${MARKER}%`);
  db.prepare("delete from search_index where body like ?").run(`${MARKER}%`);
  db.prepare("delete from audit_log where action = 'note.append' and created_at > datetime('now','-1 hour')").run();
  db.close();
});

describe('read routes', () => {
  it('serves the brief with real counts', async () => {
    const b = await json('/api/brief');
    expect(b.counts.events).toBe(66);
    expect(b.counts.sources).toBe(47);
    expect(b.theme.title).toBeTruthy();
    expect(b.gaps.unresolvedConnections).toBe(7);
    expect(b.range.min < b.range.max).toBe(true);
    expect(typeof b.telegram_sync.received).toBe('number');
    expect(typeof b.telegram_sync.synced).toBe('number');
    expect(typeof b.telegram_sync.processing).toBe('number');
    expect(typeof b.telegram_sync.failed).toBe('number');
    expect(typeof b.telegram_sync.configured).toBe('boolean');
  });

  it('filters events by the stored taxonomy, not by family', async () => {
    const all = await json('/api/events?limit=500');
    expect(all.total).toBe(66);
    const one = await json('/api/events?category=exploit_incident');
    expect(one.total).toBe(7);
    expect(one.events.every((e: any) => e.primary_category === 'exploit_incident')).toBe(true);
  });

  it('filters by significance, notes, and full text together', async () => {
    const sig = await json('/api/events?significanceMin=4');
    expect(sig.total).toBe(32);
    expect(sig.events.every((e: any) => e.significance >= 4)).toBe(true);

    const noNotes = await json('/api/events?hasNotes=false');
    expect(noNotes.total).toBe(13);
    expect(noNotes.events.every((e: any) => !e.note)).toBe(true);

    const q = await json('/api/events?q=aave');
    expect(q.total).toBeGreaterThan(0);
    expect(q.total).toBeLessThan(66);
  });

  it('returns a complete event with every relationship resolved', async () => {
    const list = await json('/api/events?limit=1&sort=significance');
    const e = await json(`/api/events/${list.events[0].id}`);
    expect(e.source.source_id).toBe(e.source_id);
    expect(Array.isArray(e.insights)).toBe(true);
    expect(Array.isArray(e.dates)).toBe(true);
    expect(e.notes.every((n: any) => typeof n.revision === 'number')).toBe(true);
    expect(e.connections.every((c: any) => c.resolved === 0 || c.resolved === 1)).toBe(true);
    expect(typeof e.entities).toBe('object');
    expect(e.presentation.what_happened).toBeTruthy();
    expect(Array.isArray(e.presentation.key_takeaways)).toBe(true);
  });

  it('surfaces unresolved connections as data rather than dropping them', async () => {
    const recon = await json('/api/reconciliation');
    expect(recon.unresolvedConnections).toBe(7);
    expect(recon.orphanEvents).toBe(0);
    expect(recon.foreignKeyErrors).toBe(0);
    expect(recon.migrations.length).toBe(8);
  });

  it('builds topics and source detail from the stored corpus', async () => {
    const topics = await json('/api/topics');
    expect(topics.topics.length).toBeGreaterThan(0);
    expect(topics.topics.every((topic: any) => topic.tag && topic.event_count > 0)).toBe(true);

    const detail = await json(`/api/topics?tag=${encodeURIComponent(topics.topics[0].tag)}`);
    expect(detail.selected).toBe(topics.topics[0].tag);
    expect(detail.events.length).toBeGreaterThan(0);
    expect(Array.isArray(detail.sources)).toBe(true);
    expect(Array.isArray(detail.claims)).toBe(true);

    const source = await json(`/api/sources/${encodeURIComponent(detail.sources[0].source_id)}`);
    expect(source.source_id).toBe(detail.sources[0].source_id);
    expect(Array.isArray(source.events)).toBe(true);
    expect(source.research_brief.overview).toBeTruthy();
    expect(source.research_brief.key_points.length).toBeGreaterThan(0);
    expect(source.research_brief.key_points.length).toBeLessThanOrEqual(6);
  });

  it('exposes page instructions without weakening the evidence contract', async () => {
    const response = await json('/api/prompt-controls');
    expect(response.controls.map((control: any) => control.id)).toEqual(['topics', 'timeline', 'prep', 'haseeb', 'tarun']);
    expect(response.controls.find((control: any) => control.id === 'timeline').mode).toBe('evidence');
    expect(response.controls.filter((control: any) => control.mode === 'generated').every((control: any) => control.instructions.length >= 80)).toBe(true);
  });

  it('returns preserved Ask history without generating placeholder answers', async () => {
    const history = await json('/api/ask/history');
    expect(Array.isArray(history.history)).toBe(true);
    expect(history.history.every((item: any) => item.question && item.answer)).toBe(true);
  });

  it('serves the timeline on both axes', async () => {
    const t = await json('/api/timeline');
    expect(t.pins.length).toBe(174);
    expect(t.captures.length).toBe(66);
    expect(t.bounds.min.startsWith('2000')).toBe(true);
    expect(t.pins.every((p: any) => p.span_end >= p.sort_key)).toBe(true);
    expect(t.pins.some((p: any) => p.key_takeaway)).toBe(true);
  });

  it('builds an evidence-only dossier for the expanded Timeline design', async () => {
    const timeline = await json('/api/timeline');
    const pin = timeline.pins.find((item: any) => item.reference_count > 1) ?? timeline.pins[0];
    const dossier = await json(`/api/timeline/${encodeURIComponent(pin.event_id)}/dossier`);
    expect(dossier.event.id).toBe(pin.event_id);
    expect(dossier.event.reference_count).toBeGreaterThan(0);
    expect(dossier.significance.length).toBeGreaterThan(0);
    expect(dossier.sources.length).toBeGreaterThan(0);
    expect(dossier.sources.every((source: any) => source.source_id && source.headline)).toBe(true);
    expect(dossier.reactions.every((reaction: any) => reaction.source_id && reaction.line)).toBe(true);
    expect(Array.isArray(dossier.watch)).toBe(true);
  });

  it('builds a graph whose every edge points at a node it returned', async () => {
    const g = await json('/api/graph?minShared=2');
    const ids = new Set(g.events.map((e: any) => e.id));
    expect(g.explicit.every((e: any) => ids.has(e.from_event_id) && ids.has(e.to_event_id))).toBe(true);
    expect(g.shared.every((s: any) => ids.has(s.a) && ids.has(s.b))).toBe(true);
    expect(g.shared.every((s: any) => s.weight >= 2)).toBe(true);
  });

  it('raises the threshold and returns strictly fewer links', async () => {
    const two = await json('/api/graph?minShared=2');
    const four = await json('/api/graph?minShared=4');
    expect(four.shared.length).toBeLessThan(two.shared.length);
  });

  it('returns preserved product history', async () => {
    expect((await json('/api/drafts')).drafts.length).toBe(41);
    expect((await json('/api/quiz/sessions')).sessions.length).toBe(15);
    expect((await json('/api/conversations')).sessions.length).toBe(13);
    expect((await json('/api/media')).assets.length).toBe(89);
  });

  it('searches one index with a stable order', async () => {
    const a = await json('/api/search?q=stablecoin');
    const b = await json('/api/search?q=stablecoin');
    expect(a.results.map((r: any) => r.canonical_id)).toEqual(b.results.map((r: any) => r.canonical_id));
    expect(a.results.length).toBeGreaterThan(0);
  });

  it('404s an unknown object without leaking anything', async () => {
    const res = await get('/api/events/does-not-exist');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});

describe('the intelligence plane boundary', () => {
  it('reports command-center readiness without inventing a live briefing', async () => {
    const status: any = await json('/api/intelligence');
    expect(status.connected).toBe(false);
    expect(status.refresh_hours).toBe(24);
    expect(status.stale).toBe(true);
    expect(status.last_attempt_at).toBeNull();
    expect(status.brief).toBeNull();
  });

  it('says plainly that Hermes is not connected, and never fabricates an answer', async () => {
    const res = await fetch(`${BASE}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'what happened with Aave utilisation' }),
    });
    const body: any = await res.json();
    expect(body.mode).toBe('degraded');
    expect(body.state).toBe('intelligence_plane_not_connected');
    expect(body.message).toMatch(/not an answer/i);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body).not.toHaveProperty('answer');
  });

  it('keeps Studio read-only when Hermes is not connected and saves no placeholder draft', async () => {
    const status: any = await json('/api/studio/status');
    expect(status.connected).toBe(false);
    expect(status.templates).toContain('speaking_prep');
    expect(status.writing_lenses).toEqual(['mark', 'creator_reference']);
    const before = (await json('/api/drafts')).drafts.length;
    const res = await fetch(`${BASE}/api/studio/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template_type: 'speaking_prep', focus: 'Aave protocol risk' }),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error).toBe('intelligence_plane_not_connected');
    expect((await json('/api/drafts')).drafts.length).toBe(before);
  });
});

describe('media authorisation', () => {
  it('streams an authorised asset with range support', async () => {
    const media = await json('/api/media');
    const asset = media.assets.find((a: any) => a.kind === 'json');
    const full = await get(`/api/media/${encodeURIComponent(asset.archive_ref)}`);
    if (full.status === 409) return; // archive not mounted in this environment
    expect(full.status).toBe(200);
    expect(full.headers.get('accept-ranges')).toBe('bytes');

    const ranged = await fetch(`${BASE}/api/media/${encodeURIComponent(asset.archive_ref)}`, {
      headers: { Range: 'bytes=0-99' },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toMatch(/^bytes 0-99\//);
    expect((await ranged.arrayBuffer()).byteLength).toBe(100);
  });

  it('refuses an unknown archive reference', async () => {
    const res = await get(`/api/media/${encodeURIComponent('legacy-export://root/crypto-intel/nope.json')}`);
    expect(res.status).toBe(404);
  });

  it('blocks traversal attempts and returns nothing', async () => {
    for (const probe of [
      '../../../../etc/passwd',
      'legacy-export://root/crypto-intel/../../../etc/passwd',
      '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    ]) {
      const res = await get(`/api/media/${encodeURIComponent(probe)}`);
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).not.toMatch(/root:/);
    }
  });

  it('never returns a filesystem path in any payload', async () => {
    for (const p of ['/api/brief', '/api/events?limit=5', '/api/media', '/api/reconciliation']) {
      const text = await (await get(p)).text();
      expect(text).not.toMatch(/\/Users\//);
      expect(text).not.toMatch(/\/srv\//);
      expect(text).not.toMatch(/\.secrets/);
    }
  });
});

describe('writes are append only and validated', () => {
  it('appends a note revision and never overwrites the migrated original', async () => {
    const list = await json('/api/events?hasNotes=true&limit=1');
    const id = list.events[0].id;
    const before = await json(`/api/events/${id}`);
    const original = before.notes.find((n: any) => n.revision === 0);

    const res = await fetch(`${BASE}/api/events/${id}/notes`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `${MARKER}${new Date().toISOString()}` }),
    });
    expect(res.ok).toBe(true);
    const saved: any = await res.json();

    const after = await json(`/api/events/${id}`);
    expect(after.notes.length).toBe(before.notes.length + 1);
    expect(after.notes[0].revision).toBe(saved.revision);
    const stillThere = after.notes.find((n: any) => n.revision === 0);
    expect(stillThere.text).toBe(original.text);
    expect(after.mark_notes).toBe(before.mark_notes);
  });

  it('rejects an empty note with a specific reason', async () => {
    const list = await json('/api/events?limit=1');
    const res = await fetch(`${BASE}/api/events/${list.events[0].id}/notes`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '   ' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe('invalid_note');
  });

  it('rejects a note on an event that does not exist', async () => {
    const res = await fetch(`${BASE}/api/events/no-such-event/notes`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(res.status).toBe(404);
  });
});
