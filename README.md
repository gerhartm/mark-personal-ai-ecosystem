# Personal AI Ecosystem V2 Workspace

This is the active engineering workspace for Mark's V2 system.

## Structure

- `docs/architecture/` — accepted system diagrams and technical design.
- `docs/decisions/` — architecture and product decision records.
- `docs/infrastructure/` — authoritative server build log, operations ledger, runbook, and redacted credential register.
- `docs/migration/` — folder migration records, checksums, and old-to-new data migration plans.
- `docs/security/` — redacted security and credential inventories safe for normal project use.
- `tools/audit/` — read-only credential and system audit utilities.
- `tools/documents/` — reproducible document builders.
- `src/` — V2 application and integration source code.
- `tests/` — automated verification and acceptance tests.
- `.work/` — disposable generated assets; never authoritative.

The private raw credentials and old-VPS payload are one level above under `.secrets/`.

## Current checkpoint

Crypto Intelligence release `20260804T071121Z` is live at `https://crypto.forkedbrain.fyi/` behind the same exact-email Cloudflare Access boundary as the private ForkedBrain command center. The hardened loopback-only dashboard uses the verified 66-event, 47-source, and 89-media corpus, streams private media, and sends bounded canonical evidence to the existing Hermes central brain for answers. Its authenticated Capture screen now accepts a URL or pasted text through OpenViking's native resource path, adding only deterministic identity, duplicate prevention, receipts, and local registration after native acceptance. Hermes natively uses Anthropic `claude-sonnet-5`; no model key or parallel memory/reasoning layer exists in the dashboard.

The separate 197-record semantic-memory import remains resume-ready and is not required for the live structured dashboard. OpenViking is healthy, but its configured OpenAI embedding project still has no credits. The Capture workflow therefore fails safely before local registration, and the disposable acceptance resources were removed. No partial client import or synthetic source is live. See [`docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md`](docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md) for the funded-provider verification and independent resume sequence.
