import { afterEach, describe, expect, it } from 'vitest';
import {
  createPasswordRecord,
  issueSession,
  parseCookies,
  verifyPassword,
  verifySession,
  verifyTurnstile,
} from '../src/request-auth.js';

const originalSiteKey = process.env.TURNSTILE_SITE_KEY;
const originalSecret = process.env.TURNSTILE_SECRET_KEY;
const originalAction = process.env.TURNSTILE_EXPECTED_ACTION;

afterEach(() => {
  if (originalSiteKey == null) delete process.env.TURNSTILE_SITE_KEY;
  else process.env.TURNSTILE_SITE_KEY = originalSiteKey;
  if (originalSecret == null) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  if (originalAction == null) delete process.env.TURNSTILE_EXPECTED_ACTION;
  else process.env.TURNSTILE_EXPECTED_ACTION = originalAction;
});

describe('shared password authentication', () => {
  it('derives a salted verifier and never stores the password', async () => {
    const record = createPasswordRecord('private test password', Buffer.alloc(16, 7));
    expect(record).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(record).not.toContain('private test password');
    await expect(verifyPassword('private test password', record)).resolves.toBe(true);
    await expect(verifyPassword('incorrect', record)).resolves.toBe(false);
  });

  it('signs, expires, and rejects tampered sessions', () => {
    const secret = 'a'.repeat(64);
    const now = Date.parse('2026-09-05T08:00:00Z');
    const token = issueSession('mark', 'mark', secret, now, 60_000);
    expect(verifySession(token, secret, now + 30_000)).toMatchObject({ sub: 'mark', actor: 'mark' });
    expect(verifySession(`${token}x`, secret, now + 30_000)).toBeNull();
    expect(verifySession(token, secret, now + 60_001)).toBeNull();
    expect(verifySession(token, 'b'.repeat(64), now + 30_000)).toBeNull();
  });

  it('parses encoded cookie values without trusting malformed input', () => {
    const cookies = parseCookies('theme=light; crypto_session=a%2Eb; broken=%E0%A4%A');
    expect(cookies.get('theme')).toBe('light');
    expect(cookies.get('crypto_session')).toBe('a.b');
    expect(cookies.get('broken')).toBe('%E0%A4%A');
  });
});

describe('Turnstile verification', () => {
  it('accepts a verified token and sends the remote address to Siteverify', async () => {
    process.env.TURNSTILE_SITE_KEY = 'site-key';
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    let submitted = '';
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      submitted = String(init?.body ?? '');
      return new Response(JSON.stringify({ success: true, action: 'workspace_login', hostname: 'crypto.forkedbrain.fyi' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    await expect(verifyTurnstile('verified-token', '203.0.113.7', fetcher)).resolves.toBe(true);
    expect(submitted).toContain('secret=secret-key');
    expect(submitted).toContain('response=verified-token');
    expect(submitted).toContain('remoteip=203.0.113.7');
    expect(submitted).toContain('idempotency_key=');
  });

  it('fails closed when configured verification is missing or rejected', async () => {
    process.env.TURNSTILE_SITE_KEY = 'site-key';
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    await expect(verifyTurnstile('', '')).resolves.toBe(false);
    const fetcher = (async () => new Response(JSON.stringify({ success: false, action: 'workspace_login' }), { status: 200 })) as typeof fetch;
    await expect(verifyTurnstile('rejected-token', '', fetcher)).resolves.toBe(false);
  });

  it('rejects a successful token minted for the wrong action', async () => {
    process.env.TURNSTILE_SITE_KEY = 'site-key';
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    process.env.TURNSTILE_EXPECTED_ACTION = 'workspace_login';
    const fetcher = (async () => new Response(JSON.stringify({ success: true, action: 'another_action' }), { status: 200 })) as typeof fetch;
    await expect(verifyTurnstile('wrong-action-token', '', fetcher)).resolves.toBe(false);
  });
});
