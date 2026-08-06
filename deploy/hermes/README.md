# Hermes Central Brain Deployment

This directory freezes the internal Hermes and OpenViking application stack for Mark's Personal AI Ecosystem. Hermes remains the central brain; OpenViking is its native external memory provider rather than a second agent or a replacement interface.

## Frozen release

- Hermes release: `v0.19.1` / release tag `v2026.7.30`
- Docker image: `nousresearch/hermes-agent:v2026.7.30`
- Linux AMD64 image digest: `sha256:5316c2c2534c49f5e1b1691e1a2115f1230d900033c3b35d1c8fc2e47352b26d`
- Mutable state: the single `hermes_data` volume mounted at `/opt/data`
- OpenViking release: `v0.4.11`
- OpenViking image: `ghcr.io/volcengine/openviking:v0.4.11`
- OpenViking Linux AMD64 manifest digest: `sha256:6bca0c71301a918b6cb6a614677d0a15556ce2d62ba3e491e3be78c490008bbe`
- OpenViking mutable state: the single `openviking_data` volume mounted at `/app/.openviking`

The tag and platform-specific digest are both pinned so a future upstream image change cannot silently alter this deployment.

## Exposure boundary

- The Hermes dashboard origin is bound only to server loopback at `127.0.0.1:9119`.
- Cloudflare tunnel `mark-personal-ai-v2` publishes the approved HTTPS hostname `brain.forkedbrain.fyi`; Hermes's own authenticated login remains the application gate.
- Direct public-IP access to port `9119` is unavailable. An SSH tunnel remains the recovery path.
- The OpenAI-compatible API port `8642` is not published.
- OpenViking publishes no host port, domain, Cloudflare route, or Traefik label. Hermes reaches it only as `http://openviking:1933` on the stack's isolated Docker network.
- No host Docker socket or host filesystem is mounted into Hermes.
- OpenViking's optional bot is disabled because Hermes already provides the agent and gateway layer.

## Credential contract

Hermes's native `dashboard.basic_auth` configuration in `/opt/data/config.yaml` contains:

- The Mark-owned administrator username.
- An scrypt password hash; the plaintext password is not stored in Hermes.
- The restart-stable dashboard session-signing secret.
- A 12-hour session lifetime.

The raw login password belongs only in the ignored mode-`0600` project credential master. The config file is mode `0600` inside `hermes_data`. Dashboard auth values must not be added to this directory or Coolify's service-wide variable store, because Coolify shares service variables with every container in a Compose resource.

## Resource envelope

- CPU limit: 2 vCPU
- Memory reservation: 1 GiB
- Memory limit: 4 GiB
- Restart policy: `unless-stopped`

This leaves capacity on the 8-core, 16 GiB host for Coolify, OpenViking, ingestion workers, and later thin application services.

OpenViking is limited to 3 vCPU and 6 GiB, with a 2 GiB reservation. Together the two application containers have a 10 GiB memory ceiling, leaving headroom for the operating system and Coolify.

## OpenViking configuration contract

The Compose file intentionally contains no OpenViking configuration or provider secret. Its persistent volume must contain:

- `ov.conf` — server, storage, embedding, VLM, authentication, and native encryption configuration.
- `ovcli.conf` — root-administration profile; owner-only and never mounted into Hermes.
- `master.key` — native local encryption root key; mode `0600` and separately escrowed in the client-owned secret archive.
- `data/` — encrypted OpenViking workspace and local vector index.

The server uses API-key authentication. Hermes receives a dedicated tenant-bound user key in its profile `.env`; it never receives the OpenViking root key. The approved OpenAI Platform key is reused for OpenViking's official OpenAI embedding and VLM providers without placing it in Compose or ordinary documentation.

## Verified acceptance state — 2026-07-31

1. The resolved running image digest matches the frozen Linux AMD64 digest.
2. The container remains running as Hermes Agent `0.19.1`; its supervised gateway is active.
3. The dashboard redirects unauthenticated requests to login, and a valid basic-auth login was accepted.
4. Host TCP `9119` is bound only to `127.0.0.1`; TCP `8642` is not published or listening.
5. A deliberate container restart preserved `/opt/data`, the migrated configuration, the acceptance probe, and the authenticated dashboard session.
6. The configuration was migrated to schema version `33`; exact-failure and idempotent-no-progress hard stops are enabled at five repetitions.
7. CPU and memory limits are active at 2 vCPU and 4 GiB.
8. Mark's approved model-provider credential is connected through Hermes' native credential pool and restart persistence passed. Telegram activation is recorded in the dedicated section below; no legacy-data credential has been added.
9. OpenViking `v0.4.11` is active through Hermes's native provider path; write/search/read, independent restarts, consistent backup, disposable restore, private exposure, and credential isolation passed.

OpenViking runtime acceptance is complete. No custom adapter, extra vector service, parallel agent, or Hermes source modification was introduced.

Access the dashboard from the development Mac with:

```bash
ssh -L 9119:127.0.0.1:9119 mark-netcup-v2
```

Then open `http://127.0.0.1:9119`. The username and temporary password are recorded only in the private V2 master credential file.

Normal owner access is `https://brain.forkedbrain.fyi/`; the SSH tunnel is retained for recovery and direct origin checks.

The direct restart acceptance test leaves a non-blocking recent-history warning in `hermes gateway status` about the previous process ID being gone. The currently supervised gateway is running; this warning records the deliberate container restart rather than an active outage.

## Rollback

Stop the Coolify service without deleting either persistent volume. If only OpenViking must be rolled back, remove its service from Compose while retaining `openviking_data`; Hermes can be returned to built-in-only memory without changing its image or data. If a release must be rolled back, change only that service's image to a previously approved tag and digest. Never run two Hermes gateways against `hermes_data` or two OpenViking writers against `openviking_data` at once.

## Mark context skills

The repository-owned skills in `skills/mark/` extend the unmodified Hermes runtime:

- `satoshi` routes one continuous Telegram chat across the supported contexts. Explicit labels win, obvious material is inferred, and ambiguous ingestion receives one short clarification.
- `mark-general` gives Satoshi a focused general-assistant context for Mark while preserving the native Hermes toolset.
- `crypto-intelligence` handles crypto ingestion, recall, research, quiz, speaking, and evidence-backed content.
- `creator-reference` stores manually supplied creator material and applies it only as an explicit writing lens.
- `humanized-content` is an opt-in final writing pass. Mark invokes it when he wants a draft polished; it never changes evidence, citations, or research answers.

Deploy these directories to `/opt/data/skills/mark/`. All skills continue to use the same Hermes brain and the same OpenViking provider. They do not add another agent, database, vector store, or model service.

## Telegram context topics

Hermes natively supports isolated private-message topic sessions with a skill bound to each topic. The approved layout is:

- General: automatically loads `mark-general` for Mark's everyday assistant, planning, research, recall, and coordination work.
- Crypto Intelligence: automatically loads `crypto-intelligence`.
- Creator Reference: automatically loads `creator-reference`.

Every topic is a separate conversation context, but all topics use the same OpenViking memory. The topic does not create or own a separate memory store.

The value-free reference configuration is in `telegram-topics.example.yaml`. The live Satoshi bot was activated on 2026-08-06 after all of these checks passed:

1. BotFather topics are enabled for the selected Mark-owned bot.
2. Telegram `getMe` reports `has_topics_enabled=true`.
3. The old poller for the selected token is stopped or a currently inactive bot is selected.
4. `/opt/data/.env` contains `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_USERS` set to Mark's numeric user ID, with mode `0600`.
5. The example block is merged into a backed-up `/opt/data/config.yaml`, replacing the placeholder chat ID with the same numeric user ID.

The live bot created and persisted General, Crypto Intelligence, and Creator Reference topic IDs. General binds `mark-general`; the other two bind their matching context skills. The gateway is connected in polling mode, its allowlist is closed, and `ignore_root_dm: true` prevents ordinary root messages from bypassing the named contexts. The temporary implementation tester remains the only allowed user until Mark starts the bot and supplies his own numeric Telegram ID for the handoff. Never commit the token, numeric user ID, generated thread IDs, or the live config.

Before final owner handoff, add Mark's ID to both the environment allowlist and a matching `dm_topics` block, verify all three topic bindings from Mark's account, then remove the temporary tester and their topic block. Creator Reference is operationally ready but intentionally has no invented creator profile; the first accepted source must identify the reference creator.

Rollback is to stop the gateway, restore the pre-change config and `.env` backups, and start the gateway again. This does not affect OpenViking memory.

## Unified Telegram chat cutover

The three-topic layout above proved the native bindings but produced unnecessary Telegram UI friction. The approved steady-state design is one ordinary Satoshi DM with request-level routing:

- Mark can explicitly say whether new material is for Crypto Intelligence, Creator Reference, or General memory.
- Satoshi infers an obvious destination without asking.
- Satoshi asks one short question before genuinely ambiguous ingestion.
- Humanization is opt-in through an ordinary request such as `Humanize this`.

The value-free target configuration is in `telegram-single-chat.example.yaml`. It uses Hermes's native per-channel prompt to load the `satoshi` router skill; the router delegates to the existing specialist skills and native OpenViking tools. No routing service or additional persistence layer is introduced.

Cutover must be performed in this order:

1. Disable Topics for the bot in BotFather and confirm Telegram reports `has_topics_enabled=false`.
2. Back up the live Hermes config, environment, skills, and session state.
3. Remove `dm_topics`, set `ignore_root_dm: false`, and add the root-chat prompt shown in the value-free example for each allowed owner or tester.
4. Restart only the Hermes gateway and send a real root-DM message.
5. Verify the `satoshi` skill loads, explicit Crypto and Creator Reference ingestion routes correctly, ambiguous ingestion asks once, and `Humanize this` loads only the writing finalizer.

Do not apply step 3 while Topics remain enabled. The old topic sessions may remain as inactive history; no destructive deletion is required.
