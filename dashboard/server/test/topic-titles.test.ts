import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * A stand-in for the AI that rewrites titles from what it is sent: it keeps a
 * topic whose title says KEEPME, invents a surname for BADNAME until it is
 * corrected and for ALWAYSBAD every time, and otherwise writes a new title that
 * names nobody and says whose view it is. The real input, checks, storage,
 * apply and undo code run on a copy of the stored corpus.
 */
const state = vi.hoisted(() => ({ calls: [] as Array<{ input: string; instructions: string }> }));

vi.mock('../src/hermes-client.js', () => {
  const topicsIn = (input: string) => input.split('TOPICS\n')[1].split('\n\n')[0].split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
  const code = (alias: string) => String.fromCharCode(96 + Number(alias.slice(1)));
  return {
    runHermesAgent: vi.fn(),
    generateWithHermes: vi.fn(async (input: string, options: any) => {
      const instructions = (options.instructions ?? []).join('\n\n');
      state.calls.push({ input, instructions });
      if (!instructions.startsWith('You rewrite the titles')) return '{}';
      const correcting = input.includes('CORRECT THESE ISSUES');
      return JSON.stringify({ topics: topicsIn(input).map((topic: any) => {
        if (topic.title.includes('KEEPME')) return { t: topic.t, keep: true };
        const invent = topic.title.includes('ALWAYSBAD') || (topic.title.includes('BADNAME') && !correcting);
        return {
          t: topic.t,
          title: invent ? 'Lending desks shifted between venues, Quillon Ippolwhistle argues' : `Lending desks shifted between venues in story ${code(topic.t)}, guests argue`,
          dek: 'Guests describe how lending desks moved between venues in this story.',
        };
      }) });
    }),
  };
});

const folder = mkdtempSync(join(tmpdir(), 'topic-titles-'));
let organization: typeof import('../src/topic-organization.js');
let titles: typeof import('../src/topic-titles.js');
let database: typeof import('../src/db.js');
let refs: string[] = [];
const MARK_INSTRUCTION = 'Group claims into topics a sharp crypto investor would open. Titles carry the number or tension that matters.';
const SPEC = [
  { key: 'plain-one', title: 'Plain topic one about lending desks and venues', size: 3 },
  { key: 'keep-one', title: 'KEEPME topic that already follows every rule', size: 3 },
  { key: 'bad-once', title: 'BADNAME topic that needs a second answer', size: 3 },
  { key: 'always-bad', title: 'ALWAYSBAD topic that never gets a usable title', size: 3 },
  { key: 'plain-two', title: 'Plain topic two about lending desks and venues', size: 2 },
] as const;

const save = (value: object) => database.run('INSERT OR REPLACE INTO generation_meta (key, value) VALUES (?, ?)', organization.ORGANIZATION_KEY, JSON.stringify(value));

function seed() {
  let next = 0;
  const now = new Date().toISOString();
  const topics = SPEC.map((spec) => ({
    key: spec.key, category: 'defi', title: spec.title, dek: `The current context line for ${spec.key}.`, description: '',
    claims: refs.slice(next, (next += spec.size)), created_at: now, updated_at: now,
  }));
  save({ version: 2, generated_at: now, generated_by: 'test', prompt_revision: 1, topics, categories: Object.fromEntries(topics.flatMap((topic) => topic.claims.map((ref) => [ref, 'defi']))) });
  database.run('DELETE FROM generation_meta WHERE key IN (?, ?)', titles.TITLES_PROPOSAL_KEY, titles.TITLES_SNAPSHOT_KEY);
  return organization.activeOrganizationV2()!;
}
const titleOf = (key: string) => organization.activeOrganizationV2()!.topics.find((topic) => topic.key === key)!.title;

beforeAll(async () => {
  copyFileSync(resolve('../data/crypto-intelligence.db'), join(folder, 'test.db'));
  process.env.CRYPTO_DB = join(folder, 'test.db');
  database = await import('../src/db.js');
  organization = await import('../src/topic-organization.js');
  titles = await import('../src/topic-titles.js');
  organization.timing.retryPauseMs = 0;
  refs = organization.loadClaims().map((claim) => claim.ref).sort();
});

afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe('checking a proposed title', () => {
  const claim = (ref: string, text: string) => ({ ref, event_id: ref.slice(0, 1), position: 0, text, source_id: 's1', source: 'A Crypto Native Financial System | Felipe Montealegre',
    primary_category: null, significance: 3, subject_date: null, captured_at: null });
  const entry = {
    alias: 't1',
    topic: { key: 'k', category: 'tokens_governance' as const, title: 'Insiders favor equity over tokens, Felipe argues', dek: 'Felipe says insiders direct new value to equity holders.', description: '', claims: [], created_at: '', updated_at: '' },
    claims: [claim('a:0', 'Felipe argues that insiders favor equity over tokens when both exist.'), claim('b:0', 'Felipe says Metaplex sent cash to token buybacks, not equity.')],
  };

  it('takes a full name from the source titles but not a surname the research never gives', () => {
    const dek = 'He says Metaplex sent its cash to token buybacks, not to equity.';
    expect(titles.readTitleAnswer({ t: 't1', title: 'Felipe Montealegre argues insiders favor equity over tokens', dek }, entry, new Set())).toMatchObject({ kind: 'change' });
    const invented = titles.readTitleAnswer({ t: 't1', title: 'Felipe Ippolito argues insiders favor equity over tokens', dek }, entry, new Set());
    expect(invented).toMatchObject({ kind: 'fix' });
    expect((invented as { issues: string[] }).issues.join(' ')).toMatch(/names that are not in the claims or their sources: Ippolito/);
  });

  it('keeps wording that already follows the rules and refuses a title another topic has', () => {
    expect(titles.readTitleAnswer({ t: 't1', keep: true }, entry, new Set())).toEqual({ kind: 'keep' });
    expect(titles.readTitleAnswer({ t: 't1', title: entry.topic.title, dek: entry.topic.dek }, entry, new Set())).toEqual({ kind: 'keep' });
    const taken = new Set(['felipe montealegre argues insiders favor equity over tokens']);
    const duplicate = titles.readTitleAnswer({ t: 't1', title: 'Felipe Montealegre argues insiders favor equity over tokens', dek: entry.topic.dek }, entry, taken);
    expect((duplicate as { issues: string[] }).issues.join(' ')).toMatch(/duplicates another topic/);
  });

  it('asks whose view a title states when its claims are arguments', () => {
    const unattributed = titles.readTitleAnswer({ t: 't1', title: 'Insiders favor equity over tokens when a company holds both', dek: entry.topic.dek }, entry, new Set());
    expect((unattributed as { issues: string[] }).issues.join(' ')).toMatch(/states a view as fact/);
  });
});

describe('refreshing titles', () => {
  it('proposes new wording, keeps what already follows the rules, corrects once and changes no topic', async () => {
    const before = JSON.stringify(seed());
    state.calls = [];
    const proposal = await titles.refreshTitles('mark', MARK_INSTRUCTION);
    expect(JSON.stringify(organization.activeOrganizationV2())).toBe(before);
    expect(proposal.changes.map((change) => change.key).sort()).toEqual(['bad-once', 'plain-one', 'plain-two']);
    expect(proposal).toMatchObject({ topics: SPEC.length, kept: 1, failed: 1, calls: 2 });
    const corrected = proposal.changes.find((change) => change.key === 'bad-once')!;
    expect(corrected.before.title).toBe('BADNAME topic that needs a second answer');
    expect(corrected.after.title).toMatch(/guests argue$/);
    // The first request read every topic with its sources and Mark's instruction; the second asked again about the two that failed.
    expect(state.calls[0].instructions).toContain(`MARK'S TOPICS INSTRUCTION\n${MARK_INSTRUCTION}`);
    expect(state.calls[0].instructions).toMatch(/never a bare first name/);
    expect(state.calls[0].input.split('\n').filter((line) => line.startsWith('{"t":'))).toHaveLength(SPEC.length);
    expect(state.calls[0].input).toContain('"sources":[');
    expect(state.calls[1].input).toMatch(/CORRECT THESE ISSUES\nt3: .*names that are not in the claims or their sources: Quillon, Ippolwhistle/);
    expect(state.calls[1].input.split('\n').filter((line) => line.startsWith('{"t":'))).toHaveLength(2);
    expect(titles.titleProposal()?.id).toBe(proposal.id);
  });

  it('applies the ticked titles, skips topics changed since, and undoes only titles not changed again', async () => {
    seed();
    const proposal = await titles.refreshTitles('mark', MARK_INSTRUCTION);
    const idOf = (key: string) => proposal.changes.find((change) => change.key === key)!.id;
    // plain-two is retitled by something else after the preview.
    const current = organization.activeOrganizationV2()!;
    save({ ...current, topics: current.topics.map((topic) => (topic.key === 'plain-two' ? { ...topic, title: 'Plain topic two was retitled by a regrouping run' } : topic)) });
    expect(() => titles.applyTitleChanges('mark', [])).toThrow(/Tick at least one/);
    expect(titles.applyTitleChanges('mark', [idOf('plain-one'), idOf('bad-once'), idOf('plain-two')])).toEqual({ applied: 2, skipped: 1 });
    expect(titleOf('plain-one')).toBe(proposal.changes.find((change) => change.key === 'plain-one')!.after.title);
    expect(titleOf('bad-once')).toMatch(/guests argue$/);
    expect(titleOf('plain-two')).toBe('Plain topic two was retitled by a regrouping run');
    expect(titleOf('keep-one')).toBe('KEEPME topic that already follows every rule');
    expect(titles.titleProposal()).toBeNull();
    expect(titles.titleProposalView().last).toMatchObject({ changes: 2 });
    // bad-once changes again (a merge, say) before the undo, so it keeps its newer title.
    const applied = organization.activeOrganizationV2()!;
    save({ ...applied, topics: applied.topics.map((topic) => (topic.key === 'bad-once' ? { ...topic, title: 'A merged topic took over this key afterwards' } : topic)) });
    expect(titles.undoTitleChanges('mark')).toEqual({ restored: 1, skipped: 1 });
    expect(titleOf('plain-one')).toBe('Plain topic one about lending desks and venues');
    expect(titleOf('bad-once')).toBe('A merged topic took over this key afterwards');
    expect(() => titles.undoTitleChanges('mark')).toThrow(/no title refresh to undo/);
  });

  it('refuses a preview made before Topics were rebuilt', async () => {
    const current = seed();
    const proposal = await titles.refreshTitles('mark', MARK_INSTRUCTION);
    save({ ...current, generated_at: new Date(Date.now() + 1000).toISOString() });
    expect(titles.titleProposalView().proposal?.stale).toBe(true);
    expect(() => titles.applyTitleChanges('mark', [proposal.changes[0].id])).toThrow(/rebuilt since this preview/);
  });
});
