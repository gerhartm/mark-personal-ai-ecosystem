import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * A deterministic stand-in for Hermes. It reads the claim IDs from each prompt
 * and answers in the documented JSON shapes, so the real validation, storage
 * and migration code runs against a copy of the stored corpus.
 */
const state = vi.hoisted(() => ({ calls: [] as string[], topicNumber: 0, failNextGroupCalls: 0, outage: false, shift: false, garbageCategorize: false }));
vi.mock('../src/hermes-client.js', () => {
  const section = (input: string, name: string) => {
    const start = input.indexOf(`${name}\n`);
    if (start < 0) return [] as any[];
    return input.slice(start + name.length + 1).split('\n\n')[0].split('\n')
      .filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
  };
  const letters = (value: number) => { let out = ''; for (let n = value; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out; return out; };
  const pick = (text: string) => /raised \$/i.test(text) ? 'venture'
    : /stablecoin/i.test(text) ? 'stablecoins'
      : (state.shift ? ['tokens_governance', 'macro', 'payments'] : ['defi', 'markets_trading', 'chains_infrastructure'])[text.length % 3];
  const roundFor = (text: string) => {
    if (/^Acme Labs raised/.test(text)) return { company: 'Acme Labs', amount_text: '$25 million', stage: 'seed', investors: ['Example Capital', 'Imaginary Partners'], valuation_text: '$120 million' };
    if (/^Beta Protocol raised/.test(text)) return { company: 'Gamma Corp', amount_text: '$10 million', stage: 'seed', investors: [], valuation_text: null };
    return null;
  };
  return {
    runHermesAgent: vi.fn(),
    generateWithHermes: vi.fn(async (input: string, options: any) => {
      if (state.outage) throw new Error('429 insufficient_quota');
      const head = String(options?.instructions?.[0] ?? '');
      if (head.startsWith('Assign each research claim')) {
        state.calls.push('categorize');
        if (state.garbageCategorize) return 'Error: the provider could not complete this request.';
        return JSON.stringify({ claims: section(input, 'CLAIMS').map((claim: any) => ({ id: claim.id, category: pick(claim.text), round: roundFor(claim.text) })) });
      }
      if (head.startsWith("Organize Mark's stored research claims")) {
        state.calls.push('group');
        if (state.failNextGroupCalls > 0) { state.failNextGroupCalls--; return 'not json'; }
        const claims = section(input, 'CLAIMS');
        const existing = section(input, 'EXISTING TOPICS');
        const byCategory = new Map<string, string[]>();
        for (const claim of claims) byCategory.set(claim.category, [...(byCategory.get(claim.category) ?? []), claim.id]);
        const topics: any[] = [];
        const unsorted: string[] = [];
        for (const [category, ids] of byCategory) {
          const target = existing.find((topic: any) => topic.category === category);
          if (target && ids.length) topics.push({ key: target.key, claims: [ids.shift()] });
          while (ids.length >= 2) {
            const code = letters(++state.topicNumber);
            topics.push({
              key: `new-${code}`,
              title: `Synthetic topic ${code} shows Lendex lending shifting between venues`,
              dek: `Context line for synthetic topic ${code}, written for an automated test.`,
              description: 'A synthetic description that is long enough to be kept by the validator.',
              claims: ids.splice(0, 2),
            });
          }
          unsorted.push(...ids);
        }
        return JSON.stringify({ topics, unsorted });
      }
      return '{}';
    }),
  };
});

const folder = mkdtempSync(join(tmpdir(), 'crypto-topic-organization-'));
let database: typeof import('../src/db.js');
let organization: typeof import('../src/topic-organization.js');
let prompts: typeof import('../src/prompt-controls.js');
let processor: typeof import('../src/source-processor.js');
let tools: typeof import('../src/tools.js');
const ventureSource = `sha256:${'e'.repeat(64)}`;
const placementSource = `sha256:${'f'.repeat(64)}`;
const ventureQuote = 'Acme Labs raised $25 million in a seed round led by Example Capital with Imaginary Partners, at a $120 million valuation.';
const categoriesNow = () => new Map(database.all<any>('SELECT id, primary_category FROM events').map((row) => [row.id, row.primary_category]));

beforeAll(async () => {
  copyFileSync(resolve('../data/crypto-intelligence.db'), join(folder, 'test.db'));
  process.env.CRYPTO_DB = join(folder, 'test.db');
  database = await import('../src/db.js');
  organization = await import('../src/topic-organization.js');
  prompts = await import('../src/prompt-controls.js');
  processor = await import('../src/source-processor.js');
  tools = await import('../src/tools.js');
  database.run("DELETE FROM generation_meta WHERE key IN ('topics.organization.v2','topics.categories.previous','topics.categories.original','venture.rounds.v1')");
  database.run("INSERT INTO sources(source_id,identity_basis,title,source_type,source_channel,captured_at,origin) VALUES (?,?,'Venture fixture','article','test','2026-10-01T00:00:00Z','ingested')", ventureSource, `text:${ventureSource}`);
  processor.commitSourceClaims(ventureSource, [
    { claim: ventureQuote, quote: ventureQuote, topic: 'Acme Labs raises a seed round for testing', category: 'research', significance: 3, tags: ['venture'], entities: [], dates: [] },
    { claim: 'Beta Protocol raised $10 million from undisclosed investors, according to the fixture.', quote: 'Beta Protocol raised $10 million from undisclosed investors.', topic: 'Beta Protocol raises money in a fixture round', category: 'protocol_launch', significance: 3, tags: ['venture'], entities: [], dates: [] },
  ]);
});
afterAll(() => { database?.db.close(); rmSync(folder, { recursive: true, force: true }); });

describe('topic titles, context lines and funding rounds', () => {
  it('requires specific, complete titles and short context lines', () => {
    expect(organization.titleIssues('Lendex TVL fell 45% in a week as institutions sought walled-off pools').hard).toEqual([]);
    expect(organization.titleIssues('Lendex TVL fell 45% in a week as institutions sought walled-off pools').soft).toEqual([]);
    expect(organization.titleIssues('Institutional lending favors isolated risk and controlled exits').soft.join(' ')).toMatch(/specific name/);
    expect(organization.titleIssues('Collateral risk moves from lending protocols to').hard.join(' ')).toMatch(/incomplete/);
    expect(organization.titleIssues('Too short').hard.length).toBeGreaterThan(0);
    expect(organization.dekIssues('Short.').hard.length).toBeGreaterThan(0);
    expect(organization.dekIssues('Two fixture funds opened an isolated lending market. A second sentence follows.').soft.join(' ')).toMatch(/one sentence/);
  });
  it('only accepts numbers in headlines that appear in the claims, as digits or words', () => {
    expect(organization.ungroundedNumbers('Lendex TVL fell 45% to $14.4B', 'Lendex TVL: $26.4B to $14.4B (-45%) in one week')).toEqual([]);
    expect(organization.ungroundedNumbers('7 of the top 10 protocols bleed', 'seven of the ten largest fixture protocols')).toEqual([]);
    expect(organization.ungroundedNumbers('Fixture FX is 1,000x smaller', '$9B on-chain vs $9T off-chain, a 1000x gap')).toEqual([]);
    expect(organization.ungroundedNumbers('Fixture DEX lost $300M', 'Fixture DEX exploited for $285M')).toEqual(['300']);
    expect(organization.ungroundedNumbers('Funds hold 10% of supply, a16z finds in its Q4 review', '10% of fixture supply now in funds')).toEqual([]);
    expect(organization.ungroundedNumbers('Fixture DEX lost $285M in 2026', 'Fixture DEX exploited for $285M')).toEqual(['2026']);
    expect(organization.ungroundedNumbers('Fixture DEX lost $285B', 'Fixture DEX exploited for $285 million')).toEqual(['285']);
    expect(organization.ungroundedNumbers('Fixture DEX lost $285M', 'Fixture DEX exploited for $285 million')).toEqual([]);
    expect(organization.ungroundedNumbers('A $30mn raise at a 75bps spread', 'A raise at a tight spread')).toEqual(['30', '75']);
    expect(organization.ungroundedNumbers('Ten exchanges halted withdrawals', 'Three exchanges halted withdrawals')).toEqual(['ten']);
  });
  it('keeps only rounds whose names and amounts are written in the evidence', () => {
    expect(organization.parseUsd('$25 million')).toBe(25_000_000);
    expect(organization.parseUsd('$4.5M')).toBe(4_500_000);
    expect(organization.parseUsd('USD 1.2bn')).toBe(1_200_000_000);
    expect(organization.parseUsd('€25 million')).toBeNull();
    const valid = organization.validateRound({ company: 'Acme Labs', amount_text: '$25 million', stage: 'Seed', investors: ['Example Capital', 'Invented Fund'], valuation_text: '$120 million' }, ventureQuote);
    expect(valid).toMatchObject({ company: 'Acme Labs', amount_usd: 25_000_000, stage: 'seed', investors: ['Example Capital'], valuation_usd: 120_000_000 });
    expect(organization.validateRound({ company: 'Gamma Corp', amount_text: '$25 million' }, ventureQuote)).toBeNull();
    expect(organization.validateRound({ company: 'Acme Labs', amount_text: '$30 million' }, ventureQuote)).toBeNull();
    expect(organization.validateRound({ company: 'Acme Labs', amount_text: '$2' }, ventureQuote)).toBeNull();
    expect(organization.validateRound({ company: 'AI', amount_text: '$25 million' }, ventureQuote)).toBeNull();
    expect(organization.validateRound({ company: 'Acme Labs', amount_text: '$25' }, ventureQuote)).toMatchObject({ amount_text: '$25 million', amount_usd: 25_000_000 });
    expect(organization.validateRound({ company: 'Acme', amount_text: '$25 million' }, ventureQuote)).toBeNull();
    expect(organization.validateRound({ company: 'Labs', amount_text: '$25 million' }, ventureQuote)).toBeNull();
    expect(organization.validateRound({ company: 'Acme Labs', amount_text: '$25 million', investors: ['Capital', 'Example Capital'] }, ventureQuote)?.investors).toEqual(['Example Capital']);
  });
  it('rejects groupings that mix categories, repeat or invent claims, invent numbers or start a topic with one claim', () => {
    const claims = ['a:0', 'b:0', 'c:0'].map((ref) => ({ ref, event_id: ref.slice(0, 1), position: 0, text: 'Lendex lending moved $5M in a week', source_id: 's', source: 'S', primary_category: null, significance: 3, subject_date: null, captured_at: null }));
    const categoryOf = (ref: string) => (ref === 'c:0' ? 'macro' : 'defi') as any;
    const title = 'Lendex lending moved $5M in a week after the fixture depeg';
    const dek = 'A context sentence that is long enough to pass the validator.';
    const check = (topics: any[], unsorted: string[] = []) => organization.validateTopicBatch({ topics, unsorted }, claims, categoryOf, new Map(), new Set(), false).issues.join(' ');
    expect(check([{ key: 'new-1', title, dek, claims: ['a:0', 'b:0'] }], ['c:0'])).toBe('');
    expect(check([{ key: 'new-1', title, dek, claims: ['a:0', 'c:0'] }], ['b:0'])).toMatch(/mixes categories/);
    expect(check([{ key: 'new-1', title, dek, claims: ['a:0', 'zz:0'] }])).toMatch(/not supplied/);
    expect(check([{ key: 'new-1', title, dek, claims: ['a:0'] }])).toMatch(/at least two/);
    expect(check([{ key: 'new-1', title, dek, claims: ['a:0', 'a:0'] }])).toMatch(/more than once/);
    expect(check([{ key: 'new-1', title: 'Lendex lending moved $9M in a week after the fixture depeg', dek, claims: ['a:0', 'b:0'] }])).toMatch(/numbers that are not in its claims/);
    // On the final attempt a broken topic is dropped and the valid ones are kept.
    const final = organization.validateTopicBatch({ topics: [{ key: 'new-1', title, dek, claims: ['a:0', 'b:0'] }, { key: 'new-2', title: 'Macro moved $5M in a week for Lendex lending desks', dek, claims: ['c:0', 'a:0'] }] }, claims, categoryOf, new Map(), new Set(), true);
    expect(final.issues).toEqual([]);
    expect(final.outcome.topics.map((topic) => topic.claims)).toEqual([['a:0', 'b:0']]);
    expect(final.outcome.unsorted).toEqual(['c:0']);
  });
  it('measures failure limits by share and prefers the answer that files more claims', () => {
    expect(organization.exceedsShare(1, 4, 0.25)).toBe(false);
    expect(organization.exceedsShare(2, 4, 0.25)).toBe(true);
    expect(organization.exceedsShare(90, 90, 0.25)).toBe(true);
    const topic = (claims: string[]) => ({ key: 'k', category: 'defi' as const, title: 't', dek: 'd', description: '', claims, isNew: true });
    const rich = { topics: [topic(['a:0', 'b:0']), topic(['c:0', 'd:0'])], unsorted: [], failed: false };
    const poor = { topics: [topic(['a:0', 'b:0'])], unsorted: ['c:0', 'd:0'], failed: false };
    expect(organization.betterOutcome(rich, poor)).toBe(rich);
    expect(organization.betterOutcome(poor, rich)).toBe(rich);
    expect(organization.betterOutcome(null, poor)).toBe(poor);
  });
  it('limits extracted categories to the fixed list and passes venture rounds on for checking', () => {
    const quote = 'Delta Labs raised $40 million in a Series A led by Example Ventures to expand stablecoin payouts.';
    const base = { claim: 'Delta Labs raised $40 million in a Series A led by Example Ventures.', quote, topic: 'Delta Labs raises a Series A for payouts', significance: 3, tags: [], entities: [], dates: [] };
    const [unknown] = processor.validateExtraction({ claims: [{ ...base, category: 'protocol_launch' }] }, quote);
    expect(unknown.category).toBe('unsorted');
    const [venture] = processor.validateExtraction({ claims: [{ ...base, category: 'venture', round: { company: 'Delta Labs', amount_text: '$40 million' } }] }, quote);
    expect(venture).toMatchObject({ category: 'venture', round: { company: 'Delta Labs' } });
  });
});

describe('rebuilding Topics from claims', () => {
  it('previews a sample without changing Topics', async () => {
    const preview = await prompts.previewTopics('topic-test');
    expect(preview.claim_count).toBeGreaterThan(0);
    expect(preview.topics.every((topic) => organization.isCategory(topic.category))).toBe(true);
    expect(organization.activeOrganizationV2()).toBeNull();
    expect(organization.latestPreview()?.generated_by).toBe('topic-test');
  });

  it('changes nothing when Hermes is unavailable', async () => {
    const before = categoriesNow();
    state.outage = true;
    await expect(prompts.rebuildTopics('topic-test')).rejects.toBeInstanceOf(organization.HermesUnavailableError);
    state.outage = false;
    expect(organization.activeOrganizationV2()).toBeNull();
    expect(categoriesNow()).toEqual(before);
  });

  it('puts every claim in one topic or under its category and migrates event categories', async () => {
    const claims = organization.loadClaims();
    const before = categoriesNow();
    const result = await prompts.rebuildTopics('topic-test');
    const saved = organization.activeOrganizationV2()!;
    expect(saved.topics.length).toBe(result.topics.length);
    expect(result.uncategorized).toBe(0);
    const seen = saved.topics.flatMap((topic) => topic.claims);
    expect(new Set(seen).size).toBe(seen.length);
    expect(Object.keys(saved.categories).length).toBe(claims.length);
    for (const topic of saved.topics) {
      expect(topic.claims.length).toBeGreaterThanOrEqual(1);
      expect(topic.claims.every((ref) => saved.categories[ref] === topic.category)).toBe(true);
    }
    const changed = database.all<any>('SELECT id, primary_category FROM events').filter((row) => before.get(row.id) !== row.primary_category);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((row) => organization.isCategory(row.primary_category))).toBe(true);
    const snapshot = JSON.parse(database.one<any>("SELECT value FROM generation_meta WHERE key='topics.categories.previous'")!.value);
    expect(Object.keys(snapshot.categories).length).toBe(changed.length);
    expect(snapshot.organization).toBeNull();
    const original = JSON.parse(database.one<any>("SELECT value FROM generation_meta WHERE key='topics.categories.original'")!.value);
    expect(Object.keys(original.categories).length).toBe(changed.length);
    const legacy = changed.find((row) => before.get(row.id) && !['research', 'unsorted'].includes(before.get(row.id)) && !organization.isCategory(before.get(row.id)));
    if (legacy) expect(database.one('SELECT 1 FROM event_tags WHERE event_id=? AND tag=?', legacy.id, before.get(legacy.id).replace(/_/g, ' '))).toBeTruthy();
  });

  it('serves categories, context lines and member claims only', () => {
    const payload = tools.topicsPayload();
    expect(payload.version).toBe(2);
    expect(payload.categories.map((category: any) => category.id)).toEqual(organization.CATEGORY_IDS);
    const first = payload.topics[0];
    expect(first).toMatchObject({ tag: expect.any(String), dek: expect.any(String), category: expect.any(String) });
    const detail = tools.listTopics(undefined, first.tag);
    expect(detail.topic_title).toBe(first.title);
    expect(detail.claims.length).toBe(first.claim_count);
    expect(detail.topics).toBeUndefined();
    expect(tools.listTopics(3).length).toBeLessThanOrEqual(3);
  });

  it('records verified funding rounds and drops invented ones', () => {
    const rounds = organization.listRounds();
    expect(rounds.find((round) => round.company === 'Acme Labs')).toMatchObject({ amount_usd: 25_000_000, investors: ['Example Capital', 'Imaginary Partners'] });
    expect(rounds.some((round) => round.company === 'Gamma Corp')).toBe(false);
  });

  it('files claims that arrive after a rebuild, including their funding rounds', async () => {
    database.run("INSERT INTO sources(source_id,identity_basis,title,source_type,source_channel,captured_at,origin) VALUES (?,?,'Filing fixture','article','test','2026-10-20T00:00:00Z','ingested')", placementSource, `text:${placementSource}`);
    const quote = 'Delta Labs raised $40 million in a Series A led by Example Ventures to expand stablecoin payouts.';
    processor.commitSourceClaims(placementSource, [
      { claim: 'Delta Labs raised $40 million in a Series A led by Example Ventures.', quote, topic: 'Delta Labs raises a Series A for payouts', category: 'venture', significance: 3, tags: [], entities: [], dates: [], round: { company: 'Delta Labs', amount_text: '$40 million', stage: 'series a', investors: ['Example Ventures'] } },
      { claim: 'A lending fixture argues that isolated pools contain contagion between collateral types.', quote: 'Isolated pools contain contagion between collateral types, the lending fixture argues.', topic: 'Isolated pools contain contagion in lending', category: 'defi', significance: 3, tags: [], entities: [], dates: [] },
    ]);
    const refs = organization.loadClaims({ sourceId: placementSource }).map((claim) => claim.ref);
    expect(refs.every((ref) => !(ref in organization.activeOrganizationV2()!.categories))).toBe(true);
    const result = await organization.fileNewClaims();
    expect(result).toMatchObject({ claims: refs.length, uncategorized: 0 });
    const saved = organization.activeOrganizationV2()!;
    expect(refs.every((ref) => organization.isCategory(saved.categories[ref]))).toBe(true);
    expect(saved.topics.some((topic) => topic.claims.some((ref) => refs.includes(ref)))).toBe(true);
    expect(await organization.fileNewClaims()).toMatchObject({ claims: 0 });
    expect(organization.listRounds().find((round) => round.company === 'Delta Labs')).toMatchObject({ amount_usd: 40_000_000, stage: 'series a' });
  });

  it('retries claims after an unusable answer and parks them only after three', async () => {
    const source = `sha256:${'a'.repeat(64)}`;
    database.run("INSERT INTO sources(source_id,identity_basis,title,source_type,source_channel,captured_at,origin) VALUES (?,?,'Unusable fixture','article','test','2026-10-21T00:00:00Z','ingested')", source, `text:${source}`);
    processor.commitSourceClaims(source, [{ claim: 'A fixture claim with an old-style label that needs a category from Hermes.', quote: 'A fixture claim with an old-style label that needs a category.', topic: 'Fixture claim needing a category from Hermes', category: 'research', significance: 2, tags: [], entities: [], dates: [] }]);
    const [ref] = organization.loadClaims({ sourceId: source }).map((claim) => claim.ref);
    state.garbageCategorize = true;
    for (let attempt = 0; attempt < 3; attempt++) await expect(organization.fileNewClaims({ sourceId: source })).rejects.toMatchObject({ code: 'unusable_answer' });
    expect(organization.activeOrganizationV2()!.uncategorized ?? []).not.toContain(ref);
    expect(await organization.fileNewClaims({ sourceId: source })).toMatchObject({ claims: 0 });
    state.garbageCategorize = false;
  });

  it('keeps a failed batch waiting when it is a small share, and saves nothing when it is not', async () => {
    const before = organization.activeOrganizationV2()!.generated_at;
    state.failNextGroupCalls = 2;
    try {
      const result = await prompts.rebuildTopics('topic-test');
      expect(result.failed_groups).toBe(1);
      expect(result.unsorted).toBeGreaterThan(0);
    } catch (error: any) {
      expect(error.code).toBe('grouping_incomplete');
      expect(organization.activeOrganizationV2()!.generated_at).toBe(before);
    } finally {
      state.failNextGroupCalls = 0;
    }
  });

  it('undoes only the last rebuild, restoring its categories and the earlier Topics', async () => {
    const earlier = organization.activeOrganizationV2()!;
    const before = categoriesNow();
    state.shift = true;
    await prompts.rebuildTopics('topic-test');
    state.shift = false;
    expect(categoriesNow()).not.toEqual(before);
    organization.undoTopicRebuild('topic-test');
    expect(categoriesNow()).toEqual(before);
    expect(organization.activeOrganizationV2()?.generated_at).toBe(earlier.generated_at);
    expect(() => organization.undoTopicRebuild('topic-test')).toThrow(/no rebuild/i);
  });
});
