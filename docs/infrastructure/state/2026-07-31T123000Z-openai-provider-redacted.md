# OpenAI Provider — Redacted State Snapshot

**Captured:** 2026-07-31 12:30 UTC  
**Secret content:** none

## Provider state

- Hermes provider: `openai-api`
- Credential-pool entries: one
- Credential label: `mark-openai-api`
- Auth store: `/opt/data/auth.json`, mode `0600`, Hermes service user
- Default model: `gpt-5.6-sol`
- Base URL: `https://api.openai.com/v1`
- Pre-change config backup: `/opt/data/config.yaml.pre-openai-api-20260731T1225Z`
- `openai-codex` OAuth: cancelled before authorization; logged out

## Acceptance evidence

- Canonical key copies matched without printing the value.
- OpenAI model discovery: HTTP 200.
- GPT-5.6 Sol, Terra, and Luna: listed.
- Hermes inference: one call, exact expected response.
- Usage: 14,414 input tokens and 12 output tokens.
- Container restart: provider, model, credential, permissions, dashboard, and gateway persisted.
- Dashboard: server loopback only at `127.0.0.1:9119`.
- API `8642`: closed.
- Host failed units: zero.

## Security and follow-up

- Raw key is absent from this snapshot, Compose, ordinary environment variables, documentation, logs, and Obsidian.
- Hermes' native auth file is permission-protected, not encrypted at rest; off-server backups must be encrypted.
- Rotate the migrated legacy-origin key before production cutover.
- Do not use the Sol/full-context path indiscriminately for high-volume background work; measure Terra/Luna or a lean ingestion profile later.
- Next component: separate internal OpenViking service through Hermes' native memory-provider path.
