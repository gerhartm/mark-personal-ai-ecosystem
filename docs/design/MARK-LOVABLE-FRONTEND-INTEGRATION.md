# Mark Lovable Frontend Integration

**Prepared:** 2026-09-02

**Product:** Crypto Intelligence

**Status:** accepted in production, with Mark's literal Lovable component port and response-quality completion in release `20260904T150300Z`

## Purpose

This release replaces the previous dashboard navigation and primary views with the interface direction Mark created in Lovable. It preserves the existing verified backend, Hermes, OpenViking, Telegram synchronization, authentication, database, source identities, history, and deployment boundaries.

The Lovable export is a design and interaction reference. Its sample records are not application data.

## Source material

The preserved Lovable export lives at:

```text
01-Source-Material/lovable/Timeline-Tales-20260903T190325/
```

The earlier preserved export remains at `01-Source-Material/lovable/Timeline-Tales/` for comparison. Neither reference directory is imported by the production application. The active React application contains only the matching components connected to the existing Crypto Intelligence API.

## Active information architecture

| Position | View | Purpose | Data source |
|---|---|---|---|
| 01 | Topics | Browse themes already present in the corpus | Stored event tags, events, sources, and claims |
| 02 | Timeline | Inspect unique events and every dated reference across all available years | Stored event dates and resolved connections |
| 03 | Prep | Prepare for speaking from a question and selected corpus topics | Structured Hermes generation with bounded evidence, uncertainty, and exact sources |
| 04 | Haseeb bot | Generate in Haseeb's supplied creator reference | Existing Creator Reference lens, Hermes, stored evidence, and citations |
| 05 | Tarun bot | Generate in Tarun's supplied creator reference | Existing Creator Reference lens, Hermes, stored evidence, and citations |

Topic detail is the only nested user-facing route. Previous dashboard screens and utility routes remain preserved in source where needed by backend contracts, but are not exposed through routing or navigation.

## Mark feedback translated into product behavior

### Evidence first homepage

Topics is now the first view. It contains no generated watchlist, rating, action list, or speculative daily summary. Each topic count is computed from the active database.

### Preserved evidence behavior

Topic detail presents real claims and their speakers, source types, source counts, date windows, related tags, and stance distribution. The source layer still retains the bounded overview, original provenance, full text when available, and canonical identities needed by Prep and creator generation.

### Historical timeline

Timeline is not restricted to the current year. The year control is generated from every stored date. Each event row identifies its category, precision, unique event identity, distinct supporting-source count, and a key takeaway drawn from stored source material. Opening a row shows what happened, why it matters, the source context, the supporting source, and the original link when available.

### Grounded generation

The underlying Ask and Studio contracts remain evidence bounded. Responses require plain language, named sources, canonical citations, and explicit labels for interpretation or uncertainty. Failed provider calls are shown as failures and are never converted into invented answers. Ask remains available to approved non-frontend clients but is not a separate screen in Mark's five-screen interface.

### Source-led creation

Prep follows Mark's Lovable interaction and generates from the real corpus through a structured output contract. Haseeb bot and Tarun bot combine topic evidence with retained creator-specific material, while keeping evidence IDs and source details outside the publishable copy. No separate Studio or Creator Reference tab is exposed.

### Publishable output formats

The backend retains its validated contracts for X posts, X threads, LinkedIn posts, speaking preparation, month review, and year review. The five-screen interface adds stricter structured contracts for Prep and the two creator bots. It enforces requested output count, requested length, real post shape, source resolution, exact quotations, plain-language evidence notes, and append-only revisions before saving. The visible interface exposes only the controls and output states in Mark's Lovable design.

### Light and dark themes

Mark's visual hierarchy, routes, typography, spacing, and interaction model remain unchanged. A persistent switch in the navigation rail selects light or dark mode. With no saved choice, the interface starts in light mode to match Mark's design. A saved choice persists across sessions. Both themes use the same semantic color tokens, accessible focus indicators, and restrained accent behavior.

### Preserved Quiz capability

Evidence-linked Quiz generation, grading, model answers, and history remain available in the backend, but Quiz is not exposed as a separate frontend screen.

## Removal of Lovable sample content

The following are deliberately absent from the active application:

- seeded event arrays;
- generated random mention counts;
- the 64-event Lovable timeline;
- seeded Haseeb and Tarun demo responses;
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
| `POST /api/prep` | Returns a structured overview, supporting points, uncertainty, direct quotes, and exact sources |
| `POST /api/creator` | Returns validated Haseeb or Tarun outputs, evidence cards, and append-only revisions |

Migration `007 ask_history` adds the successful Ask history table. It is forward only and runs against the existing single database.

## Verification completed

- Web TypeScript check passed.
- Server TypeScript check passed.
- Web production build passed.
- Server production build passed.
- All 91 automated server tests passed.
- Desktop routes at 1440 by 1000 passed visual and interaction checks.
- Mobile routes at 390 by 844 passed navigation and horizontal overflow checks.
- All 54 browser acceptance checks passed for Topics, topic detail, Timeline, Prep, Haseeb bot, Tarun bot, creator revision, creator format changes, requested lengths, evidence, theme switching, and mobile navigation.
- Browser checks produced zero JavaScript page errors and zero console errors.
- Source scan found no Lovable demo records, fake totals, seeded timeline text, or em dash characters in active application source.
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

Release `20260903T163620Z` makes the freshest preserved Lovable source the literal frontend specification. The production application exposes the same five primary screens in the same order: Topics, Timeline, Prep, Haseeb bot, and Tarun bot. It preserves the Lovable shell, labels, typography, widths, spacing, borders, controls, charts, output states, feedback controls, citations, and responsive structure. Dark mode is the only intentional visual addition.

Lovable sample content and mock generation remain excluded. Every screen uses the existing production APIs, database, Hermes generation boundary, source identities, and citations. Extra legacy product routes are not exposed in the frontend. Release `20260903T163620Z` remains the immediate application rollback for the response-quality completion release. Candidate `20260903T162235Z` was superseded after interactive browser testing exposed a navigation cleanup defect and is not an accepted rollback target.

## Response-quality completion

Release `20260904T141918Z` completes the behavior behind Mark's five-screen design without changing its visible information architecture. Prep now returns readable synthesis instead of disconnected facts, gives every point a concrete limitation, and exposes exact supporting sources and quotes. Timeline source reading removes raw Markdown artifacts and keeps context concise. Topic evidence links to the original source when available.

Haseeb bot and Tarun bot now use creator-specific retained material alongside the selected crypto evidence. Their server contract enforces the chosen format, count, tone, and length, prevents internal evidence IDs from leaking into publishable copy, keeps citations in Works cited, and preserves the prior draft during revision.

The release passed 91 automated server tests and 53 interactive Chrome checks on local, canary, and production builds. A disposable canary also passed bounded real Hermes checks for a five-point Prep brief, a Haseeb post and revision, and a 314-word Tarun article. Those checks confirmed readable writing, resolved evidence, requested lengths, creator-specific generation, and no raw Markdown or internal citation markers in publishable copy. Canary test drafts were discarded before production promotion.

Release `20260904T150300Z` adds the final creator-state boundary found during source review. Changing a creator workflow between tweet and blog now clears incompatible prior output, while a completed result continues to render in its original format until that change is made. The current release passed all 54 Chrome checks locally, in an isolated canary, and in production without additional paid model calls.

The live image is `mark-crypto-dashboard:20260904T150300Z`. The stopped immediate rollback is `crypto-dashboard-rollback-20260904T141918Z`, and the verified pre-promotion database backup is `/srv/mark-v2/crypto-dashboard/backups/pre-20260904T150300Z/crypto-intelligence.db`. Cloudflare, Hermes, OpenViking, Satoshi, ForkedBrain, and the legacy Intel service were not changed.
