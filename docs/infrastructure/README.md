# Mark Personal AI Ecosystem — Infrastructure Record

This directory is the source of truth for the V2 server build. It records what changed, why it changed, how it was verified, how to reverse it, and what remains unfinished.

A non-secret recovery mirror is stored on the server at `/root/mark-v2-docs/`. The local project copy remains authoritative; refresh and hash-check the mirror after every completed documentation change.

## Current state

**Captured:** 2026-08-03 05:30 UTC  
**Host:** netcup RS 2000 G12, Manassas  
**Operating system:** Ubuntu 24.04.4 LTS, AMD64  
**Public IPv4:** `159.195.16.212`  
**Status:** secured base server online; Coolify 4.2.0, Hermes Agent 0.19.1, private OpenViking 0.4.11, and isolated V2 Cloudflare tunnel healthy

The host accepts SSH-key authentication only. Coolify's root administrator is owned by Mark, public registration is disabled, and the platform containers are healthy. Hermes has an authenticated dashboard, persistent data volume, verified resource limits, restart persistence, and validated native OpenAI and OpenViking providers. OpenViking is a separate private container on the same isolated Coolify network, publishes no host port or domain, and uses native local encrypted storage plus a tenant-bound Hermes key. Its write/search/read, independent-restart persistence, checksum backup, and disposable restore tests passed. Tunnel `mark-personal-ai-v2` publishes `brain.forkedbrain.fyi`, `manage.forkedbrain.fyi`, and `manage-realtime.forkedbrain.fyi` through outbound-only Cloudflare connections. Coolify ports `8000`, `6001`, and `6002` and Hermes port `9119` are bound to server loopback. The live legacy `intel.forkedbrain.fyi` endpoint remains unchanged on its original `crypto-intel` tunnel.

The complete legacy Crypto dashboard handoff is now staged privately on the VPS: an integrity-verified normalized database plus 89 checksum-verified transcript/media files. The complete semantic migration is prepared as 131 source/artifact packets plus 66 event packets. A live attempt stopped when Mark's OpenAI Platform balance was exhausted; the partial memory volume was restored from the verified pre-import backup. OpenViking is healthy and its Hermes resource root is clean and empty. No Telegram token has been configured and no dashboard UI/public dashboard service has been created.

## Documents

- [Build log](./BUILD-LOG.md) — chronological record of every change made so far.
- [Operations runbook](./RUNBOOK.md) — connect, verify, resume, pause, recover, and continue safely.
- [Operations ledger](./OPERATIONS-LOG.md) — append-only log for every future infrastructure change.
- [Credential register](./CREDENTIAL-REGISTER.md) — redacted inventory of every account, password class, SSH key, and internal secret created or still pending.
- [Verification snapshot](./state/2026-07-31T093055Z-redacted.md) — redacted observed state after the initial build.
- [Coolify bootstrap snapshot](./state/2026-07-31T104209Z-coolify-bootstrap-redacted.md) — redacted state after administrator creation and registration lock.
- [Hermes bootstrap snapshot](./state/2026-07-31T114200Z-hermes-bootstrap-redacted.md) — redacted deployed-service, boundary, persistence, and cleanup state.
- [OpenAI provider snapshot](./state/2026-07-31T123000Z-openai-provider-redacted.md) — redacted provider, model, validation, persistence, and rollback state.
- [Coolify realtime snapshot](./state/2026-07-31T152800Z-coolify-realtime-redacted.md) — redacted realtime hostname, service wiring, validation, and rollback state.
- [Cloudflare Access snapshot](./state/2026-07-31T160000Z-cloudflare-access-redacted.md) — redacted application, policy, identity, verification, revocation, and rollback state.
- [OpenViking acceptance snapshot](./state/2026-07-31T175300Z-openviking-acceptance-redacted.md) — redacted private-memory deployment, tenancy, persistence, restore, exposure, and credential-closeout state.
- [Crypto ingestion acceptance snapshot](./state/2026-07-31T183800Z-crypto-ingestion-acceptance-redacted.md) — redacted synthetic native-ingestion, provenance, replay-safety, and cleanup state.
- [Crypto migration readiness snapshot](./state/2026-07-31T190000Z-crypto-migration-readiness-redacted.md) — redacted final packet counts, verification, content boundary, and approval gate.
- [Complete Crypto handoff snapshot](./state/2026-08-03T053000Z-complete-crypto-handoff-redacted.md) — full data reconciliation, private handoff verification, import attempt, quota boundary, and clean rollback.
- [Crypto migration review](../migration/CRYPTO-V2-MIGRATION-REVIEW.md) — complete 197-record reconciliation and exact resume sequence.
- [Claude Code dashboard handoff](../migration/CLAUDE-CODE-DASHBOARD-HANDOFF.md) — frozen product, data, architecture, security, and acceptance contract for dashboard design.

## Documentation rule

Every infrastructure change must be recorded in `OPERATIONS-LOG.md` with:

1. UTC timestamp and operator.
2. Purpose and exact scope.
3. Commands or UI actions performed.
4. Files, services, ports, credentials classes, or data affected.
5. Before/after verification.
6. Rollback or recovery procedure.
7. Any remaining risk or follow-up.

Passwords, private keys, API keys, session cookies, OAuth tokens, recovery codes, and raw environment files must never be copied into these documents.

## Exact resume point

The isolated V2 Cloudflare tunnel, approved hostnames, realtime route, loopback-only origins, shared Cloudflare Access application, Hermes central brain, and private native OpenViking memory provider are complete. Temporary deployment API access is disabled and its token is gone. Generated OpenViking credentials and encryption material are escrowed only under the owner-only `.secrets/credentials/new-vps/` tree. Do not change `intel.forkedbrain.fyi`.

The normalized dashboard database and private 89-file media archive are complete, owner-only, and independently verified on the VPS. Claude Code can begin dashboard product/design planning from the frozen handoff. The complete 197-record semantic import remains paused because the configured OpenAI Platform account has no credits. After credits are added—or another funded provider is explicitly approved—follow `CRYPTO-V2-MIGRATION-REVIEW.md`: verify a fixture, run the corrected identity-based importer with a new receipt, require an idle zero-error queue, prove a 197-skip replay, test Hermes retrieval/citations, and create a post-import backup. OpenViking is currently healthy and empty because the partial attempt was deliberately rolled back.
