import { describe, expect, it } from 'vitest';
import { buildAskContext } from '../src/ask-context.js';
import { cleanHermesError } from '../src/hermes-client.js';
import { authorizeAccessEmail } from '../src/request-auth.js';

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
  it('assembles bounded evidence from the existing crypto database', () => {
    const context = buildAskContext('What happened with Aave utilisation?');
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
