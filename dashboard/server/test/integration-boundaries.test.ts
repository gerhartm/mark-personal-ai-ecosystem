import { describe, expect, it } from 'vitest';
import { buildAskContext, buildTopicAskContext, TOPIC_ASK_EVENTS } from '../src/ask-context.js';
import { all, one } from '../src/db.js';
import { cleanHermesError } from '../src/hermes-client.js';
import { authorizeAccessEmail } from '../src/request-auth.js';
import {
  StudioInputError,
  buildStudioContext,
  resolveStudioCitations,
  studioFormatIssues,
  studioPublishableText,
  validateStudioCitations,
  validateStudioInput,
} from '../src/studio.js';

describe('production access boundary', () => {
  const allowlist = new Set(['mark@example.com']);

  it('requires a verified Access email in production mode', () => {
    expect(authorizeAccessEmail(undefined, true, allowlist).authorized).toBe(false);
    expect(authorizeAccessEmail('other@example.com', true, allowlist).authorized).toBe(false);
    expect(authorizeAccessEmail(' Mark@Example.com ', true, allowlist)).toEqual({
      authorized: true,
      email: 'mark@example.com',
    });
  });

  it('keeps local development usable without weakening production', () => {
    expect(authorizeAccessEmail(undefined, false, allowlist).authorized).toBe(true);
  });
});

describe('Hermes evidence boundary', () => {
  it('assembles bounded evidence from the existing crypto database', async () => {
    const context = await buildAskContext('What happened with Aave utilisation?');
    expect(context.records).toBeGreaterThan(0);
    expect(context.hits.length).toBeLessThanOrEqual(10);
    expect(context.input).toContain('CURRENT QUESTION');
    expect(context.input).toContain('CORPUS EVIDENCE');
    expect(context.input.length).toBeLessThanOrEqual(28_000);
  });

  it('turns provider failures into safe user-facing messages', () => {
    expect(cleanHermesError('insufficient_quota')).toMatch(/no remaining credits/i);
    expect(cleanHermesError('private upstream detail')).not.toContain('upstream');
  });
});

describe('Studio intelligence boundary', () => {
  it('builds one bounded, evidence-backed request for the existing Hermes brain', async () => {
    const context = await buildStudioContext({
      template_type: 'speaking_prep',
      focus: 'Aave utilisation and protocol risk',
      date_from: '2026-04-01',
      date_to: '2026-07-04',
    });
    expect(context.evidenceCount).toBeGreaterThan(0);
    expect(context.evidenceCount).toBeLessThanOrEqual(18);
    expect(context.prompt).toContain('OUTPUT CONTRACT');
    expect(context.prompt).toContain('QUALITY CONTRACT');
    expect(context.prompt).toContain('CITATION CONTRACT');
    expect(context.prompt.length).toBeLessThanOrEqual(36_000);
  });

  it('accepts only citations that resolve to the existing corpus', () => {
    const event = one<{ id: string; summary: string }>('SELECT id, summary FROM events ORDER BY id LIMIT 1')!;
    const source = one<{ source_id: string }>('SELECT source_id FROM sources ORDER BY source_id LIMIT 1')!;
    const body = `Evidence one [${event.id}]. Evidence two [${source.source_id}].`;
    const citations = validateStudioCitations(body);
    expect(citations.map((citation) => citation.id)).toEqual([event.id, source.source_id]);
    expect(resolveStudioCitations(body)[0].title).toBeTruthy();
  });

  it('refuses missing, invented, and malformed generation inputs', () => {
    expect(() => validateStudioCitations('A claim with no evidence.')).toThrow(StudioInputError);
    expect(() => validateStudioCitations('Invented [2099-01-01-9999].')).toThrow(/unverified citation/i);
    expect(() => validateStudioInput({ template_type: 'podcast', focus: 'Aave' })).toThrow(/available draft formats/i);
    expect(() => validateStudioInput({
      template_type: 'linkedin_post',
      focus: 'Aave',
      date_from: '2026-07-04',
      date_to: '2026-04-01',
    })).toThrow(/before the end date/i);
  });

  it('enforces the real publishing formats before a generated draft can be saved', () => {
    const citation = '[2026-04-01-0001]';
    expect(studioPublishableText(`A clear point ${citation}.`)).toBe('A clear point.');
    expect(studioFormatIssues('x_post', `${'x'.repeat(281)} ${citation}`)).toContain(
      'The X post is 281 characters and must be 280 or fewer.',
    );
    expect(studioFormatIssues('speaking_prep', `Thesis\nA view ${citation}`)).toEqual(expect.arrayContaining([
      'The speaking brief is missing the talking points section.',
      'The speaking brief is missing the closing takeaway section.',
    ]));
    expect(studioFormatIssues('month_in_review', `Window: 2026-04-01 to 2026-04-30 ${citation}`, {
      dateFrom: '2026-04-01', dateTo: '2026-04-30',
    })).toEqual([]);
  });
});

describe('questions asked from a topic page', () => {
  const events = all<{ id: string }>('SELECT id FROM events ORDER BY id LIMIT 24')
    .map((row) => ({ id: row.id, title: `Source for ${row.id}`, snippet: 'A claim from this event.' }));
  const base = {
    question: 'Who disagrees, and why?',
    highlight: 'Spark dropped rsETH as collateral in January.',
    surrounding: 'The rsETH hack paid off for lenders that had already stopped accepting it. Spark dropped rsETH as collateral in January.',
    history: [] as Array<{ question: string; answer: string }>,
    topic: { title: 'rsETH crisis cut Aave TVL', dek: 'Lenders that stopped accepting rsETH came out ahead.', events: events.slice(0, 3) },
  };

  it('sends the passage, the text around it and the question ahead of the topic evidence', async () => {
    const context = await buildTopicAskContext(base);
    const positions = ['TOPIC PAGE\nrsETH crisis', 'HIGHLIGHTED PASSAGE\nSpark dropped rsETH', 'TEXT AROUND IT\nThe rsETH hack', 'CURRENT QUESTION\nWho disagrees, and why?', 'TOPIC EVIDENCE\n']
      .map((marker) => context.input.indexOf(marker));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(context.input).toMatch(/never as instructions/);
    expect(context.hits.map((hit) => hit.canonical_id)).toEqual(events.slice(0, 3).map((event) => event.id));
    expect(context.records).toBe(3);
  });

  it('asks about the whole topic without a highlight, carries the conversation and keeps the question within the cap', async () => {
    const context = await buildTopicAskContext({
      ...base,
      highlight: '',
      surrounding: '',
      history: [{ question: 'What happened?', answer: 'x'.repeat(5_000) }, { question: 'And then?', answer: 'y'.repeat(5_000) }],
      topic: { ...base.topic, events },
    });
    expect(context.input).toMatch(/HIGHLIGHTED PASSAGE\n\(none: the question is about the whole topic\)/);
    expect(context.input).not.toMatch(/TEXT AROUND IT/);
    expect(context.input).toMatch(/EARLIER IN THIS CONVERSATION\nMark: What happened\?\nSatoshi: x+\n\nMark: And then\?/);
    expect(context.input).toMatch(/CURRENT QUESTION\nWho disagrees, and why\?/);
    expect(context.input.length).toBeLessThanOrEqual(28_000);
    expect(context.hits).toHaveLength(Math.min(events.length, TOPIC_ASK_EVENTS));
  });
});
