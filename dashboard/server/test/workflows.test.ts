import { describe, expect, it } from 'vitest';
import { creatorIssues, parseHermesJson, prepIssues } from '../src/workflows.js';

const evidence = [{
  id: 'event-1',
  kind: 'event' as const,
  summary: 'Aave governance changed the borrowing cap after utilization reached its operating limit.',
  source_channel: 'Protocol Research',
}];

const citation = {
  id: 'event-1',
  quote: 'utilization reached its operating limit',
  inference: 'This supports the claim that utilization pressure preceded the governance change.',
};

const validPoint = {
  title: 'Utilization pressure forced a governance response',
  body: 'The stored evidence links the borrowing cap change to a concrete operating constraint, which makes the causal sequence clear.',
  detail: ['Utilization reached its limit before governance changed the cap, so the sequence is supported by the retained source.'],
  counter: 'The source does not establish whether the change permanently fixed the underlying market imbalance.',
  citations: [citation],
};

describe('structured workflow validation', () => {
  it('extracts JSON without exposing code-fence formatting', () => {
    expect(parseHermesJson<{ ok: boolean }>('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('accepts a readable and fully sourced preparation brief', () => {
    const raw = {
      overview: 'Aave changed a borrowing cap after utilization reached its operating limit. The evidence supports the sequence while leaving the long-term effect uncertain.',
      suggested_tangents: ['liquidity risk', 'governance response'],
      points: [validPoint, { ...validPoint, title: 'The operating limit is the useful anchor' }, { ...validPoint, title: 'The long-term outcome remains unresolved' }],
    };
    expect(prepIssues(raw, evidence, 3)).toEqual([]);
  });

  it('rejects raw Markdown, invented sources, and fabricated quotations', () => {
    const raw = {
      overview: '**Aave changed a cap.** This deliberately padded sentence is long enough to reach the minimum but still contains raw formatting markers.',
      suggested_tangents: ['one', 'two'],
      points: [{
        ...validPoint,
        body: '## Unsupported heading followed by a claim that is long enough to pass the ordinary readability length check.',
        citations: [{ id: 'invented', quote: 'words that never appeared', inference: 'This pretends to support a claim.' }],
      }],
    };
    expect(prepIssues(raw, evidence, 1).join(' ')).toMatch(/Markdown|unknown evidence ID/);
  });

  it('enforces real tweet shape, exact count, length, and evidence', () => {
    const tweet = 'Fee compression is not an execution story. It is a distribution story because the venue that owns users can keep margins after the wrapper commoditizes.';
    const valid = { outputs: [1, 2, 3].map((index) => ({ text: `${tweet} ${index}`, angle: `Angle ${index}`, citations: [citation] })) };
    expect(creatorIssues(valid, evidence, { format: 'tweet', length: 'medium', count: 3 })).toEqual([]);

    const invalid = { outputs: [{ text: '## Thread\n- Point one #crypto 🚀', angle: 'Noise', citations: [citation] }] };
    expect(creatorIssues(invalid, evidence, { format: 'tweet', length: 'medium', count: 3 }).join(' ')).toMatch(/exactly 3|real tweet|hashtag|emoji/);

    const leakedCitation = { outputs: [{ text: `${tweet} [event-1]`, angle: 'Leaked citation', citations: [citation] }] };
    expect(creatorIssues(leakedCitation, evidence, { format: 'tweet', length: 'medium', count: 1 }).join(' ')).toMatch(/internal evidence IDs/);
  });
});
