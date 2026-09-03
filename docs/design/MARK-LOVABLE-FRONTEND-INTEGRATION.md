# Mark Lovable Frontend Integration

**Prepared:** 2026-09-02

**Product:** Crypto Intelligence

**Status:** accepted in production, with the literal Lovable component port in release `20260903T131714Z`

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

Source detail shows a bounded overview, up to six distinct key arguments, the retained source text when available, linked events and claims, original provenance, and a source-scoped Ask panel. A source-scoped question sends only the selected source record as the initial evidence boundary.

### Historical timeline

Timeline is not restricted to the current year. The year control is generated from every stored date. Each event row identifies its category, precision, unique event identity, real reference count, and a key takeaway drawn from stored source material. Opening a row shows what happened, the source context, key evidence, the full event, the supporting source, and the original link when available.

### Grounded Ask

Ask renders Markdown, preserves successful questions and answers in searchable history, shows clickable inline canonical citations, and links each record back to the underlying event or source. Its response contract requires a direct answer first, plain language, named sources, evidence immediately after meaningful claims, and explicit labels for interpretation or uncertainty. Failed provider calls are shown as failures and are never converted into invented answers.

### Source-led creation

Prep, Studio, and Creator Reference allow Mark to browse real corpus topics, search, and select up to 12 real sources before generation. Leaving the selection empty keeps bounded automatic evidence selection. Review formats require an explicit date range.

### Publishable output formats

Studio separates a single X post from an X thread. The X post contract limits output to one publishable post of at most 280 characters excluding citations. The thread contract produces 5 to 7 numbered posts with the same per-post limit. LinkedIn, speaking preparation, month review, and year review retain their own contracts. The server checks format and citation requirements before saving and performs at most one bounded correction pass when needed.

### Light and dark themes

Mark's visual hierarchy, routes, typography, spacing, and interaction model remain unchanged. A persistent switch in the navigation rail selects light or dark mode. With no saved choice, the interface follows the operating system preference. Both themes use the same semantic color tokens, accessible focus indicators, and restrained accent behavior.

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
| `GET /api/sources/:id` | Returns structured source detail, a bounded research brief, and retained OpenViking text when available |
| `POST /api/ask` | Accepts optional `source_ids` and stores successful cited answers |
| `GET /api/ask/history` | Returns searchable successful Ask history |
| `POST /api/studio/drafts` | Accepts optional `source_ids`, supports `x_post`, and requires periods for review formats |
| `GET /api/timeline` | Returns source provenance, real reference counts, key source takeaways, and source context |

Migration `007 ask_history` adds the successful Ask history table. It is forward only and runs against the existing single database.

## Verification completed

- Web TypeScript check passed.
- Server TypeScript check passed.
- Web production build passed.
- Server production build passed.
- All 87 automated server tests passed.
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

## Production acceptance

Release `20260902T073200Z` passed the isolated canary and guarded production promotion on 2026-09-02. Production contains 65 real topics, 54 real sources, 66 canonical events, 89 media assets, and seven ready Telegram synchronization records. The default 2026 timeline renders 42 unique events across 564 dated references and 112 readable rows.

The production browser pass confirmed the complete evidence workflow on desktop and mobile: Topics, Aave topic detail with 39 extracted claims, historical Timeline, Timeline evidence dialog, all four requested source filters, retained source text, source-scoped Ask, searchable Ask history, 30 available Studio source choices, Creator Reference without demo creators, eight preserved quiz questions with eight model-answer reveals, and responsive navigation without horizontal overflow. It produced zero page or console errors.

The live container is `mark-crypto-dashboard:20260902T073200Z`, runs as the non-root `dashboard` user, has a read-only root filesystem, drops all Linux capabilities, uses `no-new-privileges`, publishes only `127.0.0.1:9330`, and had zero restarts at acceptance. The previous release remains stopped as `crypto-dashboard-rollback-20260811T132229Z`. The verified pre-promotion database backup is `/srv/mark-v2/crypto-dashboard/backups/pre-20260902T073200Z/crypto-intelligence.db`.

Public acceptance also passed: unauthenticated Crypto requests redirect to Cloudflare Access, HTTP redirects to HTTPS, and `intel.forkedbrain.fyi` remains HTTP `200` and unchanged. No paid model call was used during deployment acceptance.

## Evidence and theme completion release

Release `20260902T084905Z` completed the product behavior behind Mark's accepted frontend without changing its information architecture. It added bounded source briefs, clear event presentation fields, inline evidence links in Ask and source-scoped Ask, topic-guided Studio source selection, publishable-format enforcement, and the persistent light and dark theme switch.

The immutable image passed 87 automated server tests, server and web type checks, both production builds, dependency audits with zero production vulnerabilities, shell syntax checks, and an isolated canary against a copied production database. Production acceptance verified Mark and Mari identity access, 54 sources, 66 events, 89 media assets, source and event presentation contracts, timeline coverage from 2000 through 2026, theme assets, seven ready synchronization jobs, SQLite quick and integrity checks, zero foreign-key violations, non-root and read-only container hardening, loopback-only publication, and zero restarts. No paid model call was used.

The live image is `mark-crypto-dashboard:20260902T084905Z`. The stopped predecessor is `crypto-dashboard-rollback-20260902T073200Z`. The verified pre-promotion database backup is `/srv/mark-v2/crypto-dashboard/backups/pre-20260902T084905Z/crypto-intelligence.db`. Cloudflare, Hermes, OpenViking, ForkedBrain, and `intel.forkedbrain.fyi` were not changed.

## Literal Lovable component port

Release `20260903T131714Z` makes the preserved Lovable source the literal frontend specification. The production application exposes the same five primary screens in the same order: Topics, Timeline, Prep, Haseeb bot, and Tarun bot. It preserves the Lovable shell, labels, typography, widths, spacing, borders, controls, charts, output states, feedback controls, citations, and responsive structure. Dark mode is the only intentional visual addition.

Lovable sample content and mock generation remain excluded. Every screen uses the existing production APIs, database, Hermes generation boundary, source identities, and citations. Extra legacy product routes are not exposed in the frontend. The live image is `mark-crypto-dashboard:20260903T131714Z`, the stopped predecessor is `crypto-dashboard-rollback-20260903T131101Z`, and the verified pre-promotion database backup is `/srv/mark-v2/crypto-dashboard/backups/pre-20260903T131714Z/crypto-intelligence.db`. No Cloudflare, Hermes, OpenViking, ForkedBrain, or legacy Intel configuration changed.
