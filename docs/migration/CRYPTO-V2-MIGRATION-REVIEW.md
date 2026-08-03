# Crypto Intelligence V2 — Complete Migration Review

**Updated:** 2026-08-03 05:30 UTC  
**Status:** dashboard handoff complete; semantic import paused cleanly pending funded model access

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
| Local migration tests | 18 passed |
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

Resume-ready import staging:

```text
/root/mark-v2-imports/20260803T053000Z-complete-crypto-clean/
```

It contains exactly 199 packet/manifest files, zero AppleDouble files, three importer source files plus the handoff verifier, and retained attempt receipts. It is not part of the non-secret documentation mirror.

## Import attempt and clean rollback

A checksum-verified pre-import OpenViking backup was created at:

```text
/root/mark-v2-backups/20260803T050000Z-pre-complete-crypto-import/
```

The first live record also exposed a native detail: OpenViking owns the final stored filename and appends a collision-safe suffix. The importer was corrected to identify resources by their body-visible deterministic schema/source/event ID and to retain OpenViking's returned canonical URI. A generated-filename replay test and all 18 local tests pass.

The corrected run confirmed one replay skip and 18 creates before Mark's OpenAI Platform balance reached zero. A twentieth resource had been submitted when native search returned `insufficient_quota`; the executor recorded a failure and stopped. No additional records were submitted.

The partial OpenViking volume was then replaced with the verified pre-import snapshot. Final post-rollback state is healthy with zero pending/running/error tasks and an empty Hermes resource root. This avoids half-indexed memory and futile API retries. The structured dashboard handoff and private media archive remain complete and unaffected.

## Exact resume sequence

After OpenAI credits are added—or another funded provider is explicitly approved and configured:

1. Confirm one non-generative provider request and one small OpenViking fixture complete successfully.
2. Recheck the existing pre-import backup checksum and create a fresh backup if runtime state has changed.
3. Verify the 197-record staged manifest and packet checksums.
4. Run the corrected native importer with a new receipt file.
5. Wait for OpenViking's queue to reach zero pending/running/errors.
6. Reconcile exactly 131 source/artifact identities and 66 event identities.
7. Replay with a new receipt file and require 197 skips with zero creates.
8. Test exact reads plus Crypto retrieval and citation samples through Hermes.
9. Create and checksum a post-import backup.
10. Remove only obsolete staging after the accepted receipt and backup are preserved.

No Cloudflare, DNS, tunnel, public hostname, legacy endpoint, Hermes source, OpenViking source, or client credential change is part of this resume.

## Dashboard boundary

Claude Code owns dashboard information architecture, visual design, and implementation. Start from [CLAUDE-CODE-DASHBOARD-HANDOFF.md](./CLAUDE-CODE-DASHBOARD-HANDOFF.md). Do not change `intel.forkedbrain.fyi` until the isolated preview is accepted.
