# Satoshi owner simulation and Sol provider snapshot

**Captured:** 2026-08-07 12:20 UTC
**Scope:** Hermes model selection, one allowlisted Telegram test chat, repository-owned identity instructions, recent tester sessions, and non-secret documentation.

## Accepted state

- Hermes default provider is the native `openai-api` provider.
- Hermes default model is `gpt-5.6-sol` with `agent.reasoning_effort=high`.
- One existing allowlisted implementation chat has one channel-scoped owner-experience acceptance prompt. No chat ID, user ID, token, key, or prompt value is recorded here.
- In that bounded chat, Satoshi addresses the tester as Mark, resolves first-person language as Mark, retrieves Mark's canonical OpenViking context, and exercises the same workflows intended for Mark.
- The gateway allowlist is unchanged. This is not a free-text identity switch, a second profile, another memory store, or permission expansion.
- Casual test statements cannot replace Mark's canonical biography without an explicit correction or remember request.
- OpenViking data, imported Crypto Intelligence records, dashboards, Cloudflare, DNS, tunnels, and the legacy VPS were not changed.

## Safety and verification

- Pre-change recovery point: `/root/mark-v2-backups/20260807T120931Z-mark-owner-simulation-sol/`.
- The recovery point contains the prior config, identity files, redacted Telegram-session export, and a consistent SQLite state snapshot.
- Four recent tester Telegram sessions were removed only after backup so cached Darshan-specific conclusions could not survive the cutover.
- Deployed `SOUL.md`, `satoshi`, and `mark-general` hashes matched the local repository copies.
- Live configuration readback returned provider `openai-api`, model `gpt-5.6-sol`, reasoning `high`, exactly one channel prompt, and the expected owner-simulation marker.
- Hermes and its supervised gateway were running after restart; Telegram remained configured.
- A disposable real-model acceptance call loaded `satoshi`, identified itself as Satoshi, treated the tester as Mark, searched and read Mark's canonical OpenViking profile, and returned a correct confidence-aware summary. It used `gpt-5.6-sol`; the disposable session and usage record were deleted afterward.

## Rollback

Stop only the Hermes gateway, restore the config, identity files, and SQLite state from the recovery point, then restart Hermes and verify provider, Telegram, and Satoshi behavior. Do not restore or modify OpenViking, dashboard databases, Cloudflare, or the legacy server for this rollback.
