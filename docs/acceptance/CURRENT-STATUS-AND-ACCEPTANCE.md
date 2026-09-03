# Option 1: Current Status and Acceptance Matrix

**Checkpoint date:** 2026-09-03
**Accepted Crypto release:** `20260903T163620Z`
**Accepted ForkedBrain release:** `20260811T132229Z`

## Status definitions

- **Accepted:** verified in production with recorded evidence.
- **Working:** available and observed, with a remaining handoff or coverage item.
- **Pending:** not yet implemented or not yet accepted.
- **Deliberately excluded:** outside Option 1 or rejected to avoid unnecessary
  complexity.

## Product capability matrix

| Capability | Status | Evidence or remaining condition |
|---|---|---|
| Protected Crypto dashboard | Accepted | Production health, identity, edge redirect, and origin checks passed |
| Evidence-first Topics home | Accepted | 65 real topics built from stored tags, events, sources, and claims; no generated watchlist or dummy totals |
| Legacy daily Brief home | Deliberately excluded | Removed from the primary workflow because Mark requested source-led research rather than generated command-center interpretation |
| Source-grounded Ask | Accepted backend capability | Real Hermes evidence, clickable inline canonical citations, source-scoped questions, plain-language response contract, Markdown rendering, and searchable history passed; it is not exposed as a separate tab in Mark's five-screen interface |
| Historical Timeline | Accepted | All stored years from 2000 through 2026, real reference counts, clear source takeaways, evidence dialogs, and source links passed |
| Sources | Accepted backend capability | 54 real sources, requested source groups, retained text, extracted claims, search, and detail contracts passed; it is not exposed as a separate tab in Mark's five-screen interface |
| Connections primary view | Deliberately excluded | Removed from primary navigation after Mark rejected the unclear relationship view; the compatibility route remains for preserved links |
| Quiz | Accepted backend capability | Evidence-linked generation, grading, feedback, atomic history, and model-answer reveals passed; it is not exposed as a separate tab in Mark's five-screen interface |
| Studio | Accepted backend capability | Topic-guided source selection, X posts, X threads, LinkedIn, review briefs, Creator Reference lens, revision history, citation validation, and publishable-format validation passed; the visible creator workflows are Haseeb bot and Tarun bot |
| Speaking Preparation | Accepted | Exposed as Prep with bounded evidence and citations |
| Light and dark themes | Accepted | Light is the default; the only addition to Mark's mock is a persistent dark-mode switch |
| Dashboard Capture | Accepted | URL, pasted text, YouTube transcript, duplicate, unsafe URL, and failure behavior passed |
| Semantic memory migration | Accepted | 197 identities reconciled; replay skipped 197 with no duplicate creates or failures |
| Satoshi Telegram gateway | Working | Gateway and Mark allowlist are active; Mark/Mari interactive acceptance remains |
| Mark Telegram access | Working | Mark added to closed allowlist; real owner workflow confirmation remains |
| Mari Telegram access | Pending | Numeric Telegram ID has not yet been supplied and added |
| Telegram → OpenViking ingestion | Accepted | Native Satoshi memory ingestion and later recall observed |
| Telegram → Dashboard Library registration | Accepted | Two live Satoshi/OpenViking sources reached `ready`, entered the Library, and remained deduplicated on replay and restart |
| Telegram source visibility in graph | Accepted | Both registered sources were found through body/title graph search while the 20-node cap remained enforced |
| Creator Reference | Accepted backend capability | Manual corpus boundary, retrieval, generation lens, and no-fabrication behavior passed; Haseeb bot and Tarun bot are the only visible creator-reference screens |
| Humanized Content | Accepted | Opt-in final pass preserved evidence and citations in acceptance checks |
| ForkedBrain command center | Accepted | Protected overview, navigation, search, details, and bounded graph passed |

## Data acceptance

| Check | Result |
|---|---|
| SQLite integrity | `ok` |
| Foreign-key violations | `0` |
| Canonical events | `66` |
| Canonical sources at accepted release | `54` |
| Persistent Telegram sync jobs | `7 ready`, `1 maximum attempt` |
| Media assets | `89` |
| Semantic identities | `197` |
| Independent semantic replay | `197 skipped`, `0 created`, `0 failed` |
| Representative semantic reads | Passed |
| Canonical citation resolution | Passed |
| QA fixtures left in production | `0` |

Counts can increase through accepted post-release Capture. Any newer count must
be measured from production and recorded rather than inferred from this
checkpoint.

## Security acceptance

| Control | Status |
|---|---|
| SSH key-only | Accepted |
| SSH password authentication disabled | Accepted |
| SSH keyboard-interactive authentication disabled | Accepted |
| Root password login over SSH disabled | Accepted |
| UFW active | Accepted |
| Application origins loopback-only | Accepted |
| Browser surfaces protected by Cloudflare Access | Accepted |
| Telegram closed numeric allowlist | Accepted |
| Dashboard non-root runtime | Accepted |
| Dashboard read-only root filesystem | Accepted |
| Linux capabilities dropped | Accepted |
| `no-new-privileges` | Accepted |
| OpenViking has no public port | Accepted |
| Secrets excluded from Git and images | Accepted by repository and release scans |

## Backup and recovery acceptance

| Recovery asset | Status |
|---|---|
| Pre-release Crypto database backup | Verified |
| Clean post-release Crypto database backup | Verified |
| OpenViking post-import archive | Checksum verified and disposable restore tested |
| Hermes provider/owner-simulation package | Verified recovery package retained |
| Mark Telegram handoff package | Checksum verified before allowlist change |
| Previous Crypto image | Retained for rollback |
| Portable VPS deployment kit | Built and statically verified; requires separate client data and secrets |
| Client-facing restore demonstration | Pending only if requested as a handoff artifact |

## Telegram synchronization acceptance

The release passed these production checks without a paid model call:

1. Two completed native OpenViking Crypto sources were submitted through the
   exact helper installed in Satoshi's Crypto skill.
2. Both persistent jobs reached `ready` on their first attempt.
3. The Library contained one canonical source for each item with Telegram
   provenance and complete full-text content.
4. Dashboard search found distinctive terms from both retained sources.
5. ForkedBrain graph search found both sources and returned only the Mark and
   Source Library anchors plus the matching source.
6. Replaying one external identity returned the same canonical ID, left the job
   count at two, left the source count at 49, and did not increment attempts.
7. Dashboard and ForkedBrain were restarted; both returned healthy and the same
   jobs, search results, and graph results remained available.
8. Missing and invalid private sync credentials both returned HTTP `401`.
9. SQLite quick check returned `ok`, foreign-key violations were zero, and the
   `006 telegram_source_sync` migration was present exactly once.
10. The legacy `intel.forkedbrain.fyi` endpoint continued returning HTTP `200`;
    protected V2 endpoints continued redirecting unauthenticated users to
    Cloudflare Access; HTTP continued redirecting to HTTPS.

## Final handoff checklist

- [x] Implement and accept Telegram-to-dashboard registration.
- [ ] Add Mari's Telegram numeric ID.
- [ ] Run Mark's real-account Satoshi acceptance.
- [ ] Run Mari's staff-account Satoshi acceptance.
- [ ] Remove the temporary tester after explicit approval.
- [x] Refresh production counts and this matrix.
- [x] Refresh the non-secret server documentation mirror and verify hashes.
- [x] Push the `20260903T163620Z` release documentation and checkpoint to the private repo.
- [ ] Deliver the client handbook, access guide, and any requested restore
      demonstration.

## Deliberate exclusions

- No second agent or bot for each context.
- No second vector store or generic RAG framework.
- No public OpenViking endpoint.
- No custom social-media scraper that claims success on blocked content.
- No unbounded graph containing every message or memory.
- No automatic humanization of evidence or research answers.
- No modification of the legacy `intel.forkedbrain.fyi` service during Option 1
  acceptance.
