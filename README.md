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

ForkedBrain release `20260811T132229Z` and Crypto Intelligence release `20260811T132229Z` are live at `https://forkedbrain.fyi/` and `https://crypto.forkedbrain.fyi/` behind the same exact-email Cloudflare Access boundary. ForkedBrain routes its active Crypto branch to the current Crypto Intelligence application, and both the Memory Graph logo and Back control return to the main brain overview. The Crypto Intelligence logo returns to its own dashboard home. The hardened loopback-only dashboard now uses the verified 66-event, 49-source, and 89-media corpus, streams private media, and sends bounded canonical evidence to the existing Hermes central brain. The Brief is a daily command center with a sourced live market review, attention items, changes, watchlists, suggested actions, stored signals, and direct routes into Ask, Quiz, Content Studio, Speaking Preparation, and Library. Content Studio offers Mark and Creator Reference writing lenses while preserving the same verified evidence and citations. Native Hermes skills provide Crypto context, Creator Reference context, routing, and a restrained final writing pass without adding another agent, database, model, or memory service. Dashboard Capture and completed Satoshi Crypto ingestions both use OpenViking's native resource path and the same deterministic identity, duplicate prevention, receipt, audit, search, and Library registration contract. Hermes natively uses OpenAI API `gpt-5.6-sol` with high reasoning; no model key or parallel memory/reasoning layer exists in the dashboard.

The separate semantic-memory import is complete: native OpenViking contains all 131 source/artifact packets and 66 event packets, for 197 deterministic identities. An independent replay skipped all 197 with zero creates or failures, representative deep reads preserved provenance, and production Crypto Ask returned four canonical citations that all resolved. OpenViking is healthy with an idle zero-error queue. The checksum-verified post-import backup also passed a disposable restore test. See [`docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md`](docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md) for the acceptance record and recovery point.

## Documentation entry points

- [`docs/OPTION-1-SYSTEM-HANDBOOK.md`](docs/OPTION-1-SYSTEM-HANDBOOK.md) — authoritative client-safe system, workflow, security, recovery, and remaining-work handbook.
- [`docs/architecture/SYSTEM-ARCHITECTURE.md`](docs/architecture/SYSTEM-ARCHITECTURE.md) — technical components, data contracts, request paths, failure behavior, and expansion rules.
- [`docs/operations/USER-GUIDE.md`](docs/operations/USER-GUIDE.md) — step-by-step guide for Mark and approved staff.
- [`docs/acceptance/CURRENT-STATUS-AND-ACCEPTANCE.md`](docs/acceptance/CURRENT-STATUS-AND-ACCEPTANCE.md) — verified capability matrix and Option 1 closeout checklist.

The Satoshi synchronization gap is closed. After a Crypto source finishes native
OpenViking ingestion, Satoshi submits only its safe metadata and OpenViking URI
to a durable FIFO registration queue. The dashboard reads the complete retained
content from OpenViking, applies the existing canonical identity and duplicate
rules, and makes the source available to Library, full-text search, and bounded
ForkedBrain graph search. Replays return the original canonical record.
