import { describe, expect, it } from 'vitest';
import { buildAskContext } from '../src/ask-context.js';
import { one } from '../src/db.js';
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
