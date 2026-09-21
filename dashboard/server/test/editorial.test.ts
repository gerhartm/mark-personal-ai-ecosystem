import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { repeats, validateEditorial } from '../src/editorial.js';
const folder = mkdtempSync(join(tmpdir(), 'crypto-editorial-'));
let database: typeof import('../src/db.js');
let tools: typeof import('../src/tools.js');
let store: typeof import('../src/editorial-store.js');
let processor: typeof import('../src/source-processor.js');
const sourceId = `sha256:${'e'.repeat(64)}`;
const quote = 'In October 2014, the pension fund expanded its allocation to foreign stocks and bonds. Hayes argues that the change created structural selling pressure on the yen. He says the effect could reverse if investors repatriate their overseas holdings.';
const editorial = { kind: 'research' as const, headline: 'Foreign asset allocations add structural pressure on the yen',
  explanation: 'Hayes links the pension fund’s October 2014 allocation change to purchases of foreign stocks and bonds. In his account, directing Japanese savings overseas creates a continuing need to exchange yen for foreign currency.',
  why_it_matters: 'The portfolio mandate offers a structural explanation for currency flows, beyond short-term changes in investor sentiment. This is Hayes’s causal argument, not proof of every subsequent exchange-rate move.',
  watch: [{ text: 'Hayes identifies repatriation of overseas holdings as a possible reversal of the currency flow.', quote: 'He says the effect could reverse if investors repatriate their overseas holdings.' }],
};
beforeAll(async () => {
  copyFileSync(resolve('../data/crypto-intelligence.db'), join(folder, 'test.db'));
  process.env.CRYPTO_DB = join(folder, 'test.db');
  database = await import('../src/db.js'); tools = await import('../src/tools.js');
  store = await import('../src/editorial-store.js'); processor = await import('../src/source-processor.js');
  database.run("INSERT INTO sources(source_id,identity_basis,title,source_type,source_channel,captured_at,origin) VALUES (?,?,'Retained macro article','article','test','2026-08-11','ingested')", sourceId, sourceId);
});
afterAll(() => { database?.db.close(); rmSync(folder, { recursive: true, force: true }); });

describe('research editorial quality', () => {
  it('requires distinct headline, explanation and significance', () => {
    expect(validateEditorial(editorial, quote)).toMatchObject(editorial);
    expect(validateEditorial(editorial, quote).evidence_excerpt).toBe(quote);
    expect(validateEditorial({ ...editorial, headline: 'Foreign `asset` allocations add structural pressure on the yen' }, quote).headline).toBe(editorial.headline);
    expect(() => validateEditorial({ ...editorial, why_it_matters: editorial.explanation }, quote)).toThrow('editorial_repetition');
    expect(() => validateEditorial({ ...editorial, headline: 'The source' }, quote)).toThrow('editorial_headline');
    expect(repeats('A useful source-backed argument with a complete explanation.', 'A useful source-backed argument with a complete explanation.')).toBe(true);
  });
  it('rejects provenance as a new research narrative', () => {
    expect(() => validateEditorial({ ...editorial, explanation: 'The recovered primary source identifies the article and its displayed publication date as August 11, 2026.' }, quote)).toThrow('editorial_prose');
    expect(() => validateEditorial({ kind: 'source_metadata' }, quote)).toThrow('editorial_kind');
    expect(validateEditorial({ kind: 'source_metadata', reason: 'Article metadata' }, quote, true).kind).toBe('source_metadata');
  });
  it('omits unsupported or repeated optional watch items', () => {
    expect(validateEditorial({ ...editorial, watch: [{ text: 'Watch for an unsupported market crash in the next quarter.', quote: 'This invented evidence does not occur in the source.' }] }, quote).watch).toEqual([]);
    expect(validateEditorial({ ...editorial, watch: [{ text: editorial.why_it_matters, quote: editorial.watch[0].quote }] }, quote).watch).toEqual([]);
    expect(validateEditorial(editorial, quote).watch).toHaveLength(1);
  });
  it('stores future extraction as readable prose with separate inspectable evidence', () => {
    processor.commitSourceClaims(sourceId, [{ claim: 'Hayes argues that the pension fund mandate caused structural yen selling.', quote, category: 'capital_flows', significance: 4,
      topic: 'Foreign asset mandates create structural currency flows', tags: ['yen'], entities: ['Hayes'], dates: [{ value: '2014-10', precision: 'month', quote }], editorial }]);
    const event = database.one<any>('SELECT * FROM events WHERE source_id=?', sourceId)!;
    const dossier = tools.timelineDossier(event.id);
    expect(dossier.significance).toEqual([editorial.explanation]);
    expect(dossier.so_what).toBe(editorial.why_it_matters);
    expect(dossier.analysis_labeled).toBe(true);
    expect(dossier.reactions).toEqual([]);
    expect(dossier.evidence_quote).toBe(quote);
    expect(event.detailed_content).not.toContain('Source evidence:');
    expect(tools.timeline().pins.find((pin: any) => pin.event_id === event.id)?.label).toBe(editorial.headline);
    expect(tools.getEvent(event.id)?.presentation.what_happened).toBe(editorial.explanation);
  });
  it('keeps archived metadata resolvable while excluding it from research views', () => {
    const event = database.one<any>('SELECT id FROM events WHERE source_id=?', sourceId)!;
    store.saveEditorial(event.id, { kind: 'source_metadata', headline: '', explanation: '', why_it_matters: '', watch: [], reason: 'Source information only.' });
    expect(tools.timeline().pins.some((pin: any) => pin.event_id === event.id)).toBe(false);
    expect(tools.timeline().undated.some((item: any) => item.event_id === event.id)).toBe(false);
    expect(tools.timelineDossier(event.id)).toBeNull();
    expect(tools.getSource(sourceId)?.events).toEqual([]);
    expect(tools.findEvents({}).events.some((item: any) => item.id === event.id)).toBe(false);
    expect(tools.listTopics().every((topic: any) => topic.event_count > 0)).toBe(true);
    expect(tools.getEvent(event.id)?.editorial?.kind).toBe('source_metadata');
  });
  it('preserves the older corpus and uses its existing explanatory fields', () => {
    const row = database.one<any>("SELECT * FROM events WHERE origin='migrated' AND length(underlying_principle)>80 LIMIT 1")!;
    const snapshot = JSON.stringify(row);
    const dossier = tools.timelineDossier(row.id);
    expect(dossier.significance.length).toBeGreaterThan(0);
    expect(dossier.so_what).toBe(row.underlying_principle);
    expect(dossier.reactions.every((reaction: any) => reaction.event_id !== row.id)).toBe(true);
    expect(JSON.stringify(database.one('SELECT * FROM events WHERE id=?', row.id))).toBe(snapshot);
  });
});
