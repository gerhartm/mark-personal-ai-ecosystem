# Mark Personal AI Ecosystem — Infrastructure Record

This directory is the source of truth for the V2 server build. It records what changed, why it changed, how it was verified, how to reverse it, and what remains unfinished.

A non-secret recovery mirror is stored on the server at `/root/mark-v2-docs/`. The local project copy remains authoritative; refresh and hash-check the mirror after every completed documentation change.

## Current state

**Captured:** 2026-08-04 04:33 UTC
**Host:** netcup RS 2000 G12, Manassas  
**Operating system:** Ubuntu 24.04.4 LTS, AMD64  
**Public IPv4:** `159.195.16.212`  
**Status:** secured base server online; Coolify 4.2.0, Hermes Agent 0.19.1, private OpenViking 0.4.11, ForkedBrain release `20260803T1408Z`, Crypto Intelligence release `20260803T155532Z`, and isolated V2 Cloudflare tunnel healthy

The host accepts SSH-key authentication only. Coolify's root administrator is owned by Mark, public registration is disabled, and the platform containers are healthy. Hermes has an authenticated dashboard, persistent data volume, verified resource limits, restart persistence, a validated native Anthropic provider using `claude-sonnet-5`, and the native OpenViking provider. OpenViking is a separate private container on the same isolated Coolify network, publishes no host port or domain, and uses native local encrypted storage plus a tenant-bound Hermes key. Its write/search/read, independent-restart persistence, checksum backup, and disposable restore tests passed. Tunnel `mark-personal-ai-v2` publishes `forkedbrain.fyi`, `brain.forkedbrain.fyi`, `manage.forkedbrain.fyi`, `manage-realtime.forkedbrain.fyi`, and `crypto.forkedbrain.fyi` through outbound-only Cloudflare connections. The root command center, Crypto dashboard, and both management hostnames are protected by Cloudflare Access. Coolify ports `8000`, `6001`, and `6002`, Hermes port `9119`, ForkedBrain port `9320`, and Crypto dashboard port `9330` are bound to server loopback. The live legacy `intel.forkedbrain.fyi` endpoint remains unchanged on its original `crypto-intel` tunnel.

The complete legacy Crypto dashboard handoff is staged privately on the VPS: an integrity-verified normalized database plus 89 checksum-verified transcript/media files. ForkedBrain runs as a separate hardened, non-root Next.js container with a read-only copy of that database, a loopback-only origin at `127.0.0.1:9320`, a dynamic graph capped at 20 nodes, retained research conversations, real detail/provenance views, and native Hermes selected-memory chat transport. The dedicated Crypto Intelligence dashboard runs separately at loopback-only `127.0.0.1:9330`, uses the canonical 66-event/47-source database and private media archive, and sends bounded evidence to Hermes for answers. Both applications add no model-provider key, memory provider, or reasoning layer. `https://forkedbrain.fyi/` and `https://crypto.forkedbrain.fyi/` are live behind the exact-email Access boundary.

The complete semantic migration is prepared as 131 source/artifact packets plus 66 event packets. A prior live attempt stopped when Mark's OpenAI Platform balance was exhausted; the partial memory volume was restored from the verified pre-import backup. OpenViking is healthy and its Hermes resource root is clean and empty. Hermes now uses the funded native Anthropic provider and both ForkedBrain chat and Crypto Ask returned real responses in acceptance testing. No Telegram token has been configured.

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
- [ForkedBrain deployment snapshot](./state/2026-08-03T141800Z-forkedbrain-deployment-redacted.md) - accepted release, production security boundary, functional checks, rollback, and remaining root-domain gate.
- [Anthropic provider snapshot](./state/2026-08-03T154500Z-anthropic-provider-redacted.md) - native provider switch, model choice, secret boundary, application tests, and rollback.
- [Crypto dashboard deployment snapshot](./state/2026-08-03T154500Z-crypto-dashboard-redacted.md) - release, runtime hardening, data reconciliation, Ask wiring, persistence, and public-route gate.
- [Crypto public acceptance snapshot](./state/2026-08-04T043300Z-crypto-public-acceptance-redacted.md) - final Access cutover, live edge/origin checks, Hermes answer, restart persistence, and rollback points.
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

The normalized dashboard database and private 89-file media archive are complete, owner-only, and independently verified on the VPS. ForkedBrain release `20260803T1408Z` and Crypto Intelligence release `20260803T155532Z` are healthy, restart-safe, loopback-only, and connected to the funded native Anthropic provider through Hermes. `crypto.forkedbrain.fyi` is live behind the existing exact-email Access application and isolated V2 tunnel. Crypto has not replaced or changed the legacy `intel.forkedbrain.fyi` service. Darshan confirmed an interactive owner login, and the short-lived Crypto cutover token independently verifies as revoked or invalid. The complete 197-record semantic import remains separately paused and should resume only through `CRYPTO-V2-MIGRATION-REVIEW.md`: verify a fixture, run the corrected identity-based importer with a new receipt, require an idle zero-error queue, prove a 197-skip replay, test Hermes retrieval/citations, and create a post-import backup.
