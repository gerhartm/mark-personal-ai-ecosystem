import type { FastifyRequest } from 'fastify';
import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const deriveKey = (password: string, salt: Buffer, length: number, options: {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, length, options, (error, derivedKey) => {
    if (error) reject(error);
    else resolve(Buffer.from(derivedKey));
  });
});

const allowedEmails = new Set(
  (process.env.ACCESS_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const accessHeaderRequired =
  process.env.NODE_ENV === 'production' || process.env.REQUIRE_ACCESS_HEADER === 'true';

export const authMode = process.env.AUTH_MODE === 'shared-password'
  ? 'shared-password'
  : accessHeaderRequired
    ? 'access-header'
    : 'development';

export const sessionCookieName = 'crypto_session';

const textSecret = (valueName: string, fileName: string) => {
  const direct = process.env[valueName]?.trim();
  if (direct) return direct;
  const file = process.env[fileName]?.trim();
  if (!file) return '';
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
};

const sessionSecret = () => textSecret('AUTH_SESSION_SECRET', 'AUTH_SESSION_SECRET_FILE');
const passwordRecord = () => textSecret('AUTH_PASSWORD_HASH', 'AUTH_PASSWORD_HASH_FILE');

const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');
const sign = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('base64url');

export type SessionPayload = {
  v: 1;
  sub: string;
  actor: string;
  iat: number;
  exp: number;
  nonce: string;
};

export function createPasswordRecord(password: string, salt = randomBytes(16)) {
  if (!password) throw new Error('A password is required.');
  const key = scryptSync(password, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, record = passwordRecord()) {
  const parts = record.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nText, rText, pText, saltText, hashText] = parts;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;
  if (N < 16384 || N > 131072 || r < 8 || r > 32 || p < 1 || p > 4) return false;
  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    if (salt.length < 16 || expected.length !== 32) return false;
    const actual = await deriveKey(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * 1024 * 1024,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function issueSession(
  username: string,
  actor: string,
  secret = sessionSecret(),
  now = Date.now(),
  durationMs = 12 * 60 * 60 * 1000,
) {
  if (secret.length < 32) throw new Error('The session signing secret is not configured.');
  const payload: SessionPayload = {
    v: 1,
    sub: username,
    actor,
    iat: now,
    exp: now + durationMs,
    nonce: randomBytes(16).toString('base64url'),
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifySession(token: string, secret = sessionSecret(), now = Date.now()) {
  if (!token || secret.length < 32) return null;
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = Buffer.from(sign(encoded, secret));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(decode(encoded)) as SessionPayload;
    if (
      payload.v !== 1
      || typeof payload.sub !== 'string'
      || typeof payload.actor !== 'string'
      || typeof payload.iat !== 'number'
      || typeof payload.exp !== 'number'
      || typeof payload.nonce !== 'string'
      || payload.exp <= now
      || payload.iat > now + 60_000
      || payload.exp - payload.iat > 24 * 60 * 60 * 1000
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(value: string | undefined) {
  const cookies = new Map<string, string>();
  for (const pair of (value ?? '').split(';')) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const raw = pair.slice(index + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(raw));
    } catch {
      cookies.set(name, raw);
    }
  }
  return cookies;
}

export function sessionFromRequest(request: FastifyRequest) {
  const token = parseCookies(request.headers.cookie).get(sessionCookieName) ?? '';
  return verifySession(token);
}

export function authorizeAccessEmail(
  value: string | string[] | undefined,
  required = accessHeaderRequired,
  allowlist = allowedEmails,
) {
  if (!required) {
    return { authorized: true, email: process.env.CRYPTO_ACTOR ?? 'local-operator' };
  }
  const email = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase() ?? '';
  if (!email) return { authorized: false, email: '' };
  if (allowlist.size > 0 && !allowlist.has(email)) return { authorized: false, email };
  return { authorized: true, email };
}

export function requestIdentity(request: FastifyRequest) {
  if (authMode === 'shared-password') {
    const session = sessionFromRequest(request);
    return { authorized: Boolean(session), email: session?.actor ?? '' };
  }
  const value = request.headers['cf-access-authenticated-user-email'];
  return authorizeAccessEmail(value);
}

export function requestActor(request: FastifyRequest) {
  return requestIdentity(request).email || 'unauthenticated';
}

export function sharedAuthConfigurationValid() {
  return authMode !== 'shared-password'
    || (passwordRecord().startsWith('scrypt$') && sessionSecret().length >= 32);
}

export function authUsername() {
  return (process.env.AUTH_USERNAME ?? 'mark').trim().toLowerCase();
}

export function authActor() {
  return (process.env.AUTH_ACTOR ?? 'mark').trim() || 'mark';
}

export function turnstileSiteKey() {
  return (process.env.TURNSTILE_SITE_KEY ?? '').trim();
}

export function turnstileConfigured() {
  return Boolean(turnstileSiteKey() && textSecret('TURNSTILE_SECRET_KEY', 'TURNSTILE_SECRET_KEY_FILE'));
}

export async function verifyTurnstile(token: string, remoteIp = '', fetcher: typeof fetch = fetch) {
  const secret = textSecret('TURNSTILE_SECRET_KEY', 'TURNSTILE_SECRET_KEY_FILE');
  if (!turnstileSiteKey() && !secret) return true;
  if (!turnstileSiteKey() || !secret || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    body.set('idempotency_key', randomUUID());
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean; action?: string; hostname?: string };
    const expectedHostname = (process.env.TURNSTILE_EXPECTED_HOSTNAME ?? '').trim().toLowerCase();
    const expectedAction = (process.env.TURNSTILE_EXPECTED_ACTION ?? '').trim();
    if (result.success !== true) return false;
    if (expectedAction && result.action !== expectedAction) return false;
    if (expectedHostname && result.hostname?.toLowerCase() !== expectedHostname) return false;
    return true;
  } catch {
    return false;
  }
}
