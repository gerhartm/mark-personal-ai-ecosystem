# Crypto custom login cutover

Date: 2026-09-05
Release: `20260905T095230Z`
Status: accepted

## Public boundary

- `https://crypto.forkedbrain.fyi/` serves the Crypto Intelligence custom login directly with HTTP `200`.
- Anonymous private API requests return HTTP `401`.
- Cloudflare Access no longer includes the Crypto hostname.
- The same Access application still protects the ForkedBrain root, management, and realtime management hostnames.
- The Access policy and its current approved members were not changed.

## Authentication

- Shared password verification uses the existing salted scrypt verifier.
- Sessions remain signed, HttpOnly, Secure, SameSite Lax, and limited to 12 hours.
- Cloudflare Turnstile uses a real managed widget restricted to `crypto.forkedbrain.fyi`.
- Server verification requires the exact hostname and action `workspace_login`.
- Invalid or missing Turnstile responses fail closed before credential verification.
- No password, Turnstile secret, Cloudflare API token, or signed session is present in this file or in Git.

## Verification

- Server tests: 104 of 104 passed.
- Server and web type checks: passed.
- Server and web production builds: passed.
- Isolated release canary: passed with zero paid model calls.
- Public browser acceptance: 89 of 89 passed.
- Browser network failures: zero.
- Browser console errors: zero.
- Public login: HTTP `200`.
- Anonymous private API: HTTP `401`.
- Other Access-protected hostnames: HTTP `302` to Access.
- Legacy Intel: HTTP `200`.
- Production data: 66 events, 54 sources, and 89 media assets.
- Telegram synchronization: 7 received, 7 synced, 0 processing, and 0 failed.

## Runtime and recovery

- Active image: `mark-crypto-dashboard:20260905T095230Z`.
- Application origin: `127.0.0.1:9330`.
- Authentication gateway: `127.0.0.1:9331`.
- Immediate rollback: `crypto-dashboard-rollback-20260905T084059Z`.
- Database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260905T095230Z/crypto-intelligence.db`.
- Pre-Turnstile runtime backup: `/srv/mark-v2/operator-backups/20260905T093346Z-real-turnstile-pre`.

The temporary Cloudflare API token was removed from local process memory and temporary files. It must now be revoked in Cloudflare because the production runtime does not require it.
