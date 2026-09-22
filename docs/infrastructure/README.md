# Mark Personal AI Ecosystem — Infrastructure Record

> Historical reference. For the current 22 September 2026 documentation, start with the [documentation index](../README.md). Verify older interface, release and authentication details before acting on them.


This directory is the source of truth for the V2 server build. It records what changed, why it changed, how it was verified, how to reverse it, and what remains unfinished.

A non-secret recovery mirror is stored on the server at `/root/mark-v2-docs/`. The local project copy remains authoritative; refresh and hash-check the mirror after every completed documentation change.

## Current state

**Captured:** 2026-09-05 07:24 UTC
**Host:** netcup RS 2000 G12, Manassas  
**Operating system:** Ubuntu 24.04.4 LTS, AMD64  
**Public IPv4:** `159.195.16.212`  
**Status:** Option 1 accepted; secured base server online; Coolify 4.2.0, Hermes Agent 0.19.1, private OpenViking 0.4.11, ForkedBrain release `20260811T132229Z`, Crypto Intelligence application release `20260905T084059Z`, and isolated V2 Cloudflare tunnel healthy

The host accepts SSH-key authentication only. Coolify's root administrator is owned by Mark, public registration is disabled, and the platform containers are healthy. Hermes has an authenticated dashboard, persistent data volume, verified resource limits, restart persistence, the native `openai-api` provider using `gpt-5.6-sol` with high reasoning, and the native OpenViking provider. OpenViking is a separate private container on the same isolated Coolify network, publishes no host port or domain, and uses native local encrypted storage plus a tenant-bound Hermes key. Its write/search/read, independent-restart persistence, checksum backup, and disposable restore tests passed. Tunnel `mark-personal-ai-v2` publishes `forkedbrain.fyi`, `brain.forkedbrain.fyi`, `manage.forkedbrain.fyi`, `manage-realtime.forkedbrain.fyi`, and `crypto.forkedbrain.fyi` through outbound-only Cloudflare connections. The root command center, Crypto dashboard, and both management hostnames are protected by Cloudflare Access. Coolify ports `8000`, `6001`, and `6002`, Hermes port `9119`, ForkedBrain port `9320`, and Crypto dashboard port `9330` are bound to server loopback. The live legacy `intel.forkedbrain.fyi` endpoint remains unchanged on its original `crypto-intel` tunnel.

The complete legacy Crypto dashboard handoff is staged privately on the VPS: an integrity-verified normalized database plus 89 checksum-verified transcript/media files. ForkedBrain runs as a separate hardened, non-root Next.js container with a read-only mount of the live database directory, a loopback-only origin at `127.0.0.1:9320`, a dynamic graph capped at 20 nodes, retained research conversations, real detail/provenance views, and native Hermes selected-memory chat transport. The dedicated Crypto Intelligence dashboard runs separately at loopback-only `127.0.0.1:9330`, uses the canonical 66-event/54-source database and private media archive, sends bounded evidence to Hermes for answers, and exposes an authenticated URL/text Capture screen over OpenViking's native resource path. Completed Satoshi Crypto ingestions also enter the same source identity, receipt, audit, and FTS registration contract through a private persistent FIFO queue. Both applications add no model-provider key, memory provider, reasoning layer, scraper, second database, or vector store. `https://forkedbrain.fyi/` and `https://crypto.forkedbrain.fyi/` are live behind the exact-email Access boundary.

The complete semantic migration is accepted in native OpenViking as 131 source/artifact packets plus 66 event packets. Exact reconciliation found all 197 deterministic targets, an independent replay skipped all 197 with zero creates or failures, six representative deep reads preserved provenance, and production Crypto Ask returned four canonical citations that all resolved. OpenViking uses Luna only for native high-volume resource processing and keeps `text-embedding-3-small` for vectors; Hermes uses `gpt-5.6-sol` through its native OpenAI API provider. The checksum-verified post-import volume archive passed a disposable restore test. The Mark-owned Satoshi Telegram bot is active as one continuous conversation behind a closed allowlist; the temporary implementation chat is in bounded Mark owner-experience acceptance mode for testing. BotFather Topics are disabled, live `dm_topics` are removed, and ordinary direct messages are enabled.

The Crypto dashboard now follows Mark's accepted evidence-first Lovable information architecture. Topics leads into source reading, source-scoped Ask, historical Timeline, selected-source Studio and Prep, Creator Reference, Quiz, Capture, and preserved history. Source briefs, event explanations, inline canonical citations, and generation format checks are deterministic application contracts around Hermes. A persistent light and dark theme switch is available without changing Mark's visual structure. Hermes uses its official key-free DDGS web-search backend where live research is requested.

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
- [Crypto semantic import acceptance](./state/2026-08-05T113500Z-crypto-semantic-import-accepted-redacted.md) — accepted 197-target import, replay proof, cost, citation checks, and restore-tested recovery point.
- [Complete Crypto handoff snapshot](./state/2026-08-03T053000Z-complete-crypto-handoff-redacted.md) — full data reconciliation, private handoff verification, import attempt, quota boundary, and clean rollback.
- [ForkedBrain deployment snapshot](./state/2026-08-03T141800Z-forkedbrain-deployment-redacted.md) - accepted release, production security boundary, functional checks, rollback, and remaining root-domain gate.
- [Anthropic provider snapshot](./state/2026-08-03T154500Z-anthropic-provider-redacted.md) - native provider switch, model choice, secret boundary, application tests, and rollback.
- [Crypto dashboard deployment snapshot](./state/2026-08-03T154500Z-crypto-dashboard-redacted.md) - release, runtime hardening, data reconciliation, Ask wiring, persistence, and public-route gate.
- [Crypto dashboard workflow polish](./state/2026-08-05T124400Z-crypto-dashboard-polish-redacted.md) - Ask, evidence-linked Quiz, Studio and Speaking Preparation polish, bounded Hermes acceptance, and rollback state.
- [Hermes context skills and Studio lenses](./state/2026-08-06T053500Z-hermes-context-skills-redacted.md) - native skills, unified memory contexts, writing lenses, production verification, and the gated Telegram topic plan.
- [Satoshi owner simulation and Sol provider snapshot](./state/2026-08-07T122000Z-satoshi-owner-simulation-sol-redacted.md) - bounded tester behavior, provider switch, session reset, live acceptance, and rollback.
- [Option 1 final acceptance](./state/2026-08-07T161100Z-option1-final-redacted.md) - final production release, workflow proof, security state, recovery points, and owner handoff.
- [Crypto Intelligence command center](./state/2026-08-05T145200Z-crypto-intelligence-command-center-redacted.md) - sourced daily intelligence, proactive decision surface, Hermes-native research, cost controls, production acceptance, and rollback state.
- [Navigation correction snapshot](./state/2026-08-05T154700Z-navigation-correction-redacted.md) - current Crypto destination, deterministic logo and Back navigation, production checks, and rollback state.
- [Crypto public acceptance snapshot](./state/2026-08-04T043300Z-crypto-public-acceptance-redacted.md) - final Access cutover, live edge/origin checks, Hermes answer, restart persistence, and rollback points.
- [Crypto Capture release snapshot](./state/2026-08-04T071800Z-crypto-capture-redacted.md) - native URL/text capture, duplicate and partial-write safety, production release, rollback, and remaining provider gate.
- [Mark evidence and dark-mode completion](./state/2026-09-02T084905Z-mark-evidence-dark-mode-redacted.md) - source and event presentation, evidence UX, Studio output validation, theme completion, guarded promotion, and rollback state.
- [Prep generation action release](./state/2026-09-04T181850Z-prep-action-redacted.md) - visible Prep action restoration, browser acceptance, production state, and rollback assets.
- [Real Hermes Control Center QA](./state/2026-09-05T072131Z-control-center-real-hermes-qa-redacted.md) - paid prompt-effect acceptance, defects corrected, production verification, and rollback assets.
- [Crypto migration review](../migration/CRYPTO-V2-MIGRATION-REVIEW.md) — accepted 197-record import, replay proof, cost record, and recovery point.
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

The normalized dashboard database, private 89-file media archive, and complete 197-record OpenViking semantic import are complete, owner-only, and independently verified on the VPS. ForkedBrain release `20260811T132229Z` and Crypto Intelligence application release `20260905T084059Z` are healthy, restart-safe, loopback-only, and connected to `gpt-5.6-sol` through Hermes. The ForkedBrain Crypto branch routes to `crypto.forkedbrain.fyi`; the Memory Graph logo and Back control return to the main brain overview; and the Crypto Intelligence logo returns to its dashboard home. Mark's evidence-first Topics, historical Timeline, speaking Prep, Haseeb bot, and Tarun bot are the exact five numbered dashboard screens. A separate Control Center provides revisioned page instructions and a manual evidence-validated Topics rebuild. Real paid Hermes acceptance has proven Topics organization, Prep, both creator workflows, revisions, prompt effects, citations, output lengths, plain-language summaries, counterarguments, and source traceability. The Satoshi Telegram gateway is active as one continuous conversation behind a closed allowlist. A custom design-matched login, signed 12-hour sessions, and server-side Turnstile validation are deployed behind the existing exact-email Access application. Public Access removal remains guarded until real Turnstile credentials replace the official test widget. Crypto has not replaced or changed the legacy `intel.forkedbrain.fyi` service. The current Crypto recovery points are the stopped container `crypto-dashboard-rollback-20260905T072131Z` and `/srv/mark-v2/crypto-dashboard/backups/pre-20260905T084059Z/crypto-intelligence.db`; the post-import OpenViking recovery point remains `/root/mark-v2-backups/20260805T112800Z-post-complete-crypto-import/`.
