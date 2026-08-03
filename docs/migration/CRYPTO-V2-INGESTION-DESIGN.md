# Crypto Intelligence V2 — Thin Ingestion and Provenance Design

**Frozen:** 2026-07-31  
**Status:** design and read-only legacy audit; no client data imported  
**Architecture rule:** Hermes first; build only verified gaps

## Outcome

Crypto Intelligence will be a specialized branch of Mark's single Hermes brain, not another agent or isolated bot. Hermes remains the conversation, reasoning, web, browser, file, document, YouTube, X, scheduling, and Telegram layer. OpenViking remains the unified memory/retrieval layer. V2 adds only a deterministic Crypto source envelope, idempotency rule, and ingestion receipt so every answer can trace back to an original source.

```text
Telegram / dashboard / direct chat
              |
              v
      Hermes central brain
        | native skills
        | web, browser, YouTube, PDF/docs, X, files
        v
  Crypto provenance envelope
  ID + source + dates + checksum + extraction status
        |
        v
  Hermes native viking_add_resource / remember
        |
        v
  OpenViking unified memory
        |
        +--> search / read / browse / forget
        +--> later thin Crypto timeline/dashboard views
```

No custom scraper, Telegram service, vector database, queue, RAG framework, agent gateway, or parallel memory service is justified.

## Native capability map

| Requirement | Native owner | Custom work |
|---|---|---|
| Telegram conversation and attachments | Hermes gateway | Configuration at cutover only |
| Web search and page extraction | Hermes `web` and `browser` tools | None |
| YouTube transcripts | Hermes `youtube-content` skill | None unless a source has no transcript |
| PDF/DOCX reading and OCR | Hermes document skills | None for supported documents |
| X/Twitter access | Hermes `xurl` skill | Credential setup later; no wrapper |
| File/folder/URL/sitemap/RSS import and watching | OpenViking `add-resource` | None |
| Semantic retrieval and full reads | Hermes native OpenViking provider | None |
| Knowledge memory | Hermes `viking_remember` | None |
| Source identity, checksum, posted/captured dates, lineage | Not Crypto-specific natively | One small provenance envelope |
| Duplicate prevention and replay-safe migration | Not guaranteed by generic resource import | One deterministic content-ID rule |
| User-visible ingest receipt and failure state | Not Crypto-specific natively | One small receipt contract |

## Canonical provenance envelope

Each original source is represented once as a human-readable source resource. Each Crypto event/insight is a separate child resource linked to that source. OpenViking indexes both directly; there is no second metadata database. This distinction matters because the legacy data contains multiple events derived from some of the same URLs.

The provenance block lives visibly inside the Markdown body, not in YAML front matter. Live acceptance proved that OpenViking 0.4.11 removes front matter while parsing a resource; body-visible YAML is retained in exact reads and remains searchable. This is a thin formatting rule, not a change to Hermes or OpenViking.

Dead absolute paths from the old VPS are rewritten only in the semantic packet copy to stable `legacy-export://root/crypto-intel/...` references. The preserved original file remains unchanged and recoverable through its archive reference and SHA-256 checksum.

Required fields:

```yaml
schema: mark.crypto.source/v1
source_id: sha256:<normalized-source-url-or-file-digest>
legacy_event_id: optional
source_type: article|youtube|x|instagram|pdf|document|audio|video|note
source_url: optional
source_label: optional legacy reference when no absolute URL exists
source_channel: optional
captured_at: RFC3339
posted_at: optional RFC3339/date
original_sha256: optional for files
original_filename: optional
archive_ref: optional owner-only file reference
extraction_method: native Hermes/OpenViking capability name
extraction_status: complete|partial|failed
language: optional
tags: []
```

Each derived event uses schema `mark.crypto.event/v1`, retains its unique `event_id`, and links to exactly one `source_id`. Its body contains the event summary, raw supporting text, key insights, entities, categories, relevance, notes, and explicit links to related event/source IDs. The source resource holds the preserved title, transcript/text, and media metadata. The original binary remains in owner-controlled storage and is referenced by checksum; large MP4/MP3 files are not duplicated inside semantic memory.

## Idempotency

1. Normalize a URL by lowercasing the host, removing fragments and known tracking parameters, sorting remaining query parameters, and preserving the path.
2. URL-backed `source_id` is SHA-256 of the normalized URL.
3. File-backed `source_id` is SHA-256 of the original bytes.
4. Legacy non-URL source labels use SHA-256 of a case-folded, whitespace-normalized label; they are never misrepresented as URLs.
5. `event_id` is the preserved legacy event ID during migration; new events use SHA-256 of the source ID plus normalized event content and event date.
6. Before import, look for the exact source/event ID. A match updates only through an explicit revision path; it never silently creates a duplicate.
7. Every attempt writes a non-secret receipt containing status, source ID, event IDs, OpenViking URIs, timestamps, checksum, and error class.

## Preserved legacy dataset — observed read-only

- 295 Crypto files totaling approximately 1.77 GB.
- 66 current structured event JSON records with unique IDs. Their source field contains 41 real URLs (39 unique), 24 legacy text labels (7 unique), and one empty value recoverable from raw text. The migration therefore plans 47 source resources linked to 66 event/insight resources; de-duplication must not collapse those events.
- Transaction-consistent `intel.db` with 66 events, 41 drafts, 16 pinned summaries, 107 quiz questions, 23 answers, 15 quiz sessions, and one theme.
- 30 transcript/document files, 15 conversation archives, and approximately 1.76 GB of archived source/metadata files.
- The old OpenClaw vector database is empty and is not a migration source.

Canonical migration order:

1. Cross-check the 66 current events against the consistent SQLite snapshot. The database is canonical because seven `my_notes` values differ from the JSON copies and likely represent later user edits.
2. Build one source packet per unique source, then one linked event packet per canonical event.
3. Attach/ingest the referenced transcript or source text when present. All 18 non-empty transcript references can be reconciled from the preserved export after normalizing old absolute/home-relative paths.
4. Preserve original media by checksum and owner-only archive reference.
5. Import packets into the Crypto namespace through OpenViking's native resource path.
6. Reconcile exact counts, IDs, checksums, source coverage, and retrieval before any cutover.

Historical event-backup folders, OpenClaw runtime state, cookies, credentials, raw sessions, conversation archives, generated drafts, and quizzes are preserved but excluded from automatic semantic import. They can be migrated later only for a defined product use case.

## Acceptance gate before importing legacy content

1. **Passed:** fixture-based tests prove URL normalization, file hashing, envelope validation, and pre-storage duplicate skipping.
2. **Passed:** one non-sensitive native URL plus document, transcript, and linked-event fixtures ingested through Hermes's real OpenViking provider.
3. **Passed:** fixtures were retrievable by exact source/event ID, source URL, date, and marker.
4. **Passed:** every result read back with its complete body-visible provenance envelope.
5. **Passed:** replay was skipped by deterministic identity before storage, leaving one canonical copy.
6. **Passed:** a failed extraction receipt contains an error class and no false-success URI.
7. **Passed at the provider layer:** checksum backup and disposable restore acceptance completed before this fixture run.
8. **Passed:** the exact fixture namespace, acceptance-only session, and staging were removed.
9. **Passed:** the canonical 66-event migration build reports 47 sources, 113 total packets, 18 of 18 transcripts extracted, and zero failures without writing to V2.
10. **Pending:** only after Darshan reviews and approves the final reconciliation may client records be imported.

## Deferred decisions

- Telegram bot cutover and allowed-user policy.
- Fresh X authentication and whether paid X API access is justified.
- Speech-to-text fallback for videos with no transcript.
- Binary archive location on the same VPS and encrypted off-server backup destination.
- Crypto timeline/dashboard visual design and the eventual `intel.forkedbrain.fyi` cutover.

These are intentionally deferred because none is required to validate the provenance core.
