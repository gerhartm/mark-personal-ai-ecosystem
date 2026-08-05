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

ForkedBrain and Crypto Intelligence release `20260805T152846Z` are live at `https://forkedbrain.fyi/` and `https://crypto.forkedbrain.fyi/` behind the same exact-email Cloudflare Access boundary. ForkedBrain routes its active Crypto branch to the current Crypto Intelligence application, and both the Memory Graph logo and Back control return to the main brain overview. The Crypto Intelligence logo returns to its own dashboard home. The hardened loopback-only dashboard uses the verified 66-event, 47-source, and 89-media corpus, streams private media, and sends bounded canonical evidence to the existing Hermes central brain. The Brief is now a daily command center with a sourced live market review, attention items, changes, watchlists, suggested actions, stored signals, and direct routes into Ask, Quiz, X and LinkedIn creation, review briefs, Speaking Preparation, and Library. Its authenticated Capture screen accepts a URL or pasted text through OpenViking's native resource path, adding only deterministic identity, duplicate prevention, receipts, and local registration after native acceptance. Hermes natively uses Anthropic `claude-sonnet-5`; no model key or parallel memory/reasoning layer exists in the dashboard.

The separate semantic-memory import is complete: native OpenViking contains all 131 source/artifact packets and 66 event packets, for 197 deterministic identities. An independent replay skipped all 197 with zero creates or failures, representative deep reads preserved provenance, and production Crypto Ask returned four canonical citations that all resolved. OpenViking is healthy with an idle zero-error queue. The checksum-verified post-import backup also passed a disposable restore test. See [`docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md`](docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md) for the acceptance record and recovery point.
