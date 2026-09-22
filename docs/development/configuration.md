# Configuration reference

[Documentation](../README.md) / [Development](README.md) / Configuration

Variables below describe application configuration, not a ready-to-use production environment. Whether a value is required depends on the feature and authentication mode. Secret values belong in approved private files, never in this document, Git, screenshots or issue reports.

| Variable | Meaning |
|---|---|
| `PORT`, `HOST` | listen address, defaults `127.0.0.1:5183` |
| `CRYPTO_DB` | path to the active database |
| `CRYPTO_MEDIA_ROOT` | private media archive root. Unset means media is unavailable, which the interface states explicitly |
| `HERMES_BASE_URL` | Hermes dashboard origin. Unset means Ask runs in its explicit degraded state |
| `HERMES_DASHBOARD_USERNAME` | Hermes dashboard service account name |
| `HERMES_DASHBOARD_PASSWORD_FILE` | mounted file containing the Hermes dashboard password |
| `INTELLIGENCE_AUTO_REFRESH_HOURS` | minimum interval between scheduled live intelligence reviews, defaults to `24` |
| `SOURCE_PROCESSING_ENABLED` | set to `false` to pause source extraction and bulk workers; enabled by default, extraction also requires Hermes |
| `OPENVIKING_BASE_URL` | private OpenViking service origin. Unset leaves Capture explicitly unavailable |
| `OPENVIKING_API_KEY_FILE` | read-only mounted file containing the tenant-scoped OpenViking key |
| `OPENVIKING_ACCOUNT_ID`, `OPENVIKING_USER_ID`, `OPENVIKING_AGENT_ID` | non-secret tenant identity used by the native resource API |
| `SATOSHI_DASHBOARD_SYNC_SECRET_FILE` | read-only file containing the private service credential used by Satoshi's post-ingestion registration helper |
| `AUTH_MODE` | set to `shared-password` for the custom production login |
| `AUTH_USERNAME`, `AUTH_ACTOR` | login name and canonical audit actor, both default to `mark` |
| `AUTH_PASSWORD_HASH_FILE` | read-only file containing the salted scrypt password verifier |
| `AUTH_SESSION_SECRET_FILE` | read-only file containing the session signing secret |
| `AUTH_COOKIE_SECURE` | secure by default; set to `false` only for isolated local HTTP acceptance |
| `TURNSTILE_SITE_KEY` | public Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY_FILE` | read-only file containing the Turnstile secret |
| `TURNSTILE_EXPECTED_HOSTNAME` | required production hostname check, `crypto.forkedbrain.fyi` |
| `TURNSTILE_EXPECTED_ACTION` | required production action check, `workspace_login` |
| `REQUIRE_ACCESS_HEADER` | require the verified Cloudflare Access email header outside production as well |
| `ACCESS_ALLOWED_EMAILS` | comma-separated exact allowlist for authenticated users |
| `CRYPTO_ACTOR` | note author for the local single-user build |


## Check the active configuration

Use the deployed environment and Compose contract for current values. Existing defaults and legacy Access-related variables do not mean the current dashboard uses the older email-allowlist login. The current dashboard uses shared-password authentication with server-verified Turnstile and a signed Secure HttpOnly session.

The dashboard does not receive a direct model-provider key. Hermes and OpenViking hold their configured provider access separately. Confirm the actual billing account before diagnosing credit exhaustion.

## What must stay private

Do not copy password files, service tokens, session-signing keys, provider keys, OpenViking encryption keys or raw `.env` contents into GitHub. Keep access delivery separate from repository transfer. Update only non-secret variable names and explanations here.
