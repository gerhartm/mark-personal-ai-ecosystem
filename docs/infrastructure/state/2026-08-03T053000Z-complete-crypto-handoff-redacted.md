# Complete Crypto handoff and semantic-import pause — redacted state

**Captured:** 2026-08-03 05:30 UTC  
**Scope:** complete legacy Crypto dataset, V2 dashboard handoff, private media archive, and OpenViking rollback

## Accepted state

- The canonical legacy dataset was rebuilt into 131 source/artifact memory packets and 66 linked event packets, with 197 unique deterministic identities and zero checksum/build failures.
- All 32 transcript files were text-extracted for the relevant semantic packets.
- The normalized dashboard SQLite database is integrity-clean and foreign-key-clean.
- Dashboard row counts are 47 sources, 66 events, 1,612 event facets, one theme with 51 links, 41 drafts, 15 quiz sessions, 107 questions, 23 answers, 176 quiz links, 16 pin summaries, 13 sanitized conversation sessions, 614 user/assistant messages, and 89 media records.
- Exactly 89 private transcript/media files totaling 1,758,729,074 bytes match the handoff manifest on both the development Mac and VPS.
- The immutable handoff is owner-only at `/srv/mark-v2/crypto-dashboard-handoff/v1/`; private originals are owner-only at `/srv/mark-v2/crypto-legacy-media/v1/`.
- The Claude Code dashboard brief freezes the architecture/security/data contract while leaving information architecture and visual design to Claude Code.

## Exclusions

Credentials, API keys, cookies, raw environment files, tool calls/results, caches, logs, duplicate backups, and binary media were excluded from semantic memory. Conversation continuity uses only sanitized user/assistant messages in the private structured database. No secret appears in this record or the non-secret server mirror.

## Live import outcome

- A pre-import OpenViking volume archive was created and checksum-verified.
- Clean staging contains exactly 199 packet/manifest files and no macOS sidecars.
- The first live resource showed that OpenViking appends a generated filename suffix. The importer now discovers the canonical URI through deterministic schema/identity search and supports transient search retries without changing Hermes/OpenViking behavior.
- The corrected attempt confirmed 19 identities before the OpenAI Platform balance became exhausted. A twentieth attempt stopped on a native search failure caused by `insufficient_quota`.
- The attempt receipt was retained. No further records were submitted after the billing failure was identified.

## Rollback result

The partial production volume was restored from `/root/mark-v2-backups/20260803T050000Z-pre-complete-crypto-import/` using the frozen OpenViking image. The backup checksum passed before restoration. OpenViking returned healthy with zero pending, running, or error tasks, and the Hermes resource root is empty. The system therefore has no partial client-memory state.

## Unchanged boundaries

- Hermes and OpenViking source/native behavior are unmodified.
- `intel.forkedbrain.fyi` and the old VPS remain unchanged.
- No Cloudflare, DNS, tunnel, hostname, Coolify service definition, Telegram, or credential was changed.
- No dashboard UI or public dashboard service has been created.

## Remaining gate

Add OpenAI Platform credits or explicitly approve and configure another funded OpenViking-compatible provider. Then run the documented 197-record resume, replay, retrieval, and post-import backup sequence. Dashboard design may begin from the frozen structured/media handoff, but ask-Hermes acceptance and final cutover remain gated on the complete semantic import.
