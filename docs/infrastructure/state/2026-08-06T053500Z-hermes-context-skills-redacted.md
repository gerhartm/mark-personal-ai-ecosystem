# Hermes Context Skills and Studio Lenses

Recorded: 2026-08-06 05:35 UTC

## Accepted state

- Crypto Intelligence release `20260806T052651Z` is active and healthy.
- The container is loopback-only, runs as user `dashboard`, has a read-only root filesystem, drops all capabilities, and retains `no-new-privileges`.
- Public unauthenticated access redirects to the existing Cloudflare Access login.
- The verified corpus remains 66 events, 47 sources, and 89 media files.
- The existing SQLite database remains the only structured application database.
- Hermes remains the only reasoning and agent layer.
- OpenViking remains the only semantic memory layer.

## Native skills

Three repository-owned skills are installed in Hermes and report enabled:

- `crypto-intelligence` for crypto research, recall, ingestion, quiz, speaking preparation, and evidence-backed content.
- `creator-reference` for manually supplied creator material used only when that writing lens is selected.
- `humanized-content` for a restrained final writing pass on outward-facing content without changing facts, citations, URLs, names, or numbers.

The skills extend the unmodified Hermes runtime. They add no agent, database, vector store, memory provider, model provider, queue, or scraper service.

## Content Studio

Studio now exposes two writing lenses: Mark and Creator Reference. Both keep factual claims grounded in the same bounded Crypto evidence and require resolvable canonical citations. The Creator Reference lens changes expression only and refuses generation until usable reference material has been supplied. Lens metadata is stored in the existing `generation_meta` table; no schema migration or new table was required.

## Telegram gate

The repository includes a dormant native Hermes topic configuration for General, Crypto Intelligence, and Creator Reference. Every topic is a separate conversation context over the same OpenViking memory. Activation is intentionally withheld until BotFather topics are enabled for the selected Mark-owned bot and the previous poller for that token is confirmed stopped. No token, numeric user ID, or generated thread ID is present in source control.

## Verification and recovery

- Local server suite: 80 of 80 tests passed.
- Server type check and production build passed.
- Web type check and production build passed.
- Desktop and mobile Studio visual checks passed without horizontal overflow.
- Disposable production-image canary passed access rejection and acceptance, corpus reconciliation, sourced Daily Intelligence, native memory, grounded Ask, cited and revised Studio generation with lens persistence, and evidence-linked Quiz generation and grading.
- Production promotion preserved the pre-switch database checksum before post-start application activity.
- Pre-promotion database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260806T052651Z/crypto-intelligence.db`.
- Retained predecessor: `crypto-dashboard-rollback-20260805T152846Z` using image `mark-crypto-dashboard:20260805T152846Z`.
