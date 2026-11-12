import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * A stand-in for Hermes that answers analysis requests from the prompt it is
 * sent: it reads the topic, claim ids, passages and other topics and writes an
 * answer that passes the checks, unless a test asks for a bad one. The real
 * input, checks, storage and job code run against a copy of the stored corpus.
 */
const state = vi.hoisted(() => ({
  calls: [] as Array<{ input: string; options: any }>,
  /** Answers for the next calls, used before the default good answer. */
  next: [] as Array<'invented' | 'unknown_id' | 'garbage' | 'silent' | 'no_quotes'>,
  /** Topics that never get a usable answer. */
  unusable: new Set<string>(),
  outage: false,
  /** A pause before each answer, and how many requests were open at once. */
  delayMs: 0,
  inFlight: 0,
  maxInFlight: 0,
}));
vi.mock('../src/hermes-client.js', () => {
  const section = (input: string, name: string) => {
    const start = input.indexOf(`${name}\n`);
    if (start < 0) return [] as any[];
    return input.slice(start + name.length + 1).split('\n\n')[0].split('\n')
      .filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
  };
  const answer = (input: string, variant?: string) => {
    const topic = section(input, 'TOPIC')[0];
    const ids = section(input, 'CLAIMS').map((claim: any) => claim.id);
    const passages = section(input, 'PASSAGES').filter((entry: any) => entry.passage);
    const others = section(input, 'OTHER TOPICS');
    return {
      thesis: variant === 'invented'
        ? `${topic.title} because one venue moved $999 million of deposits in a single week.`
        : `${topic.title} because venues now compete on the design of their risk controls.`,
      points: [
        { text: 'The speakers tie the movement of capital to the design choices each venue makes.', claims: variant === 'unknown_id' ? ['missing-event:0'] : ids.slice(0, 2) },
        { text: 'Two sources describe the same shift from different angles, which makes it a pattern rather than an anecdote.', claims: ids.slice(1, 3) },
      ],
      counterpoints: [{ text: 'The evidence comes from speakers with a stake in the outcome, so it may overstate the shift.', claims: [ids[0]] }],
      quotes: variant === 'no_quotes' ? [] : passages.slice(0, 3).map((entry: any) => ({ claim: entry.claims[0], text: String(entry.passage).replace(/…$/, ''), speaker: null })),
      meaning: 'Beneath the claims is a simple mechanism: design choices decide where capital is safe, and capital moves to where its risk is easiest to price and to contain.',
      why_it_matters: 'For investors, venue design becomes a leading indicator of flows. For builders, risk controls become a product feature that wins deposits from larger rivals.',
      contested: 'The claims do not show how large the shift is, or whether it lasts beyond the current cycle.',
      watch: ['Whether more venues adopt isolated designs after the next stress event.', 'A venue that grows 300% in a month.'],
      connections: [
        ...others.slice(0, 2).map((other: any) => ({ topic: other.key, relation: 'same_mechanism', text: `Both topics turn on the same design choice, seen here from the side of ${String(other.title).toLowerCase()}.` })),
        { topic: 'not-a-topic', relation: 'context', text: 'This link names a topic that does not exist and should be dropped.' },
      ],
    };
  };
  return {
    runHermesAgent: vi.fn(),
    generateWithHermes: vi.fn(async (input: string, options: any) => {
      state.calls.push({ input, options });
      state.inFlight++;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      try {
        if (state.delayMs) await new Promise((done) => setTimeout(done, state.delayMs));
      } finally {
        state.inFlight--;
      }
      if (state.outage) throw new Error('429 insufficient_quota');
      const variant = state.next.shift();
      if (variant === 'silent') throw new Error('Hermes request timeout');
      if (variant === 'garbage') return 'not json';
      const topic = section(input, 'TOPIC')[0];
      if (state.unusable.has(topic?.key)) return JSON.stringify({ thesis: 'Too short.' });
      return JSON.stringify(answer(input, variant));
    }),
  };
});

const folder = mkdtempSync(join(tmpdir(), 'crypto-topic-analysis-'));
let database: typeof import('../src/db.js');
let organization: typeof import('../src/topic-organization.js');
let analysis: typeof import('../src/topic-analysis.js');
let jobs: typeof import('../src/topic-analysis-job.js');
let filing: typeof import('../src/topic-filing.js');
let tools: typeof import('../src/tools.js');
let org: import('../src/topic-organization.js').OrganizationV2;
const SIZES = [8, 7, 6, 5, 4, 3, 3, 2, 1];
const KEYS = ['lending-design', 'liquidity-venues', 'custody-flows', 'stablecoin-niches', 'oracle-risk', 'exit-control', 'fee-markets', 'agent-wallets', 'lone-claim'];
const TITLES = ['Lending venues compete on isolated risk design', 'Liquidity moves to venues with clear exit rules', 'Custody choices decide where institutional capital flows',
  'Stablecoins pick niches because scale is taken', 'Oracle design sets the limits of lending risk', 'Funds that control the exit win the deals',
  'Fee markets shift as activity moves between chains', 'Agent wallets need custody built for software', 'A single claim about bridges'];
const instruction = () => ({ text: analysis.DEFAULT_ANALYSIS_INSTRUCTION, revision: 0 });
const saveOrganization = (value: unknown) => database.run('INSERT OR REPLACE INTO generation_meta (key, value) VALUES (?, ?)', organization.ORGANIZATION_KEY, JSON.stringify(value));
const clearPages = () => database.run("DELETE FROM generation_meta WHERE key LIKE 'topics.analysis.%'");
const topicOf = (key: string) => org.topics.find((topic) => topic.key === key)!;

beforeAll(async () => {
  copyFileSync(resolve('../data/crypto-intelligence.db'), join(folder, 'test.db'));
  process.env.CRYPTO_DB = join(folder, 'test.db');
  database = await import('../src/db.js');
  organization = await import('../src/topic-organization.js');
  analysis = await import('../src/topic-analysis.js');
  jobs = await import('../src/topic-analysis-job.js');
  filing = await import('../src/topic-filing.js');
  tools = await import('../src/tools.js');
  organization.timing.retryPauseMs = 0;
  // Topics of known sizes over the stored claims, the claims with passages first.
  const claims = organization.loadClaims({ refs: organization.loadClaims().map((claim) => claim.ref), withEvidence: true })
    .sort((a, b) => Number(Boolean(b.evidence)) - Number(Boolean(a.evidence)) || a.ref.localeCompare(b.ref));
  let next = 0;
  const now = '2026-11-01T00:00:00.000Z';
  org = {
    version: 2, generated_at: now, generated_by: 'analysis-test', prompt_revision: 0, categories: {},
    topics: SIZES.map((size, index) => ({
      key: KEYS[index], category: index % 2 ? 'defi' : 'markets_trading',
      title: TITLES[index],
      dek: `Context line about ${KEYS[index].replace(/-/g, ' ')} and the venues it moves.`,
      description: 'Synthetic topic for the analysis tests.',
      claims: claims.slice(next, (next += size)).map((claim) => claim.ref), created_at: now, updated_at: now,
    })),
  };
  for (const topic of org.topics) for (const ref of topic.claims) org.categories[ref] = topic.category;
  saveOrganization(org);
  // A research note on the first event, so the prompt carries notes too.
  const first = topicOf('lending-design').claims[0].split(':')[0];
  const note = { headline: 'Research note headline for the lending topic', explanation: 'An explanation written when the claim was extracted.', why_it_matters: 'Why it matters, from the same note.' };
  database.run("INSERT OR REPLACE INTO event_editorial (event_id, kind, headline, content_json, updated_at, updated_by) VALUES (?, 'research', ?, ?, ?, 'test')",
    first, note.headline, JSON.stringify(note), now);
});
afterAll(() => { database?.db.close(); rmSync(folder, { recursive: true, force: true }); });

describe('checking an analysis answer', () => {
  const passage = 'So, um, the the Aave pool lost 45% of its deposits in a week, you know, because institutions wanted walled-off risk.';

  it('keeps a faithful cleanup of a passage and rejects paraphrase, new figures and padding', () => {
    expect(analysis.faithfulQuote('The Aave pool lost 45% of its deposits in a week because institutions wanted walled-off risk.', passage)).toBe(true);
    expect(analysis.faithfulQuote('Institutions pulled almost half the money out of Aave within days, preferring isolated pools.', passage)).toBe(false);
    expect(analysis.faithfulQuote('The Aave pool lost 55% of its deposits in a week because institutions wanted walled-off risk.', passage)).toBe(false);
    expect(analysis.faithfulQuote(`The Aave pool lost 45% of its deposits in a week because institutions wanted walled-off risk. ${'Other words were never said. '.repeat(3)}`, passage)).toBe(false);
    expect(analysis.faithfulQuote('Aave pool lost deposits.', passage)).toBe(false);
  });

  it('asks for a corrected answer when a claim id is unknown, a figure is invented or a section is missing', () => {
    const input = analysis.analysisInput(topicOf('lending-design'), org);
    const good = JSON.parse(JSON.stringify(answerFor(input)));
    expect(analysis.validateAnalysis(good, input).hard).toEqual([]);
    const unknown = analysis.validateAnalysis({ ...good, points: [{ ...good.points[0], claims: ['missing-event:0'] }, good.points[1]] }, input);
    expect(unknown.hard.join(' ')).toMatch(/not in this topic \(missing-event:0\)/);
    const invented = analysis.validateAnalysis({ ...good, meaning: `${good.meaning} Deposits fell by $999 million.` }, input);
    expect(invented.hard.join(' ')).toMatch(/meaning uses figures that are not in the evidence \(999\)/);
    const missing = analysis.validateAnalysis({ ...good, contested: '', points: [good.points[0]] }, input);
    expect(missing.hard.join(' ')).toMatch(/contested must be 60 to 900/);
    expect(missing.hard.join(' ')).toMatch(/Give 2 to 6 points/);
    const noQuotes = analysis.validateAnalysis({ ...good, quotes: [] }, input);
    expect(noQuotes.hard.join(' ')).toMatch(/Give two to five quotes/);
  });

  it('reads number words as wording and written figures as figures', () => {
    const input = analysis.analysisInput(topicOf('lending-design'), org);
    const good = answerFor(input);
    expect(analysis.validateAnalysis({ ...good, thesis: `Two forces pull against each other here, and three of the venues show it. ${good.thesis}` }, input).hard).toEqual([]);
    expect(analysis.validateAnalysis({ ...good, thesis: `Seven venues show it, 4,321 of them in a week. ${good.thesis}` }, input).hard.join(' ')).toMatch(/thesis uses figures/);
  });

  it('drops a weak quote, watch item or connection on its own and keeps the rest', () => {
    const input = analysis.analysisInput(topicOf('lending-design'), org);
    const good = answerFor(input);
    const checked = analysis.validateAnalysis({
      ...good,
      quotes: [...good.quotes, { claim: good.quotes[0].claim, text: 'An invented sentence that nobody in the passage ever said about lending.', speaker: 'Someone' }],
    }, input);
    expect(checked.hard).toEqual([]);
    expect(checked.analysis.quotes.length).toBe(good.quotes.length);
    expect(checked.dropped).toEqual(expect.arrayContaining([`quote from ${good.quotes[0].claim}`, 'a watch item', 'connection to not-a-topic']));
    expect(checked.analysis.watch).toEqual(['Whether more venues adopt isolated designs after the next stress event.']);
    expect(checked.analysis.connections.map((connection) => connection.topic).every((key) => input.others.some((other) => other.key === key))).toBe(true);
  });
});

describe('what an analysis is written from', () => {
  it('sends the topic, its claims with passages and notes, and the most related other topics', () => {
    const topic = topicOf('lending-design');
    const input = analysis.analysisInput(topic, org);
    expect(input.claims.map((claim) => claim.ref).sort()).toEqual([...topic.claims].sort());
    const prompt = analysis.analysisPrompt(input);
    expect(prompt.startsWith('TOPIC\n')).toBe(true);
    for (const heading of ['CLAIMS', 'PASSAGES', 'OTHER TOPICS']) expect(prompt).toContain(`\n\n${heading}\n`);
    expect(prompt).toContain('Research note headline for the lending topic');
    expect(input.others.map((other) => other.key)).not.toContain(topic.key);
    expect(input.others.length).toBeGreaterThan(0);
    expect(input.others.length).toBeLessThanOrEqual(analysis.ANALYSIS_LIMITS.others);
  });
});

describe('writing and storing a page', () => {
  it('writes a page on the crypto_analysis task, with room for a long reasoning call, and saves it', async () => {
    clearPages();
    state.calls = [];
    const { analysis: page, dropped } = await analysis.writeTopicAnalysis('lending-design', 'mark', instruction());
    expect(state.calls).toHaveLength(1);
    const { options } = state.calls[0];
    expect(options.task).toBe('crypto_analysis');
    expect(options.timeoutMs).toBe(900_000);
    expect(options.maxTokens).toBe(24_000);
    expect(options.instructions.join('\n')).toContain(analysis.DEFAULT_ANALYSIS_INSTRUCTION);
    expect(options.instructions.join('\n')).toMatch(/never add a fact, figure, name or date/);
    expect(dropped).toEqual(expect.arrayContaining(['a watch item', 'connection to not-a-topic']));
    const stored = analysis.storedAnalysis('lending-design')!;
    expect(stored).toEqual(page);
    expect(stored.claims).toEqual([...topicOf('lending-design').claims].sort());
    expect(stored.points[0].claims.length).toBeGreaterThan(0);
    expect(stored.quotes.length).toBeGreaterThan(0);
    expect(stored.connections.length).toBeGreaterThan(0);
    expect(stored.generated_by).toBe('mark');
    // Without an OpenAI key the page is written through Hermes, and says so.
    expect(stored.written_with).toEqual({ via: 'hermes', model: null, reasoning: null });
  });

  it('gives one corrected retry for an invented figure, then saves', async () => {
    state.calls = [];
    state.next = ['invented'];
    await analysis.writeTopicAnalysis('liquidity-venues', 'mark', instruction());
    expect(state.calls).toHaveLength(2);
    expect(state.calls[1].input).toMatch(/CORRECT THESE ISSUES\nthesis uses figures that are not in the evidence \(999\)/);
    expect(analysis.storedAnalysis('liquidity-venues')!.thesis).not.toContain('999');
  });

  it('saves nothing when no answer passes the checks', async () => {
    state.calls = [];
    state.next = ['garbage', 'unknown_id'];
    const error = await analysis.writeTopicAnalysis('custody-flows', 'mark', instruction()).catch((caught) => caught);
    expect(error).toBeInstanceOf(analysis.TopicAnalysisError);
    expect(error.code).toBe('unusable_answer');
    expect(state.calls).toHaveLength(2);
    expect(analysis.storedAnalysis('custody-flows')).toBeNull();
  });

  it('retries once when Hermes does not answer, then reports that Hermes did not answer', async () => {
    state.calls = [];
    state.next = ['silent'];
    await analysis.writeTopicAnalysis('custody-flows', 'mark', instruction());
    expect(state.calls).toHaveLength(2);
    state.next = ['silent', 'silent'];
    const error = await analysis.writeTopicAnalysis('stablecoin-niches', 'mark', instruction()).catch((caught) => caught);
    expect(error).toBeInstanceOf(organization.HermesUnavailableError);
    expect(analysis.storedAnalysis('stablecoin-niches')).toBeNull();
  });

  it('counts claims beyond the request limit as written from, so a large topic is not shown as out of date', async () => {
    const limit = analysis.ANALYSIS_LIMITS.claims;
    analysis.ANALYSIS_LIMITS.claims = 5;
    state.calls = [];
    try {
      await analysis.writeTopicAnalysis('lending-design', 'mark', instruction());
    } finally {
      analysis.ANALYSIS_LIMITS.claims = limit;
    }
    const sent = state.calls[0].input.split('\n\nPASSAGES')[0].split('\nCLAIMS\n')[1].split('\n').filter(Boolean);
    expect(sent).toHaveLength(5);
    const topic = topicOf('lending-design');
    expect(analysis.storedAnalysis(topic.key)!.claims).toEqual([...topic.claims].sort());
    expect(analysis.analysisView(topic, org, topic.claims)).toMatchObject({ new_claims: 0, out_of_date: false });
  });

  it('refuses topics that are gone or too small', async () => {
    await expect(analysis.writeTopicAnalysis('no-such-topic', 'mark', instruction())).rejects.toMatchObject({ code: 'not_found' });
    await expect(analysis.writeTopicAnalysis('lone-claim', 'mark', instruction())).rejects.toMatchObject({ code: 'too_few_claims' });
  });

  it('shows the page on the topic with its freshness, leaving out links and citations that no longer exist', () => {
    const topic = topicOf('lending-design');
    const page = analysis.storedAnalysis(topic.key)!;
    const linked = page.connections[0].topic;
    const shrunk = { ...org, topics: org.topics.filter((item) => item.key !== linked) };
    const live = topic.claims.slice(1);
    const view = analysis.analysisView(topic, shrunk, [...live, 'extra-event:0', 'extra-event:1'])!;
    expect(view.connections.map((connection) => connection.topic)).not.toContain(linked);
    expect(view.connections.every((connection) => connection.title && connection.category)).toBe(true);
    expect(view.points.flatMap((point) => point.claims)).not.toContain(topic.claims[0]);
    expect(view).toMatchObject({ new_claims: 2, removed_claims: 1, out_of_date: true });
    // The topic page carries the analysis.
    expect(tools.listTopics(undefined, topic.key).analysis).toMatchObject({ thesis: page.thesis, new_claims: 0, out_of_date: false });
  });
});

describe('when a page is due', () => {
  it('calls for a rewrite at two changed claims and a fifth of the topic', () => {
    const basis = Array.from({ length: 10 }, (_, index) => `e${index}:0`);
    expect(analysis.analysisChange(basis, [...basis, 'new:0']).outOfDate).toBe(false);
    expect(analysis.analysisChange(basis, [...basis, 'new:0', 'new:1']).outOfDate).toBe(true);
    expect(analysis.analysisChange(basis.slice(1), basis.slice(1)).outOfDate).toBe(false);
    // One new claim on a small topic is shown on the page but does not call for a rewrite.
    expect(analysis.analysisChange(['a:0', 'b:0', 'c:0'], ['a:0', 'b:0', 'c:0', 'd:0'])).toMatchObject({ added: ['d:0'], outOfDate: false });
    const large = Array.from({ length: 30 }, (_, index) => `e${index}:0`);
    expect(analysis.analysisChange(large, [...large, 'n:0', 'n:1', 'n:2', 'n:3', 'n:4']).outOfDate).toBe(false);
    expect(analysis.analysisChange(large, [...large.slice(3), 'n:0', 'n:1', 'n:2']).outOfDate).toBe(true);
  });

  it('lists topics without a current page, largest first, skipping topics with one claim', () => {
    const targets = analysis.analysisTargets(org);
    const written = ['lending-design', 'liquidity-venues', 'custody-flows'];
    expect(targets.map((target) => target.key)).toEqual(KEYS.slice(0, 8).filter((key) => !written.includes(key)));
    expect(analysis.analysisSummary(org)).toEqual({ topics: 8, written: 3, out_of_date: 0, missing: 5 });
  });
});

describe('writing pages in the background', () => {
  it('writes five samples, largest first, and lists them for reading', async () => {
    clearPages();
    jobs.queueTopicAnalysis('mark', 'sample');
    expect(jobs.topicAnalysisBusy()).toBe(true);
    // Filing waits while pages are being written, without calling Hermes.
    state.calls = [];
    expect(await filing.runTopicFiling()).toBeNull();
    expect(state.calls).toHaveLength(0);
    expect(await jobs.processTopicAnalysisJob()).toBe(true);
    const status = jobs.topicAnalysisStatus();
    expect(status).toMatchObject({ status: 'ready', mode: 'sample', written: 5, failures: [] });
    expect(status.stopped).toBeUndefined();
    expect(status.written_topics!.map((topic) => topic.key)).toEqual(KEYS.slice(0, 5));
    expect(status.pages).toEqual({ topics: 8, written: 5, out_of_date: 0, missing: 3 });
    expect(status.remaining).toBe(3);
    expect(status.next_sample.map((topic) => topic.key)).toEqual(KEYS.slice(5, 8));
    expect(jobs.topicAnalysisBusy()).toBe(false);
    const audit = database.one<any>("SELECT target, detail_json FROM audit_log WHERE action='topics.analysis' ORDER BY id DESC LIMIT 1")!;
    expect(audit.target).toBe('topics.analysis');
    expect(JSON.parse(audit.detail_json)).toMatchObject({ mode: 'sample', written: 5, failed: 0 });
  });

  it('lists a topic with no usable page and carries on with the rest', async () => {
    state.unusable = new Set(['exit-control']);
    jobs.queueTopicAnalysis('mark', 'all');
    expect(await jobs.processTopicAnalysisJob()).toBe(true);
    state.unusable = new Set();
    const status = jobs.topicAnalysisStatus();
    expect(status.written).toBe(2);
    expect(status.failures).toEqual([{ key: 'exit-control', title: topicOf('exit-control').title, reason: expect.stringMatching(/No answer passed the checks/) }]);
    expect(status.remaining).toBe(1);
  });

  it('stops after two topics in a row get no answer from Hermes, keeping what was written', async () => {
    // Make two more pages due: new claims on the two smallest written topics.
    const extra = organization.loadClaims().map((claim) => claim.ref).filter((ref) => !org.topics.some((topic) => topic.claims.includes(ref)));
    const grown = { ...org, topics: org.topics.map((topic) => topic.key === 'fee-markets' ? { ...topic, claims: [...topic.claims, ...extra.slice(0, 2)] }
      : topic.key === 'agent-wallets' ? { ...topic, claims: [...topic.claims, ...extra.slice(2, 4)] } : topic) };
    saveOrganization(grown);
    expect(analysis.analysisTargets(grown).map((target) => target.key)).toEqual(['fee-markets', 'agent-wallets', 'exit-control']);
    state.outage = true;
    state.calls = [];
    jobs.queueTopicAnalysis('mark', 'all');
    expect(await jobs.processTopicAnalysisJob()).toBe(true);
    state.outage = false;
    const status = jobs.topicAnalysisStatus();
    expect(status).toMatchObject({ status: 'ready', written: 0, stopped: true });
    expect(status.failures!.map((failure) => failure.key)).toEqual(['fee-markets', 'agent-wallets']);
    expect(status.failures![0].reason).toMatch(/credits/i);
    expect(state.calls).toHaveLength(4);
    expect(status.pages.written).toBe(7);
    saveOrganization(org);
  });

  it('rewrites one topic on request', async () => {
    const before = analysis.storedAnalysis('oracle-risk')!;
    jobs.queueTopicAnalysis('mark', 'one', 'oracle-risk');
    expect(await jobs.processTopicAnalysisJob()).toBe(true);
    expect(jobs.topicAnalysisStatus()).toMatchObject({ status: 'ready', mode: 'one', topic: 'oracle-risk', written: 1 });
    expect(analysis.storedAnalysis('oracle-risk')!.generated_at >= before.generated_at).toBe(true);
    jobs.queueTopicAnalysis('mark', 'one', 'no-such-topic');
    expect(await jobs.processTopicAnalysisJob()).toBe(false);
    expect(jobs.topicAnalysisStatus()).toMatchObject({ status: 'failed', error: 'That topic no longer exists.' });
  });

  it('writes several pages at once when the route allows it, naming every page in progress', async () => {
    clearPages();
    const saved = { ...jobs.ANALYSIS_CONCURRENCY };
    jobs.ANALYSIS_CONCURRENCY.hermes = 3;
    state.delayMs = 30;
    state.maxInFlight = 0;
    const seen: string[][] = [];
    const watch = setInterval(() => { const writing = jobs.topicAnalysisStatus().progress?.writing; if (writing?.length) seen.push(writing); }, 5);
    try {
      jobs.queueTopicAnalysis('mark', 'sample');
      expect(await jobs.processTopicAnalysisJob()).toBe(true);
    } finally {
      clearInterval(watch);
      Object.assign(jobs.ANALYSIS_CONCURRENCY, saved);
      state.delayMs = 0;
    }
    expect(state.maxInFlight).toBe(3);
    expect(seen.some((writing) => writing.length === 3)).toBe(true);
    const status = jobs.topicAnalysisStatus();
    expect(status).toMatchObject({ status: 'ready', written: 5 });
    expect(status.written_topics!.map((topic) => topic.key).sort()).toEqual(KEYS.slice(0, 5).sort());
  });

  it('waits for a filing run already talking to Hermes, and marks a run cut short by a restart', async () => {
    database.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('topics.analysis.job', ?)", JSON.stringify({ status: 'running', mode: 'all' }));
    let filingRuns = true;
    vi.useFakeTimers();
    try {
      jobs.startTopicAnalysisWorker({ hermesInUse: () => filingRuns });
    } finally {
      vi.useRealTimers();
    }
    expect(jobs.topicAnalysisStatus()).toMatchObject({ status: 'failed', error: expect.stringMatching(/interrupted by a dashboard restart/) });
    jobs.queueTopicAnalysis('mark', 'one', 'agent-wallets');
    expect(await jobs.processTopicAnalysisJob()).toBe(false);
    expect(jobs.topicAnalysisStatus().status).toBe('queued');
    filingRuns = false;
    expect(await jobs.processTopicAnalysisJob()).toBe(true);
    expect(jobs.topicAnalysisStatus().status).toBe('ready');
  });
});

/** The stand-in's good answer for a topic, built the same way from its input. */
function answerFor(input: import('../src/topic-analysis.js').AnalysisInput) {
  const ids = input.claims.map((claim) => claim.ref);
  const byEvent = new Map<string, string[]>();
  for (const claim of input.claims) byEvent.set(claim.event_id, [...(byEvent.get(claim.event_id) ?? []), claim.ref]);
  const quotes = [...byEvent].filter(([event]) => input.passages.get(event)).slice(0, 3)
    .map(([event, refs]) => ({ claim: refs[0], text: input.passages.get(event)!, speaker: null }));
  return {
    thesis: `${input.topic.title} because venues now compete on the design of their risk controls.`,
    points: [
      { text: 'The speakers tie the movement of capital to the design choices each venue makes.', claims: ids.slice(0, 2) },
      { text: 'Two sources describe the same shift from different angles, which makes it a pattern rather than an anecdote.', claims: ids.slice(1, 3) },
    ],
    counterpoints: [{ text: 'The evidence comes from speakers with a stake in the outcome, so it may overstate the shift.', claims: [ids[0]] }],
    quotes,
    meaning: 'Beneath the claims is a simple mechanism: design choices decide where capital is safe, and capital moves to where its risk is easiest to price and to contain.',
    why_it_matters: 'For investors, venue design becomes a leading indicator of flows. For builders, risk controls become a product feature that wins deposits from larger rivals.',
    contested: 'The claims do not show how large the shift is, or whether it lasts beyond the current cycle.',
    watch: ['Whether more venues adopt isolated designs after the next stress event.', 'A venue that grows 300% in a month.'],
    connections: [
      ...input.others.slice(0, 2).map((other) => ({ topic: other.key, relation: 'same_mechanism', text: `Both topics turn on the same design choice, seen here from the side of ${other.title.toLowerCase()}.` })),
      { topic: 'not-a-topic', relation: 'context', text: 'This link names a topic that does not exist and should be dropped.' },
    ],
  };
}
