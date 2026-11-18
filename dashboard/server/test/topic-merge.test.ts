import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * A stand-in for the AI that answers the duplicate search from what it is
 * sent. The finder merges topics whose titles share a MERGEME marker, links
 * those sharing a RELATEME marker, and reports "Call Sheet" as a garbled
 * "Kalshi". The check keeps every topic it is given unless one is marked
 * NOTSAME, and writes a merged title and context line. Tests can queue bad
 * answers: `find` for the first pass, `check` for checks of a group that is
 * kept (so the order the checks run in doesn't matter). The real input,
 * checks, storage, apply and undo code run on a copy of the stored corpus.
 */
const state = vi.hoisted(() => ({
  calls: [] as Array<{ input: string; instructions: string }>,
  find: [] as Array<'garbage'>,
  check: [] as Array<'bad_number' | 'bad_category' | undefined>,
}));

vi.mock('../src/hermes-client.js', () => {
  const topicsIn = (input: string) => input.split('TOPICS\n')[1].split('\n\n')[0].split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
  return {
    runHermesAgent: vi.fn(),
    generateWithHermes: vi.fn(async (input: string, options: any) => {
      const instructions = (options.instructions ?? []).join('\n\n');
      state.calls.push({ input, instructions });
      if (instructions.includes('for duplicates') && state.find.shift() === 'garbage') return 'I could not decide.';
      const topics = topicsIn(input);
      if (instructions.includes('for duplicates')) {
        const byMarker = (marker: string) => {
          const groups = new Map<string, string[]>();
          for (const topic of topics) {
            const found = new RegExp(`${marker}(\\w+)`).exec(topic.title)?.[1];
            if (found) groups.set(found, [...(groups.get(found) ?? []), topic.t]);
          }
          return [...groups.values()].filter((group) => group.length >= 2);
        };
        return JSON.stringify({
          merges: byMarker('MERGEME').map((group) => ({ topics: group, reason: 'They describe the same proposal.' })),
          related: byMarker('RELATEME').map((group) => ({ topics: group, subject: 'One company from different angles' })),
          names: topics.filter((topic) => topic.title.includes('Call Sheet')).map((topic) => ({ seen: 'Call Sheet', likely: 'Kalshi', topics: [topic.t] })),
        });
      }
      if (instructions.includes('tell the same story and should become one topic page')) {
        const keep = topics.some((topic) => topic.title.includes('NOTSAME')) ? [] : topics.map((topic) => topic.t);
        const variant = keep.length ? state.check.shift() : undefined;
        return JSON.stringify({
          keep,
          title: variant === 'bad_number' ? 'Validators would lose $999 million in rewards under the burn proposal' : 'Ethereum validators would lose their rewards under the burn proposal',
          dek: 'Several sources describe one proposal to burn staking rewards and how lenders reacted.',
          category: variant === 'bad_category' ? 'nonsense' : topics[0]?.category,
          reason: keep.length ? 'Every topic covers the same proposal.' : 'Two different events.',
          ...(keep.length ? {} : { subject: 'Incidents at Drift.' }),
        });
      }
      return '{}';
    }),
  };
});

const folder = mkdtempSync(join(tmpdir(), 'topic-merge-'));
let organization: typeof import('../src/topic-organization.js');
let merge: typeof import('../src/topic-merge.js');
let reading: typeof import('../src/topic-reading.js');
let analysis: typeof import('../src/topic-analysis.js');
let database: typeof import('../src/db.js');
let refs: string[] = [];
const MARK_INSTRUCTION = 'Group claims into topics a sharp crypto investor would open. Titles name the actor.';

const SPEC = [
  { key: 'burn-chains', category: 'chains_infrastructure', title: 'Ethereum proposal MERGEMEa burns validator rewards at half staked', size: 4 },
  { key: 'burn-tokens', category: 'tokens_governance', title: 'Proposal MERGEMEa would burn all staking rewards, participants argue', size: 3 },
  { key: 'burn-defi', category: 'defi', title: 'Zero-yield ether MERGEMEa could push capital out of lending', size: 2 },
  { key: 'hack-one', category: 'security_exploits', title: 'NOTSAME Drift MERGEMEb exploit drained a vault in one minute', size: 3 },
  { key: 'hack-two', category: 'security_exploits', title: 'Drift MERGEMEb paused deposits after a separate oracle bug', size: 3 },
  { key: 'backpack-one', category: 'venture', title: 'Backpack RELATEMEc grows through international markets first', size: 3 },
  { key: 'backpack-two', category: 'markets_trading', title: 'Backpack RELATEMEc builds its exchange around self-custody', size: 3 },
  { key: 'kalshi', category: 'regulation_policy', title: 'Call Sheet and Polymarket offer prediction bets across all states', size: 3 },
  { key: 'filler', category: 'macro', title: 'Fed cuts leave little room for further easing, Ram argues', size: 3 },
] as const;

const save = (value: object) => database.run('INSERT OR REPLACE INTO generation_meta (key, value) VALUES (?, ?)', organization.ORGANIZATION_KEY, JSON.stringify(value));

function seed() {
  let next = 0;
  const now = new Date().toISOString();
  const topics = SPEC.map((spec) => ({
    key: spec.key, category: spec.category, title: spec.title, dek: `Context for ${spec.key} from the claims behind it.`, description: '',
    claims: refs.slice(next, (next += spec.size)), created_at: now, updated_at: now,
  }));
  const categories = Object.fromEntries(topics.flatMap((topic) => topic.claims.map((ref) => [ref, topic.category])));
  save({ version: 2, generated_at: now, generated_by: 'test', prompt_revision: 1, topics, categories });
  database.run('DELETE FROM generation_meta WHERE key IN (?, ?)', merge.MERGE_PROPOSAL_KEY, merge.MERGE_SNAPSHOT_KEY);
  database.run('DELETE FROM app_settings WHERE key = ?', reading.READING_KEY);
  return organization.activeOrganizationV2()!;
}

beforeAll(async () => {
  copyFileSync(resolve('../data/crypto-intelligence.db'), join(folder, 'test.db'));
  process.env.CRYPTO_DB = join(folder, 'test.db');
  database = await import('../src/db.js');
  organization = await import('../src/topic-organization.js');
  merge = await import('../src/topic-merge.js');
  reading = await import('../src/topic-reading.js');
  analysis = await import('../src/topic-analysis.js');
  organization.timing.retryPauseMs = 0;
  refs = organization.loadClaims().map((claim) => claim.ref).sort();
});

afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe('reading the answers', () => {
  const topic = (key: string, claims: number) => ({ key, claims: new Array(claims).fill('x') }) as any;
  const aliases = new Map([['t1', topic('a', 30)], ['t2', topic('b', 25)], ['t3', topic('c', 10)], ['t4', topic('d', 4)]]);
  const size = (item: any) => item.claims.length;

  it('keeps known, unrepeated groups and links a group too large to merge', () => {
    const found = merge.readFindAnswer({
      merges: [
        { topics: ['t1', 't2', 't3'], reason: 'Too large together.' },
        { topics: ['t3', 't4'], reason: 'One story.' },
        { topics: ['t4', 't9'], reason: 'Unknown alias.' },
        { topics: ['t3', 't4'], reason: 'Repeat.' },
      ],
      related: [{ topics: ['t1', 't3'], subject: 'Already linked t1' }],
      names: [{ seen: 'Call Sheet', likely: 'Kalshi', topics: ['t4', 't77'] }, { seen: 'Same', likely: 'same', topics: ['t1'] }],
    }, aliases, size);
    expect(found.usable).toBe(true);
    expect(found.merges).toEqual([{ aliases: ['t3', 't4'], reason: 'One story.' }]);
    expect(found.related.map((group) => group.aliases)).toEqual([['t1', 't2', 't3']]);
    expect(found.names).toEqual([{ seen: 'Call Sheet', likely: 'Kalshi', aliases: ['t4'] }]);
    expect(merge.readFindAnswer({ topics: [] }, aliases, size).usable).toBe(false);
  });
});

describe('finding duplicate topics', () => {
  it('proposes only merges both passes agree on, links the rest and changes no topic', async () => {
    const before = JSON.stringify(seed());
    state.calls = [];
    const proposal = await merge.findDuplicateTopics('mark', MARK_INSTRUCTION);
    expect(JSON.stringify(organization.activeOrganizationV2())).toBe(before);
    expect(proposal.merges).toHaveLength(1);
    const [found] = proposal.merges;
    expect([...found.keys].sort()).toEqual(['burn-chains', 'burn-defi', 'burn-tokens']);
    expect(found.title).toBe('Ethereum validators would lose their rewards under the burn proposal');
    expect(found.claims).toBe(9);
    // The Drift topics were proposed but not confirmed, so they are linked instead.
    expect(proposal.rejected.map((group) => [...group.keys].sort())).toEqual([['hack-one', 'hack-two']]);
    expect(proposal.related.map((group) => [...group.keys].sort())).toEqual(expect.arrayContaining([['backpack-one', 'backpack-two'], ['hack-one', 'hack-two']]));
    // Linked under the subject the check named, without its trailing full stop.
    expect(proposal.related.find((group) => group.keys.includes('hack-one'))?.subject).toBe('Incidents at Drift');
    expect(proposal.rejected[0].reason).toBe('Two different events.');
    expect(proposal.names).toEqual([{ seen: 'Call Sheet', likely: 'Kalshi', keys: ['kalshi'] }]);
    // The first pass read every topic at once; each check read every claim of its topics, with Mark's instruction.
    expect(state.calls[0].input.split('\n').filter((line) => line.startsWith('{"t":'))).toHaveLength(SPEC.length);
    const check = state.calls.find((call) => call.input.includes('MERGEMEa') && call.instructions.includes('should become one topic page'))!;
    expect(check.instructions).toContain(`MARK'S TOPICS INSTRUCTION\n${MARK_INSTRUCTION}`);
    expect((check.input.match(/"claim":/g) ?? []).length).toBe(9);
    expect(merge.mergeProposal()?.id).toBe(proposal.id);
  });

  it('gives a merge check one corrected retry for an invented number or a wrong category', async () => {
    seed();
    state.calls = [];
    state.check = ['bad_number'];
    const proposal = await merge.findDuplicateTopics('mark', MARK_INSTRUCTION);
    const retried = state.calls.filter((call) => call.input.includes('CORRECT THESE ISSUES'));
    expect(retried).toHaveLength(1);
    expect(retried[0].input).toMatch(/title uses numbers that are not in the claims: \$?999/);
    expect(proposal.merges).toHaveLength(1);
    expect(proposal.merges[0].title).not.toMatch(/999/);
    seed();
    state.calls = [];
    state.check = ['bad_category'];
    const second = await merge.findDuplicateTopics('mark', MARK_INSTRUCTION);
    expect(state.calls.filter((call) => /category must be one of/.test(call.input))).toHaveLength(1);
    expect(second.merges).toHaveLength(1);
    expect(['chains_infrastructure', 'tokens_governance', 'defi']).toContain(second.merges[0].category);
    // Two bad answers in a row leave the group out of the preview rather than merging it with a bad title.
    seed();
    state.check = ['bad_number', 'bad_number'];
    const third = await merge.findDuplicateTopics('mark', MARK_INSTRUCTION);
    expect(third.merges).toHaveLength(0);
    expect(state.check).toHaveLength(0);
  });

  it('proposes nothing when the finder answers twice without a usable list', async () => {
    seed();
    state.find = ['garbage', 'garbage'];
    await expect(merge.findDuplicateTopics('mark', MARK_INSTRUCTION)).rejects.toThrow(/without a usable list of duplicates/);
    expect(merge.mergeProposal()).toBeNull();
  });
});

describe('applying and undoing merges', () => {
  it('merges into the largest topic, forwards old links, carries reading marks and links related topics', async () => {
    // Links saved by an earlier merge: one is kept as it is, one follows its topic into the merge.
    save({ ...seed(), related: [{ keys: ['kalshi', 'filler'], subject: 'Saved earlier' }, { keys: ['burn-tokens', 'kalshi'], subject: 'Saved earlier too' }] });
    const marked = new Date(Date.now() - 60_000).toISOString();
    database.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', reading.READING_KEY, JSON.stringify({ version: 1, marks: {
      'burn-tokens': { bookmarked_at: marked, rating: 4, claims: [], updated_at: marked },
    } }));
    const proposal = await merge.findDuplicateTopics('mark', MARK_INSTRUCTION);
    const [found] = proposal.merges;
    const result = merge.applyMerges('mark', [found.id]);
    expect(result).toMatchObject({ merged: 1, removed: 2, topics: SPEC.length - 2 });
    const after = organization.activeOrganizationV2()!;
    const survivor = after.topics.find((topic) => topic.key === 'burn-chains')!;
    expect(survivor.title).toBe(found.title);
    expect(survivor.category).toBe(found.category);
    expect(survivor.claims).toHaveLength(9);
    expect(survivor.claims.every((ref) => after.categories[ref] === found.category)).toBe(true);
    expect(after.topics.some((topic) => topic.key === 'burn-tokens' || topic.key === 'burn-defi')).toBe(false);
    expect(merge.forwardedTopicKey('burn-tokens')).toBe('burn-chains');
    expect(merge.forwardedTopicKey('burn-chains')).toBeNull();
    expect(after.related?.map((group) => [...group.keys].sort())).toEqual(expect.arrayContaining([
      ['backpack-one', 'backpack-two'], ['filler', 'kalshi'], ['burn-chains', 'kalshi'],
    ]));
    // The merged topic had no marks of its own, so it takes the bookmark of a topic merged into it.
    const marks = JSON.parse(database.one<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', reading.READING_KEY)!.value).marks;
    expect(marks['burn-chains']).toMatchObject({ bookmarked_at: marked, rating: 4 });
    expect(merge.mergeProposal()).toBeNull();
    // Linked topics come first among an analysis page's related topics.
    const sourceOf = new Map(organization.loadClaims().map((claim) => [claim.ref, claim.source_id]));
    const backpack = after.topics.find((topic) => topic.key === 'backpack-one')!;
    expect(analysis.relatedTopics(backpack, after, sourceOf)[0].key).toBe('backpack-two');
  });

  it('refuses a stale or changed preview and an empty choice', async () => {
    seed();
    const proposal = await merge.findDuplicateTopics('mark', MARK_INSTRUCTION);
    expect(() => merge.applyMerges('mark', [])).toThrow(/Tick at least one merge/);
    const current = organization.activeOrganizationV2()!;
    save({ ...current, topics: current.topics.filter((topic) => topic.key !== 'burn-defi') });
    expect(() => merge.applyMerges('mark', [proposal.merges[0].id])).toThrow(/changed or gone since/);
    save({ ...current, generated_at: new Date(Date.now() + 1000).toISOString() });
    expect(() => merge.applyMerges('mark', [proposal.merges[0].id])).toThrow(/rebuilt since this preview/);
  });

  it('undoes the last merge, keeping claims filed into the merged topic since', async () => {
    const original = seed();
    const proposal = await merge.findDuplicateTopics('mark', MARK_INSTRUCTION);
    merge.applyMerges('mark', [proposal.merges[0].id]);
    // A claim filed into the merged topic after the merge.
    const filed = refs[40];
    const merged = organization.activeOrganizationV2()!;
    save({
      ...merged,
      topics: merged.topics.map((topic) => (topic.key === 'burn-chains' ? { ...topic, claims: [...topic.claims, filed] } : topic)),
      categories: { ...merged.categories, [filed]: proposal.merges[0].category },
    });
    expect(merge.undoMerge('mark')).toMatchObject({ restored: 1, topics: SPEC.length });
    const restored = organization.activeOrganizationV2()!;
    for (const before of original.topics) {
      const now = restored.topics.find((topic) => topic.key === before.key)!;
      expect(now.title).toBe(before.title);
      expect(now.category).toBe(before.category);
      expect(now.claims).toEqual(before.key === 'burn-chains' ? [...before.claims, filed] : before.claims);
      expect(before.claims.every((ref) => restored.categories[ref] === before.category)).toBe(true);
    }
    expect(restored.categories[filed]).toBe('chains_infrastructure');
    expect(restored.forward).toBeUndefined();
    expect(restored.related).toBeUndefined();
    expect(() => merge.undoMerge('mark')).toThrow(/no merge to undo/);
  });

  it('follows a chain of merges to the topic that holds them now', () => {
    const current = { ...seed(), forward: { gone: 'also-gone', 'also-gone': 'filler', loop: 'loop' } };
    save(current);
    expect(merge.forwardedTopicKey('gone')).toBe('filler');
    expect(merge.forwardedTopicKey('filler')).toBeNull();
    expect(merge.forwardedTopicKey('loop')).toBeNull();
    expect(merge.forwardedTopicKey('never-existed')).toBeNull();
    // Claims being filed when a merge lands join the topic it went into.
    expect(organization.followForward('gone', current)).toBe('filler');
    expect(organization.followForward('filler', current)).toBe('filler');
    expect(organization.followForward('loop', current)).toBeUndefined();
  });
});
