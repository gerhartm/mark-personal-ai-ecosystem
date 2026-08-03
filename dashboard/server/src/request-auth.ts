import type { FastifyRequest } from 'fastify';

const allowedEmails = new Set(
  (process.env.ACCESS_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const accessHeaderRequired =
  process.env.NODE_ENV === 'production' || process.env.REQUIRE_ACCESS_HEADER === 'true';

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
  const value = request.headers['cf-access-authenticated-user-email'];
  return authorizeAccessEmail(value);
}

export function requestActor(request: FastifyRequest) {
  return requestIdentity(request).email || 'unauthenticated';
}
