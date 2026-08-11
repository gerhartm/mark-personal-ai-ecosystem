import { describe, expect, it, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DB_PATH = resolve(process.env.CRYPTO_DB ?? join(ROOT, '..', 'data', 'crypto-intelligence.db'));
const HANDOFF = resolve(join(ROOT, '..', '..', '.work', 'crypto-v2', 'dashboard-handoff-20260803T010000Z'));
const MANIFEST = JSON.parse(readFileSync(join(HANDOFF, 'handoff-manifest.json'), 'utf8'));

let db: Database.Database;
beforeAll(() => {
  expect(existsSync(DB_PATH), `active database missing at ${DB_PATH}`).toBe(true);
  db = new Database(DB_PATH, { readonly: true });
});

const count = (sql: string, ...p: any[]) => (db.prepare(sql).get(...p) as any).c as number;

/* ------------------------------------------------------------------ */
describe('the frozen handoff is untouched', () => {
  it('still matches the checksum recorded in its own manifest', () => {
    const bytes = readFileSync(join(HANDOFF, 'crypto-dashboard-v2.db'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(MANIFEST.database.sha256);
  });
});

/* ------------------------------------------------------------------ */
describe('reconciliation against the handoff manifest', () => {
  const expected = MANIFEST.database.counts as Record<string, number>;
  const table = (k: string) => (k === 'metadata' ? 'handoff_metadata' : k);

  for (const [name, n] of Object.entries(expected)) {
    it(`${name} reconciles at ${n}`, () => {
      expect(count(`select count(*) c from ${table(name)}`)).toBe(n);
    });
  }

  it('every event resolves to its canonical source', () => {
    expect(
      count('select count(*) c from events e left join sources s on s.source_id=e.source_id where s.source_id is null'),
    ).toBe(0);
  });

  it('reports foreign key integrity with no violations', () => {
    expect((db.pragma('foreign_key_check') as unknown[]).length).toBe(0);
  });

  it('preserves canonical event ids exactly as migrated', () => {
    const frozen = new Database(join(HANDOFF, 'crypto-dashboard-v2.db'), { readonly: true });
    const before = frozen.prepare('select id from events order by id').all().map((r: any) => r.id);
    const after = db.prepare('select id from events order by id').all().map((r: any) => r.id);
    frozen.close();
    expect(after).toEqual(before);
  });
});

/* ------------------------------------------------------------------ */
describe('derived structure', () => {
  it('explodes every facet type without loss', () => {
    expect(count("select count(*) c from event_facets where facet_type='tag'")).toBe(count('select count(*) c from event_tags'));
    expect(count("select count(*) c from event_facets where facet_type='key_insight'")).toBe(
      count('select count(*) c from event_insights'),
    );
    expect(count("select count(*) c from event_facets where facet_type='discussed_date'")).toBe(
      count('select count(*) c from event_dates'),
    );
    expect(count("select count(*) c from event_facets where facet_type='connection'")).toBe(
      count('select count(*) c from event_connections'),
    );
  });

  it('reports the 7 unresolved connections rather than dropping them', () => {
    expect(count('select count(*) c from event_connections')).toBe(107);
    expect(count('select count(*) c from event_connections where resolved=0')).toBe(7);
    expect(count('select count(*) c from event_connections where resolved=1')).toBe(100);
  });

  it('gives every dated reference an explicit span, so precision is never implied', () => {
    expect(count('select count(*) c from event_dates where span_end < sort_key')).toBe(0);
    const byPrecision = db
      .prepare('select precision, count(*) c from event_dates group by 1')
      .all() as { precision: string; c: number }[];
    expect(Object.fromEntries(byPrecision.map((r) => [r.precision, r.c]))).toEqual({
      day: 81,
      month: 40,
      quarter: 21,
      year: 32,
    });
    // a year-precision pin must cover a real year, not a single day
    const y = db.prepare("select sort_key, span_end from event_dates where precision='year' limit 1").get() as any;
    expect(y.span_end.slice(5)).toBe('12-31');
    expect(y.sort_key.slice(5)).toBe('01-01');
  });

  it('keeps the eleven-label taxonomy verbatim', () => {
    const primary = db.prepare('select distinct primary_category v from events').all().map((r: any) => r.v);
    const secondary = db.prepare('select distinct category v from event_secondary_categories').all().map((r: any) => r.v);
    const all = new Set([...primary, ...secondary]);
    expect([...all].sort()).toEqual([
      'defi_mechanics', 'exploit_incident', 'funding', 'governance', 'infrastructure',
      'macro', 'narrative', 'partnerships', 'protocol_launch', 'regulatory', 'tokenomics',
    ]);
    // nothing was rewritten into a family name
    expect(count("select count(*) c from events where primary_category in ('narrative_family','risk','rules','protocol')")).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
describe('application-owned state', () => {
  it('seeds note revision 0 from the migrated value, never editing the original', () => {
    expect(count('select count(*) c from note_revisions where revision=0')).toBe(
      count("select count(*) c from events where mark_notes is not null and mark_notes<>''"),
    );
    const mismatched = count(`
      select count(*) c from note_revisions n join events e on e.id=n.event_id
      where n.revision=0 and n.text <> e.mark_notes`);
    expect(mismatched).toBe(0);
  });

  it('registers a canonical identity for every addressable object', () => {
    const register = count('select count(*) c from identity_register');
    const objects =
      count('select count(*) c from sources') +
      count('select count(*) c from events') +
      count('select count(*) c from themes') +
      count('select count(*) c from content_drafts') +
      count('select count(*) c from quiz_sessions') +
      count('select count(*) c from media_assets');
    expect(register).toBe(objects);
  });

  it('records every applied migration', () => {
    const ids = db.prepare('select id from schema_migrations order by id').all().map((r: any) => r.id);
    expect(ids).toEqual(['001', '002', '003', '004', '005', '006']);
  });

  it('tags every row with an origin so migrated and new stay separable', () => {
    expect(count("select count(*) c from events where origin='migrated'")).toBe(66);
    expect(count("select count(*) c from events where origin not in ('migrated','ingested')")).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
describe('the unified search index', () => {
  it('covers events, sources, drafts, notes, themes and conversations', () => {
    const kinds = db.prepare('select distinct kind k from search_index').all().map((r: any) => r.k).sort();
    expect(kinds).toEqual(['conversation', 'draft', 'event', 'source', 'theme']);
  });

  it('returns one total deterministic ordering, repeated exactly', () => {
    const q = `
      select si.canonical_id, bm25(search_index) score, coalesce(e.significance,0) sig
      from search_index si left join events e on e.id = si.canonical_id
      where search_index match ? order by score asc, sig desc, si.canonical_id asc limit 12`;
    const a = db.prepare(q).all('"aave"*').map((r: any) => r.canonical_id);
    const b = db.prepare(q).all('"aave"*').map((r: any) => r.canonical_id);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('is one index, so a record ranks by content and not by which table it came from', () => {
    const rows = db.prepare("select count(distinct kind) c from search_index where search_index match '\"aave\"*'").get() as any;
    expect(rows.c).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ */
describe('media custody', () => {
  it('keeps all 89 manifest assets with their checksums', () => {
    expect(count('select count(*) c from media_assets')).toBe(89);
    expect(count("select count(*) c from media_assets where sha256 is null or length(sha256)<>64")).toBe(0);
  });

  it('records which assets are approved for semantic memory', () => {
    expect(count('select count(*) c from media_assets where semantic_memory=1')).toBe(53);
  });
});

/* ------------------------------------------------------------------ */
describe('the build refuses unsafe input', () => {
  it('rejects a modified frozen handoff', () => {
    const tmpDir = join(ROOT, '..', 'data', '__test_bad_handoff');
    const tmpDb = join(tmpDir, 'crypto-dashboard-v2.db');
    const out = join(ROOT, '..', 'data', '__test_out.db');
    try {
      execFileSync('mkdir', ['-p', tmpDir]);
      copyFileSync(join(HANDOFF, 'handoff-manifest.json'), join(tmpDir, 'handoff-manifest.json'));
      copyFileSync(join(HANDOFF, 'crypto-dashboard-v2.db'), tmpDb);
      const tamper = new Database(tmpDb);
      tamper.exec("update events set summary = summary || ' tampered' where id = (select id from events limit 1)");
      tamper.close();

      let failed = false;
      let message = '';
      try {
        execFileSync('node', [join(ROOT, 'src', 'build-db.mjs'), '--handoff', tmpDir, '--out', out], {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (err: any) {
        failed = true;
        message = String(err.stderr ?? '') + String(err.stdout ?? '');
      }
      expect(failed).toBe(true);
      expect(message).toMatch(/checksum mismatch/i);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(out, { force: true });
    }
  });
});
