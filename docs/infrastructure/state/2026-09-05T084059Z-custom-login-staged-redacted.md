# Crypto Intelligence custom login and Turnstile staging

Date: 2026-09-05

Release: `20260905T084059Z`

Status: application accepted in production, public Access removal pending real Turnstile credentials

## Scope

This release adds a purpose-built Crypto Intelligence login without changing Mark's five approved dashboard screens or the separate Control Center utility. The login uses the same light editorial system, typography, spacing, restrained green accent, and responsive behavior as the approved interface. A matching workspace-opening transition bridges successful authentication into Topics.

## Authentication contract

- Shared username and password are verified by the application.
- The stored password is a salted scrypt verifier. Plaintext credentials are not stored in the repository, image, environment, or documentation.
- Successful login issues a signed, nonce-bearing session that expires after 12 hours.
- The browser receives only an HttpOnly, Secure, SameSite Lax cookie.
- Every private API rejects an anonymous request with HTTP `401`.
- Five failed attempts within ten minutes block the source for 15 minutes.
- Login, logout, reload persistence, expiry, tamper rejection, and incorrect-password repair behavior are covered by automated tests.

## CAPTCHA contract

Cloudflare Turnstile is integrated on the login screen and verified server-side through Siteverify. The application sends a fresh idempotency key with every validation request and can enforce both the expected hostname and the `workspace_login` action when real production keys are installed. The Content Security Policy permits only the required Cloudflare challenge resources.

The production container currently holds Cloudflare's official always-pass test widget credentials so the complete flow can be tested while the existing Cloudflare Access policy remains in front. This is not an accepted public CAPTCHA configuration. Do not remove Cloudflare Access until a real widget for `crypto.forkedbrain.fyi` is created, its site key and secret are installed, and the hostname and action checks are enabled.

## Browser and automated acceptance

- Server tests: 104 of 104 passed across 12 files.
- Server type check and production build: passed.
- Web type check and production build: passed.
- Production dependency audits: zero vulnerabilities.
- Custom login acceptance: 22 of 22 passed in canary and production, including after the final production restart.
- Full dashboard browser acceptance: 89 of 89 passed in canary and production.
- First-party browser request failures: 0.
- Browser console errors: 0.

The login suite covered the visual hierarchy, persistent labels, Turnstile surface, wrong credentials, successful login, workspace transition, Secure and HttpOnly session cookie, SameSite behavior, reload persistence, logout, desktop layout, 390-pixel mobile layout, touch targets, reduced motion, network behavior, and console behavior.

The dashboard suite covered Topics, topic filtering and detail, historical Timeline controls, clickable category bands, evidence dossiers, Prep generation and citations, both creator workflows, revisions, Control Center, dark mode, Markdown rendering, source evidence, live Telegram counts, desktop, and mobile.

## Production and recovery

- Active image: `mark-crypto-dashboard:20260905T084059Z`
- Application origin: `127.0.0.1:9330`
- Authentication gateway: `127.0.0.1:9331`
- Immediate rollback: `crypto-dashboard-rollback-20260905T072131Z`
- Database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260905T084059Z/crypto-intelligence.db`
- Operator backup: `/srv/mark-v2/operator-backups/20260905T084059Z-crypto-custom-login-pre`

After restart, the database checksum was unchanged, SQLite quick check returned `ok`, foreign-key check returned no rows, and production retained 54 sources, 66 events, and 89 media assets. Both the dashboard and local gateway were available, and the dashboard reported zero restarts.

Public `crypto.forkedbrain.fyi` still redirects to the existing Cloudflare Access application. `manage.forkedbrain.fyi`, `manage-realtime.forkedbrain.fyi`, `brain.forkedbrain.fyi`, `forkedbrain.fyi`, and `intel.forkedbrain.fyi` retained their prior behavior. No DNS record, tunnel, Hermes configuration, OpenViking service, Satoshi service, ForkedBrain application, or legacy Intel application was changed by this release.

## Remaining guarded cutover

The repository contains a guarded operator script that removes only `crypto.forkedbrain.fyi` from the existing multi-host Access application. It validates the exact application and policy before mutation, preserves the other protected hostnames, checks the new Crypto login and every unaffected endpoint, and restores the prior Access state automatically if acceptance fails.

The public cutover requires a short-lived Cloudflare API token with the minimum permissions needed to create or manage the Turnstile widget and update Access applications and policies. Install the real widget first, verify login through public HTTPS, then run the guarded Access mutation. Revoke the token immediately after acceptance.

No credential, password, API token, session token, client content, or private source text is recorded in this state file.
