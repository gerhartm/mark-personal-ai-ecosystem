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

The complete legacy Crypto structured/media handoff is prepared and verified on the V2 VPS. Claude Code owns the dashboard design and implementation; start with [`docs/migration/CLAUDE-CODE-DASHBOARD-HANDOFF.md`](docs/migration/CLAUDE-CODE-DASHBOARD-HANDOFF.md) and the project-level [`CLAUDE.md`](CLAUDE.md).

The separate 197-record semantic-memory import is resume-ready but paused because the configured OpenAI Platform account has no remaining credits. OpenViking was restored to its healthy empty pre-import state, so no partial memory is live. See [`docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md`](docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md) for the exact resume sequence.
