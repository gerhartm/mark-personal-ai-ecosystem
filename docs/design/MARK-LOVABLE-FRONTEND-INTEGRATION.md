# Mark Lovable Frontend Integration

**Prepared:** 2026-09-02

**Product:** Crypto Intelligence

**Status:** implementation complete, production release pending

## Purpose

This release replaces the previous dashboard navigation and primary views with the interface direction Mark created in Lovable. It preserves the existing verified backend, Hermes, OpenViking, Telegram synchronization, authentication, database, source identities, history, and deployment boundaries.

The Lovable export is a design and interaction reference. Its sample records are not application data.

## Source material

The preserved Lovable export lives at:

```text
01-Source-Material/lovable/Timeline-Tales/
```

The original archive is retained outside the active project workspace at:

```text
_quarantine/Timeline Tales.zip
```

Neither location is imported by the production application. The active React application contains only components connected to the existing Crypto Intelligence API.

## Active information architecture

| Position | View | Purpose | Data source |
|---|---|---|---|
| 01 | Topics | Browse themes already present in the corpus | Stored event tags, events, sources, and claims |
| 02 | Timeline | Inspect unique events and every dated reference across all available years | Stored event dates and resolved connections |
| 03 | Sources | Read supplied material by requested source type | Stored sources, OpenViking content, extracted events, and claims |
| 04 | Ask | Ask Hermes and inspect evidence plus searchable question history | Hermes, bounded structured evidence, OpenViking, and `ask_history` |
| 05 | Prep | Prepare for speaking from chosen sources and date windows | Studio generation contract with the Mark writing lens |
| 06 | Studio | Create X posts, X threads, LinkedIn posts, and review briefs from selected evidence | Hermes, selected sources, citations, and append-only drafts |
| 07 | Creator reference | Generate in a supplied creator reference style without changing evidence | Existing Creator Reference lens and shared memory |
| 08 | Quiz | Test knowledge and reveal a model answer for comparison | Stored evidence, Hermes generation and grading, quiz history |

Utility routes remain available for Add Source, History, Settings, event detail, source detail, draft detail, and existing saved records.

## Mark feedback translated into product behavior

### Evidence first homepage

Topics is now the first view. It contains no generated watchlist, rating, action list, or speculative daily summary. Each topic count is computed from the active database.

### Useful source reading

Source detail shows extracted summary material, the retained source text when available, linked events and claims, original provenance, and a source-scoped Ask panel. A source-scoped question sends only the selected source record as the initial evidence boundary.

### Historical timeline

Timeline is not restricted to the current year. The year control is generated from every stored date. Each event row identifies its category, precision, unique event identity, and real reference count. Opening a row shows what happened, why it matters when that field exists, source context, the full event, the supporting source, and the original link when available.

### Grounded Ask

Ask renders Markdown, preserves successful questions and answers in searchable history, shows the exact evidence records, and links each record back to the underlying event or source. Failed provider calls are shown as failures and are never converted into invented answers.

### Source-led creation

Prep, Studio, and Creator Reference allow Mark to search and select up to 12 real sources before generation. Leaving the selection empty keeps bounded automatic evidence selection. Review formats require an explicit date range.

### Publishable output formats

Studio separates a single X post from an X thread. The X post contract limits output to one publishable post of at most 280 characters excluding citations. The thread contract produces 5 to 7 numbered posts with the same per-post limit. LinkedIn, speaking preparation, month review, and year review retain their own contracts.

### Quiz comparison

Every unanswered question has a Reveal model answer control. After grading, the model answer is shown with the submitted answer and Hermes feedback.

## Removal of Lovable sample content

The following are deliberately absent from the active application:

- seeded event arrays;
- generated random mention counts;
- the 64-event Lovable timeline;
- Haseeb and Tarun demo bots;
- fabricated creator responses;
- placeholder dashboards, ratings, watchlists, or recommendations;
- sample source totals and fake status numbers;
- Lovable local storage as a data source.

All visible totals are read from production APIs. The only fixed values are interface limits and validated product rules, such as five default quiz questions, 12 selectable evidence sources, and X character limits.

## API additions and changes

| Route | Behavior |
|---|---|
| `GET /api/topics` | Returns real topics with event counts, source counts, latest dates, and signal values |
| `GET /api/topics?tag=<tag>` | Returns the selected topic, its events, sources, and extracted claims |
| `GET /api/sources/:id` | Returns structured source detail and retained OpenViking text when available |
| `POST /api/ask` | Accepts optional `source_ids` and stores successful cited answers |
| `GET /api/ask/history` | Returns searchable successful Ask history |
| `POST /api/studio/drafts` | Accepts optional `source_ids`, supports `x_post`, and requires periods for review formats |
| `GET /api/timeline` | Returns source provenance, real reference counts, business signal, and source context |

Migration `007 ask_history` adds the successful Ask history table. It is forward only and runs against the existing single database.

## Verification completed

- Web TypeScript check passed.
- Server TypeScript check passed.
- Web production build passed.
- Server production build passed.
- All 86 automated server tests passed.
- Desktop routes at 1440 by 1000 passed visual and interaction checks.
- Mobile routes at 390 by 844 passed navigation and horizontal overflow checks.
- Topic search, topic detail, timeline modal, source detail, evidence selection, Creator Reference, quiz model answers, and mobile navigation passed browser interaction checks.
- Browser checks produced zero JavaScript page errors and zero console errors.
- Source scan found no Lovable demo names, fake totals, seeded timeline text, or em dash characters in active application source.
- Production dependency audit found zero known vulnerabilities.

## Deployment and rollback

The release follows the existing guarded process:

1. Build a new immutable image.
2. Copy the active database into an isolated canary directory using SQLite backup.
3. Start the canary on loopback port `9331` with the same security restrictions as production.
4. Verify Cloudflare identity enforcement, database migrations, integrity, Hermes, OpenViking, Studio, Quiz, and Telegram synchronization boundaries without making a paid model call.
5. Create a fresh production database backup.
6. Retain the previous production container and image as rollback assets.
7. Promote the new image on loopback port `9330`.
8. Verify local authenticated routes and the existing public Cloudflare Access boundary.
9. Confirm that `intel.forkedbrain.fyi` remains unchanged.

Rollback restores the retained previous container and its matching database backup. No DNS, tunnel, Access policy, Hermes source, OpenViking source, or legacy Intel service change is required for this frontend release.
