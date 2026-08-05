# Crypto Intelligence V2 — Complete Migration Review

**Updated:** 2026-08-05 11:35 UTC
**Status:** complete and accepted; all 197 semantic packets are live in native OpenViking memory

## Complete reconciliation

| Check | Result |
|---|---:|
| Canonical database integrity | `ok` |
| Source and artifact packets | 131 |
| Linked event packets | 66 |
| Total semantic packets | 197 |
| Canonical event IDs preserved | 66 of 66 |
| Transcript files text-extracted | 32 of 32 |
| Unique target URIs | 197 |
| Packet checksum mismatches | 0 |
| Missing event-to-source links | 0 |
| Migration build failures | 0 |
| Targeted importer regression tests | 4 passed |
| Dashboard database integrity | `ok` |
| Dashboard foreign-key violations | 0 |
| Private media checksums | 89 of 89 |

The 131 source/artifact packets comprise 47 canonical source identities, one theme, 41 content drafts, 15 quiz-session bundles, 16 pinned event summaries, and 14 additional unlinked transcript resources. The 15 quiz bundles preserve 107 questions and 23 answers. The 66 separate event packets retain the canonical event IDs and source links.

## Semantic-memory boundary

Meaningful research, transcripts, summaries, notes, drafts, quiz history, themes, and pinned summaries are approved for Mark's unified Crypto memory. The following are deliberately not placed into semantic memory:

- credentials, cookies, tokens, and raw environment files;
- OpenClaw runtime state, caches, delivery queues, and logs;
- raw tool calls/results from conversation archives;
- duplicate historical event backups;
- binary audio/video files.

Binary and transcript originals remain in the private checksum-verified media archive. The dashboard database separately preserves 13 sanitized conversation sessions and 614 user/assistant messages without tool payloads.

## Prepared artifacts

Local ignored source bundles:

```text
02-Project-Workspace/.work/crypto-v2/complete-packets-20260803T010000Z/
02-Project-Workspace/.work/crypto-v2/dashboard-handoff-20260803T010000Z/
02-Project-Workspace/.work/crypto-v2/import-attempt-20260803T050000Z/
```

Private VPS handoff:

```text
/srv/mark-v2/crypto-dashboard-handoff/v1/
/srv/mark-v2/crypto-legacy-media/v1/
```

The dashboard directory contains the immutable normalized SQLite database and two manifests. The media directory contains exactly the 89 manifest-approved files totaling 1,758,729,074 bytes. Both directories are mode `0700`; files are owner-only. The full handoff passes the independent verifier on both Mac and VPS.

Retained accepted-import staging:

```text
/root/mark-v2-imports/20260803T053000Z-complete-crypto-clean/
```

It contains exactly 199 packet/manifest files, zero AppleDouble files, three importer source files plus the handoff verifier, and retained attempt receipts. It is not part of the non-secret documentation mirror.

## Historical failed attempt and clean rollback

A checksum-verified pre-import OpenViking backup was created at:

```text
/root/mark-v2-backups/20260803T050000Z-pre-complete-crypto-import/
```

The first live record also exposed a native detail: OpenViking owns the final stored filename and appends a collision-safe suffix. The historical importer was first corrected to identify resources by body-visible deterministic schema/source/event ID and retain OpenViking's returned canonical URI. The accepted importer later replaced that semantic lookup with a cheaper and stronger deterministic target `stat` check, as documented below.

The corrected run confirmed one replay skip and 18 creates before Mark's OpenAI Platform balance reached zero. A twentieth resource had been submitted when native search returned `insufficient_quota`; the executor recorded a failure and stopped. No additional records were submitted.

The partial OpenViking volume was then replaced with the verified pre-import snapshot. Final post-rollback state is healthy with zero pending/running/error tasks and an empty Hermes resource root. This avoids half-indexed memory and futile API retries. The structured dashboard handoff and private media archive remain complete and unaffected.

Phase 3's disposable Capture canary reconfirmed the same OpenAI embedding-credit
gate on 2026-08-04. It also proved that a native target may appear before the
failed embedding task releases its lock. Both synthetic targets were removed
after the task settled and neither was registered in the production dashboard
database. The live Capture endpoint now refuses to promote remote-only targets;
this strengthens the safety boundary but does not remove the funded-provider
requirement that was later closed by the accepted import below.

## Accepted clean production import

On 2026-08-05 the failed GPT-5.4 branch was removed and the clean pre-import
state was used for a single-model production import. OpenViking now uses
`gpt-5.6-luna` for native high-volume semantic processing,
`text-embedding-3-small` for vectors, reasoning disabled, one retry, and native
VLM concurrency `4`. Hermes remains on its existing provider. No Hermes or
OpenViking source was patched.

Acceptance results:

| Check | Accepted result |
|---|---:|
| Source/artifact target directories | 131 of 131 |
| Event target directories | 66 of 66 |
| Total deterministic identities | 197 of 197 |
| Locked or missing targets | 0 |
| Queue errors after import | 0 |
| Replay creates | 0 |
| Replay skips | 197 |
| Replay failures | 0 |
| Representative deep provenance reads | 6 of 6 |
| Production Crypto Ask evidence records | 8 |
| Production Crypto Ask citations | 4 of 4 resolved |

The importer now checks each deterministic target with native `stat` before an
add. This eliminated the prior semantic identity-search calls and made an
interrupted or replayed run safe without extra model work. One in-flight record
that completed during the concurrency restart was detected and skipped rather
than duplicated.

The model observer recorded an estimated **$3.46** for the clean Luna import,
including its embeddings, using the approved standard token prices. The OpenAI
billing dashboard remains authoritative. The embedding portion was only cents;
there is no fixed monthly embedding charge.

The accepted post-import recovery point is:

```text
/root/mark-v2-backups/20260805T112800Z-post-complete-crypto-import/
```

`openviking-data.tar.gz` is 34,801,436 bytes, mode `0600`, and passes its
`SHA256SUMS` check. It was restored into a disposable volume under the same
digest-pinned OpenViking image, the restored service reached healthy, and an
exact imported target stat succeeded. The disposable container and volume were
then removed. Production returned healthy with zero pending/running/error work.

The final manifest and 21 receipt files are also preserved locally under the
owner-only `.secrets/migration-manifests/crypto-v2-20260805-complete/` tree.

No Cloudflare, DNS, tunnel, public hostname, legacy endpoint, dashboard code,
Hermes source, OpenViking source, or client credential changed during this
completion run. `intel.forkedbrain.fyi` remained live and unchanged.

## Dashboard boundary

Claude Code owns dashboard information architecture, visual design, and implementation. Start from [CLAUDE-CODE-DASHBOARD-HANDOFF.md](./CLAUDE-CODE-DASHBOARD-HANDOFF.md). Do not change `intel.forkedbrain.fyi` until the isolated preview is accepted.
