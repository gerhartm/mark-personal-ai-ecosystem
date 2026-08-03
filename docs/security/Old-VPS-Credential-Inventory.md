# Old VPS Credential Inventory

**Server:** Crypto-Intel (existing VPS)  
**Audit date:** July 30, 2026  
**Method:** Read-only inspection and provider validation

> This inventory is intentionally redacted. It records where each credential is stored, whether it is currently valid, and how it should be handled during migration. No API key, token, cookie, password, secret value, or reproducible fingerprint is included.

## 1. Reuse for Crypto Intelligence V2

| Credential | Current status | Used by | Current source | Migration action |
|---|---|---|---|---|
| OpenAI API key | Valid (provider returned HTTP 200) | OpenClaw instances, dashboards, Codex CLI | `/root/.openclaw/openclaw.json` | Transfer directly into the new secret store and validate |
| Anthropic API key | Valid (provider returned HTTP 200) | OpenClaw model fallback/provider | `/root/.openclaw/agents/main/agent/auth-profiles.json` | Transfer directly into the new secret store and validate |
| Venice API key | Valid (provider returned HTTP 200) | Crypto and Content model access | `/root/.openclaw/agents/main/agent/auth-profiles.json` | Transfer directly into the new secret store and validate |
| Crypto Telegram bot token | Valid as `@marks_intel_bot` | Crypto ingestion and chat interface | `/root/.openclaw/openclaw.json` | Transfer at cutover; do not run polling on both servers simultaneously |
| X/Twitter API key | Valid as `@i0xmark` | Tweet retrieval | `/root/crypto-intel/config/twitter-creds.env` | Transfer as part of the complete X credential bundle |
| X/Twitter API secret | Valid as `@i0xmark` | Tweet retrieval | `/root/crypto-intel/config/twitter-creds.env` | Transfer as part of the complete X credential bundle |
| X/Twitter access token | Valid as `@i0xmark` | Tweet retrieval | `/root/crypto-intel/config/twitter-creds.env` | Transfer as part of the complete X credential bundle |
| X/Twitter access secret | Valid as `@i0xmark` | Tweet retrieval | `/root/crypto-intel/config/twitter-creds.env` | Transfer as part of the complete X credential bundle |

The Codex CLI currently references the same OpenAI API key already listed above. It is not a separate credential.

## 2. Preserve for Later Modules

These credentials are active, but they are not required for the initial Crypto Intelligence V2 launch.

| Credential | Current status | Intended module | Current source | Migration action |
|---|---|---|---|---|
| Content Telegram bot token | Valid as `@ai_content_intel_bot` | Content/Sable | `/root/.openclaw-content-intel/openclaw.json` | Leave on the old VPS and preserve for a later phase |
| Sapphire Telegram bot token | Valid as `@sapphire_mediabot` | Sapphire Media | `/root/.openclaw-sapphire-media/openclaw.json` | Leave on the old VPS and preserve for a later phase |
| Sapphire alternate Venice key | Present; not required for Crypto V2 | Sapphire Media | `/root/.openclaw-sapphire-media/agents/main/agent/auth-profiles.json` | Do not migrate during Option 1 |

## 3. Recreate Instead of Copying

These are machine-specific or internal security credentials. Copying them would carry old trust relationships into the clean deployment.

| Credential group | Instances found | Migration action |
|---|---:|---|
| OpenClaw gateway tokens | Crypto, Content, Sapphire | Generate new Hermes/service secrets |
| Device/operator tokens | Crypto and Content | Generate new device identities if required |
| Execution approval/socket tokens | Crypto, Content, Sapphire | Generate new tokens on the new VPS |
| Coolify application secrets | Not applicable on old VPS | Generate during the new deployment |
| Database credentials | New V2 services | Generate during the new deployment |

## 4. Reauthenticate Instead of Copying

| Credential | Current status | Current source | Migration action |
|---|---|---|---|
| Claude OAuth access token | Present | `/root/.claude/.credentials.json` | Do not copy; authenticate again if Claude subscription access is selected |
| Claude OAuth refresh token | Present | `/root/.claude/.credentials.json` | Do not copy; authenticate again if Claude subscription access is selected |
| Codex provider configuration/session value | Present | `/root/.openclaw/agents/main/agent/models.json` | Do not treat as a portable API key; authenticate Hermes/Codex cleanly |

## 5. Cloudflare

The current `crypto-intel` Cloudflare tunnel exists and is active with four connections. Its credential is stored under `/root/.cloudflared/`.

For V2, either:

1. Create a new tunnel and switch DNS after acceptance, or
2. Transfer the existing tunnel only during a controlled cutover.

A new tunnel is safer because it keeps the old VPS available as an untouched fallback until V2 has been verified.

## 6. Browser Session Credentials

Cookie/session files were found for Instagram, YouTube, and X across the Crypto, Content, and Sapphire directories. These are credentials, but they are not API keys.

They should not be copied by default because they may be expired, tied to the old server/IP, or responsible for historical ingestion failures. Create fresh authenticated sessions only for the sources required by Crypto Intelligence V2.

## 7. Stale and Historical Credentials

Older credential versions exist in backups and shell history. They are not part of the active migration set and must not be copied to V2.

After V2 is accepted and stable:

1. Rotate the reusable third-party credentials where practical.
2. Revoke superseded Telegram/session credentials if no longer needed.
3. Remove exposed historical credentials from shell history and retained backups through a separately approved cleanup.
4. Retire the old VPS only after the required data and credentials have been verified.

## Secure Transfer Procedure

1. Create the new client-owned VPS and Coolify project.
2. Generate fresh internal, database, and service credentials on the new VPS.
3. Transfer only the approved third-party credentials directly from the old VPS into protected Coolify secrets or root-owned environment files.
4. Validate each provider without printing its secret.
5. Switch the Crypto Telegram bot only when the V2 service is ready.
6. Verify ingestion, retrieval, generation, and backups.
7. Rotate reusable credentials and retire the old VPS after acceptance.

