import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const state = vi.hoisted(() => ({ calls: 0, fail: false, body: '', response: '{}' }));
vi.mock('../src/hermes-client.js', () => ({
  generateWithHermes: vi.fn(async () => { state.calls++; if (state.fail) throw new Error('quota exceeded'); return state.response; }),
  runHermesAgent: vi.fn(),
}));
vi.mock('../src/ingestion.js', () => ({ sourceContent: vi.fn(async () => state.body) }));
const folder = mkdtempSync(join(tmpdir(), 'crypto-processing-test-'));
let database: typeof import('../src/db.js');
let processor: typeof import('../src/source-processor.js');
let queue: typeof import('../src/source-queue.js');
let tools: typeof import('../src/tools.js');
const sourceId = `sha256:${'d'.repeat(64)}`;
const quote = 'On August 31, 2026, the protocol launched a lending vault with a fixed borrowing rate.';
const claim = { claim: 'The source reports a fixed-rate lending vault launch on August 31, 2026.', quote, topic: 'Fixed rate vaults separate borrowing costs from utilization', category: 'protocol_launch', significance: 4,
  editorial: { kind: 'research' as const, headline: 'Protocol launches a vault with fixed borrowing rates', explanation: 'The source reports that the protocol introduced a lending vault on August 31, 2026. Its stated feature is a fixed borrowing rate, so this record concerns the terms of borrowing rather than a change in collateral or access.', why_it_matters: 'Rate predictability is the relevant implication for borrowers planning their financing costs; this passage alone does not establish other vault terms.', watch: [] },
  tags: ['lending'], entities: ['protocol'], dates: [{ value: '2026-08-31', precision: 'day' as const, quote }] };
beforeAll(async () => {
  copyFileSync(resolve('../data/crypto-intelligence.db'), join(folder, 'test.db'));
  process.env.CRYPTO_DB = join(folder, 'test.db');
  database = await import('../src/db.js'); processor = await import('../src/source-processor.js');
  queue = await import('../src/source-queue.js'); tools = await import('../src/tools.js');
  database.run('DELETE FROM source_processing');
  database.run("INSERT INTO sources(source_id,identity_basis,title,source_type,source_channel,captured_at,origin) VALUES (?,?,'Processing fixture','article','test','2026-09-10T00:00:00Z','ingested')", sourceId, `text:${sourceId}`);
});
afterAll(() => { database?.db.close(); rmSync(folder, { recursive: true, force: true }); });
describe('source-to-dashboard pipeline', () => {
  it('covers long content completely with overlapping resumable chunks', () => {
    const body = 'Research evidence.\n'.repeat(3000);
    const chunks = processor.splitSource(body);
    expect(chunks.length).toBeGreaterThan(2);
    let covered = '';
    chunks.forEach((chunk, index) => covered += index ? chunk.slice(600) : chunk);
    expect(covered).toBe(body);
  });
  it('preserves Unicode at both chunk ends and overlap boundaries', () => {
    for (const offset of [13399, 13999]) {
      const body = 'a'.repeat(offset) + String.fromCodePoint(0x1F517) + 'b'.repeat(2200);
      const chunks = processor.splitSource(body);
      expect(chunks.every(chunk => Buffer.from(chunk).toString('utf8') === chunk)).toBe(true);
      expect(chunks.every(chunk => body.includes(chunk))).toBe(true);
      expect(chunks.some(chunk => chunk.includes(String.fromCodePoint(0x1F517)))).toBe(true);
    }
  });
  it('rejects invented quotes, ambiguous dates and impossible dates', () => {
    expect(processor.validateExtraction({ claims: [claim] }, quote)).toHaveLength(1);
    expect(() => processor.validateExtraction({ claims: [{ ...claim, quote: 'This passage does not exist in the source.' }] }, quote)).toThrow('unsupported_claim');
    expect(() => processor.validateExtraction({ claims: [{ ...claim, dates: [{ value: '2025-08-31', precision: 'day', quote }] }] }, quote)).toThrow('unsupported_date');
    expect(processor.dateSpan('2026-02-30', 'day')).toBeNull();
    expect(processor.supportedDate({ value: '2026-07', precision: 'month', quote: 'Launching in July' }, 'Launching in July')).toBe(false);
    expect(processor.dateSpan('2028-02', 'month')).toEqual(['2028-02-01','2028-02-29']);
  });
  it('attaches the retained passage by ID instead of trusting a rewritten quotation', () => {
    const blocks = processor.evidenceBlocks(quote);
    const resolved = processor.resolveEvidenceBlocks({ claims: [{ ...claim, quote: 'Invented quote', evidence_block: 0 }] }, blocks);
    expect(processor.validateExtraction(resolved, quote)[0].quote).toBe(quote);
    expect(() => processor.resolveEvidenceBlocks({ claims: [{ ...claim, evidence_block: 99 }] }, blocks)).toThrow();
  });
  it('keeps a failed provider call queued without publishing records', async () => {
    queue.queueSource(sourceId); state.body = quote; state.fail = true;
    expect(await processor.processNextSourceChunk()).toBe(false);
    expect(database.one<any>('SELECT count(*) n FROM events WHERE source_id=?', sourceId)?.n).toBe(0);
    expect(database.one<any>('SELECT status,last_error FROM source_processing WHERE source_id=?', sourceId)).toMatchObject({ status: 'queued', last_error: expect.stringContaining('limits') });
  });
  it('resumes and publishes source-backed events into Topics and Timeline exactly once', async () => {
    database.run("UPDATE source_processing SET not_before='2000-01-01' WHERE source_id=?", sourceId);
    state.fail = false; state.response = JSON.stringify({ claims: [claim] });
    expect(await processor.processNextSourceChunk()).toBe(true);
    const event = database.one<any>('SELECT id FROM events WHERE source_id=?', sourceId)!;
    expect(tools.timeline().pins.some((pin: any) => pin.event_id === event.id && pin.date === '2026-08-31')).toBe(true);
    const topics = tools.listTopics();
    const topic = topics.find((item: any) => item.title === claim.topic);
    expect(topic.claim_count).toBe(1);
    expect(tools.listTopics(undefined, topic.tag).claims[0].evidence_quote).toBe(quote);
    const calls = state.calls;
    queue.queueSource(sourceId); await processor.processNextSourceChunk();
    processor.commitSourceClaims(sourceId, [claim]);
    expect(state.calls).toBe(calls);
    expect(database.one<any>('SELECT count(*) n FROM events WHERE source_id=?', sourceId)?.n).toBe(1);
    expect(queue.processingSummary()).toMatchObject({ ready: 1, failed: 0, events: 1, dated: 1 });
  });
  it('keeps undated claims visible without substituting capture time', () => {
    processor.commitSourceClaims(sourceId, [{ ...claim, claim: 'The source explains liquidity incentives without specifying an event date.', editorial: undefined, quote: 'The source explains liquidity incentives without specifying an event date.', dates: [] }]);
    const undated = tools.timeline().undated.find((item: any) => item.source_id === sourceId);
    expect(undated).toBeTruthy();
    const detail = tools.getEvent(undated!.event_id) as any;
    expect(detail.subject_date).toBeNull();
  });
  it('does not present capture dates as event dates when rebuilding topic groups', async () => {
    const supplied: Array<{ id: string; subject_date: string }> = [];
    const client = await import('../src/hermes-client.js');
    vi.mocked(client.generateWithHermes).mockImplementation(async (prompt) => {
      const records = prompt.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
      supplied.push(...records);
      const count = Math.min(24, Math.max(Math.min(6, Math.floor(records.length / 2)), Math.ceil(records.length / 12)));
      const width = Math.max(2, Math.ceil(records.length / count));
      return JSON.stringify({ topics: Array.from({ length: count }, (_, index) => ({
        title: `Stored evidence group ${index + 1} connects related research claims`,
        description: 'These retained research records describe related mechanisms reported by their original sources.',
        event_ids: Array.from({ length: width }, (_, offset) => records[(index * width + offset) % records.length].id),
      })) });
    });
    const { rebuildTopics } = await import('../src/prompt-controls.js');
    await rebuildTopics('test');
    const undatedIds = database.all<{ id: string }>(`SELECT e.id FROM events e
      WHERE e.source_id=? AND NOT EXISTS(SELECT 1 FROM event_dates d WHERE d.event_id=e.id)`, sourceId).map(row => row.id);
    expect(undatedIds.length).toBeGreaterThan(0);
    for (const id of undatedIds) expect(supplied.find(row => row.id === id)?.subject_date).toBe('');
  });
});
