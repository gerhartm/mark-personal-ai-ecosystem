# Crypto Intelligence V2: Dashboard Design and Technical Proposal

**Prepared:** 2026-08-03
**Revision:** 5, architecture simplified to one active database. Revisions 1 through 4 are superseded in full.
**Status:** proposal for Darshan's approval. Nothing has been built, deployed, or changed.
**Scope source:** `docs/migration/CLAUDE-CODE-DASHBOARD-HANDOFF.md`, `docs/migration/CRYPTO-V2-INGESTION-DESIGN.md`, `docs/infrastructure/RUNBOOK.md`, the frozen handoff database, and the preserved legacy application.

## What changed in revision 5

The two-database design is retired. One active SQLite database, **`crypto-intelligence.db`**, is the system of record: migrated corpus, all newly ingested intelligence, note and draft revision history, quizzes, conversations, media metadata, canonical identity mappings, receipts and audit history, and one unified FTS index. It is initialised from the immutable verified handoff and evolved by forward migrations. The frozen handoff stays untouched as the verified migration and rollback source.

Removed: the `projection.db` and `app.db` split, `ATTACH`, temp union views, cross-database integrity logic, and multiple FTS indexes. Two corrections from revision 4 are now moot rather than solved, which is the better outcome: persistent views are legal because nothing is attached, and there is no score-merging problem because there is one index. Real foreign keys are enforced by SQLite again. Section 9 is the whole story and is now short.

What this concentrates rather than removes: the active database is the only copy of everything captured after migration, so the backup and a tested restore are the protection. That is stated in 9.4 and gated in Phase 8.

Everything else stands: Hermes is the central brain, it queries through narrow read-only tools and uses OpenViking for semantic memory, and the authenticated backend performs authorized writes.

## Corrections carried forward from earlier revisions

Retired with the two-database design: connection-scoped union views, cross-database integrity logic, and the two-index search merge. Those problems no longer exist rather than being solved.

Still in force, each documented in its own section:

- **Hermes is the intelligence plane**, not a generation layer. The backend plans no retrieval, ranks nothing, assembles no context. Section 7.
- **Transport is Hermes native JSON-RPC and WebSocket on 9119** over the private internal network. Port 8642 is closed on the deployed instance. Section 7.3.
- **MCP is read only.** The acting-user credential never enters prompts, memory, tool arguments, transcripts, traces, or logs, so mutations flow through the authenticated browser or a typed action intent. Section 7.5.
- **Telegram writes and ingestion are deferred** until gateway sender identity is securely mapped to an authorized user. Section 7.6.
- **OpenViking is append only.** No resource is updated in place. Section 8.4.
- **The eleven-label taxonomy is stored and displayed verbatim.** The four colour families are a visual lens only. Section 4.


## 0. What the data actually says

Every design decision below is derived from an inspection of the frozen handoff, not from a dashboard template. Six findings changed the design.

**Finding 1: capture time is degenerate, subject time is the real chronology.**
59 of 66 events were captured in May 2026 (April 4, June 1, July 2). A timeline built on `events.timestamp` is a single vertical spike. The 174 `discussed_date` facets span **2000 to 2026-06-17** with real distribution (2026-04: 37, 2026-05: 54, 2026-03: 7, plus a long historical tail). Subject time becomes the primary axis. Capture time becomes a secondary rail.

**Finding 2: the dates carry mixed precision, so timeline marks must encode precision.**
Of 174 pins: 81 day, 40 month, 32 year, 21 quarter. A "2021" pin is a band, not a point. Rendering all of them as identical dots would assert a precision the data does not have.

**Finding 3: Mark's own notes are the highest-value layer.**
53 of 66 events carry `mark_notes`. By contrast `detailed_notes` exists on only 5 events, `detailed_content` on 47, `underlying_principle` on 61, `video_metadata_json` on 7, `posted_date` on 2. His annotations are the densest signal in the corpus and belong in the list views, not buried in a detail pane. Every other field needs a designed absent state.

**Finding 4: there is a real graph, and it has 7 broken edges.**
107 `connection` facets link event to event; **100 resolve, 7 point at events not in the corpus**. There are 66 entity objects holding 176 distinct protocols, 119 people, 74 tokens, 20 chains, 388 figures. The legacy relatedness rule (two or more shared entities) is sound and worth keeping. The 7 unresolved edges need an explicit product treatment, not a silent drop.

**Finding 5: the taxonomy has 11 labels, which is too many to encode in colour.**
Primary categories: narrative 18, defi_mechanics 16, exploit_incident 7, governance 5, macro 5, regulatory 5, funding 4, protocol_launch 4, infrastructure 2. Secondary and discussed-date categories add tokenomics and partnerships. Eleven hues are not distinguishable and the palette validator confirms no set above four clears the separation floors on this surface. The response is a four-family **visual grouping**. The taxonomy itself is untouched.

**Finding 6: the corpus is small, which sets expectations but not architecture.**
66 events, 47 sources, 1,612 facets, 41 drafts, 15 quiz sessions, 16 pins, 13 conversations, 89 media files. Small enough that the home screen should be a briefing rather than a metrics wall, and small enough that Hermes can answer usefully from structured tools alone while OpenViking memory is empty. That fallback is a temporary operating mode, not the design.

**Coverage gaps worth surfacing in the product:** 13 events have no notes from Mark, 15 of 66 events sit outside the single theme, 26 events have never appeared in a quiz, 7 connections are unresolved, only 16 of 89 media assets are referenced by an event.

## 1. Information architecture and navigation

### The organizing principle

The legacy application was organized by tool: Ask, Timeline, Themes, Quiz, Content Studio, plus an orphaned ClusterMap route missing from the navigation. V2 is organized by the job being done, and asking is treated as a mode rather than a destination, because Mark asks questions from inside whatever he is looking at.

### Primary destinations

| Destination | The job | Intelligence owner |
|---|---|---|
| **Brief** | Re-enter the corpus and know what to work on | Hermes writes the narrative; the backend reads the counters |
| **Timeline** | See when things happened and when you learned them | Backend reads only, no generation |
| **Library** | Find any object by any attribute | Backend reads only, no generation |
| **Connections** | See what links to what | Backend reads only; Hermes explains a relationship on request |
| **Studio** | Turn what you know into something you can say | Hermes generates and cites; the backend persists |
| **Recall** | Keep it in your head | Hermes generates and evaluates; the backend persists |
| **Archive** | Read the preserved assistant history | Backend reads only |

Rail grouping, which keeps the primary set to four:

```text
WORK        Brief · Timeline · Library · Connections
PRODUCE     Studio · Recall
HISTORY     Archive · Settings
```

The split is deliberate. Browsing, filtering, sorting, reading, and note taking are database access and stay in the backend, so the dashboard keeps working when Hermes restarts. Anything that reasons, synthesizes, or explains goes to Hermes without exception.

### Object routes

`/event/:id`, `/source/:id`, `/theme/:id`, `/draft/:id`, `/session/:id`, `/media/:archive_ref`. Every object is deep linkable inside the authenticated app, and every citation anywhere in the product resolves to one of these routes. Canonical IDs from the handoff are the route keys, so provenance and URL are the same thing.

### Ask as a surface, not a page

A single command surface opens on `Cmd/Ctrl + K` from every screen and accepts three input classes: navigation, search, and questions. Navigation and search resolve locally against the backend. Questions open a docked panel and are relayed to Hermes. A full-page `/ask` route exists for long sessions and for muscle memory from the legacy default landing.

### Navigation rules

- Current location is always visible in the rail and repeated as a breadcrumb inside object views.
- Filters live in the URL. Back restores scroll position and filter state.
- Any filter combination can be named and pinned to the rail as a saved view.
- Mobile uses a bottom tab bar of five (Brief, Timeline, Library, Ask, More) with detail views as full-height sheets.

### Room for the other branches

The shell carries a workspace selector that currently shows only Crypto. Workspace identity is a required parameter on every API route and every tool call from day one, so AI Tooling and Real Estate can attach later without data from one branch reaching another. On the Hermes side the same separation is carried by branch skills and Telegram topics, which is the pattern already chosen for this ecosystem.

## 2. Primary user journeys

**J1. Morning re-entry.** Open Brief. The counter strip is instant because it is a database read. The standing narrative from Hermes loads beside it with its generated-at stamp. Scan high-signal events, notice "13 events have no notes from you", open one, write a note.

**J2. Panel preparation.** Ask Hermes to assemble material for a topic, or start from a filter and save the selection as a collection. Open Studio with that collection, generate a `speaking_prep` draft through Hermes, review each citation against its event, edit, save a revision, copy out.

**J3. Evidence recovery under time pressure.** `Cmd+K`, type the half-remembered claim. If it is lexical, the local search answers instantly. If it needs reasoning, Hermes answers with numbered citations, and citation two opens the event and its transcript.

**J4. Chronological orientation.** Timeline, subject-time axis, brush the 2026-04 to 2026-06 window, filter to a category, read the arc, then flip to capture time to see the order in which he learned it. No model involved.

**J5. Connection discovery.** Connections, focus an entity, raise the shared-entity threshold, see the cluster, open the paired table, and optionally ask Hermes to explain why two events are linked.

**J6. Retention loop.** Recall. Hermes generates questions from the corpus and evaluates answers with evidence; the backend persists sessions, answers, and event links. Weak areas flow back into the Brief.

**J7. Capture, dashboard only in this release.** Mark hands a link or file to the dashboard on his verified session. Hermes extracts, builds the provenance envelope, and returns a typed ingestion intent; the backend validates it, writes the canonical record, seals the media, and records a receipt; Hermes stores the semantic copy in its own memory. The new source appears in the interface within seconds. The same journey originating in Telegram is designed for and deliberately deferred: see section 7.6.

**J8. Archive lookup.** Search the preserved conversations, follow references to the events they mention. Read only by design.

## 3. Screen-by-screen structure

Each screen states one job, one primary action, and its full state set. Every component ships default, hover, focus, active, disabled, loading, empty, and error states. Screens that depend on Hermes additionally ship the three availability states defined in section 7.

### Brief

*Job: in thirty seconds, re-enter the corpus and know what to work on.*

1. **Ambient header.** Theme title and through-line as the hero statement, with corpus scale stated plainly. The only screen with the ambient 3D field.
2. **State strip.** Deterministic counters read from the database: 66 events, 47 sources, subject range, coverage gaps. Always available, never blocked on Hermes.
3. **Standing brief.** A short narrative written by Hermes: what matters now, what to revisit, what is unresolved. Rendered on the generated surface with model and generated-at stamp. Refreshed on demand and on a schedule using Hermes-native cron, not a new scheduler.
4. **Resume row.** Last event viewed, last draft edited, last quiz session.
5. **High signal.** Significance 4 and 5 events (32 of 66) with an excerpt of Mark's own note where one exists.
6. **Gaps.** Four counters linking into pre-filtered Library views: no notes (13), outside the theme (15), never quizzed (26), unresolved connections (7).

Primary action: Ask. If Hermes is unavailable, items 1, 2, 4, 5, and 6 render normally and item 3 shows its unavailable state with the last successful narrative and its age.

### Timeline

*Job: see when things happened and when you learned about them.*

Filter row above everything it scopes. Context band (compressed 2000 to 2025) above a focus band (expanded current window), joined by a brush. Precision encoded in mark geometry: day precision is a point, month, quarter, and year are bands whose width is the real interval, with precision also stated in text. Lanes grouped by category family with the exact leaf category labelled in text. A thin capture rail exposes the May ingest cluster rather than hiding it. A synchronised virtualised list shares the brush selection.

Rendered in SVG and Canvas. No WebGL, no model involvement.

### Library

*Job: find any object by any attribute.*

A segmented scope control switches between Events, Sources, and Media. Table view is the default because 66 rows are directly comparable.

- **Events:** significance meter, subject date, capture date, title, exact category, source, insight count, note flag, media flag.
- **Sources:** type, channel, title, captured, event count, media count.
- **Media:** kind, size, checksum status, linked event, authorised preview or stream. 22 video and 14 audio files total roughly 1.6 GB, so playback streams with range requests and never preloads.

Any filter state can be saved as a named view and pinned to the rail.

### Event detail

*Job: understand one event completely and be able to prove it.*

Two columns above 1200 pixels, single column below, reading measure near 68 characters.

Reading column: title, subject and capture dates, exact category and any secondary category, significance meter, summary, **Mark's notes** as an inline editable block with revisions, detailed content, raw source text collapsed by default, transcript link.

Evidence rail: source card, key insights, entities grouped as chains, protocols, tokens, people, figures, discussed dates as a mini timeline, connections with shared-entity counts, pinned summaries, quiz appearances, media.

**Provenance is carried by typography.** Stored source prose is set in the serif. Interface text is the sans. Identifiers, timestamps, and checksums are the mono. Generated interpretation is set in the sans on a distinct inset surface, labelled with model and generation time. A reader can tell evidence from inference without reading a label.

Absent states are designed, not empty: 19 events have no detailed content, 61 have no detailed notes, 5 have no underlying principle, 59 have no video metadata. Unresolved connections render as a disabled reference stating that the target is not present in this corpus, with the canonical ID shown in mono.

### Source detail

Source identity and capture basis, derived events, media, outbound link marked as leaving the workspace, ingestion receipt history where one exists.

### Connections

Default view is two dimensional and fully accessible: entity co-occurrence and an event graph in Canvas, paired with a table listing every visible relationship. Controls: focus entity, entity type, edge type, and a minimum shared-entity threshold defaulting to two. A **Depth** toggle promotes the same graph into the shared Three.js scene, off by default, disabled under reduced motion or a failed capability probe. Theme view shows the through-line as prose and the 51 theme events as a numbered sequence, with the 15 unplaced events listed separately.

### Studio

Left: template (`twitter_thread`, `month_in_review`, `speaking_prep`, `linkedin_post`, `year_in_review`, plus a free brief), date range, focus, event selection. Centre: draft editor with raw and edited toggle plus revision history. Right: the citation panel with a validity indicator per citation.

Generation runs entirely in Hermes. The backend sends the request and persists the result. The 41 preserved drafts open in the same editor and a new revision never overwrites the preserved original. Export is copy to clipboard. Nothing publishes anywhere.

### Recall

Session list with resume, new session with count and weak-area targeting, and the four preserved question types (factual 34, connection 32, principle 21, cite_source 20). Hermes generates questions and evaluates answers with linked evidence; the backend persists sessions, questions, answers, and event links. Weak areas feed the Brief.

### Archive

The 13 sanitized conversation sessions and 614 messages, read only, searchable, with a banner stating that this is preserved history and that tool calls and payloads were deliberately excluded.

### Ask panel

Streaming answer, numbered citation chips resolving to canonical records, a disclosure showing which tools Hermes called and which records it read, and a persistent mode indicator naming the current intelligence availability state. Answers render on the generated surface with model and timestamp. Citations are validated against the identity register before render.

### Settings

Appearance (motion, depth, density, high contrast), data (frozen handoff checksum, projection build time, reconciliation report, semantic import status), account, about.

## 4. Design tokens and component system

### The layout concept, in one sentence

**A fixed instrument frame around a single calm reading surface.** The rail, top bar, command surface, and overlays are the translucent instrument frame. Content sits on opaque surfaces because it is read. Glass separates the frame from the work and never sits under body text.

### Colour

Named, measured, and validated against the surfaces this product actually renders on.

**Surfaces:**

| Token | Hex | Use |
|---|---|---|
| `--surface-void` | `#060D15` | Page behind everything, 3D clear colour |
| `--surface-page` | `#0A131D` | Application background |
| `--surface-panel` | `#121D28` | Rail and top bar base beneath the glass layer |
| `--surface-card` | `#182430` | Cards, tables, reading surfaces |
| `--surface-raised` | `#212E3B` | Menus, popovers, dialogs |

**Ink**, blue-biased to match the surfaces:

| Token | Hex | vs page | vs card |
|---|---|---:|---:|
| `--ink-primary` | `#EDF5FB` | 16.96:1 | 14.29:1 |
| `--ink-secondary` | `#C2CED7` | 11.66:1 | 9.82:1 |
| `--ink-muted` | `#94A0AA` | 7.00:1 | 5.90:1 |
| `--ink-faint` | `#6F7B84` | 4.31:1 | 3.63:1 |

**Accent**, one restrained cyan-blue at OKLCH hue 212, placed above the categorical lightness band so it can never be mistaken for a category:

| Token | Hex | vs page | vs card |
|---|---|---:|---:|
| `--accent-strong` | `#74D5E8` | 11.06:1 | 9.32:1 |
| `--accent` | `#34BAD2` | 8.10:1 | 6.82:1 |
| `--accent-deep` | `#009FB7` | 5.91:1 | 4.98:1 |

The accent is spent only on interaction: focus, active navigation, selection, primary action, live indicators. It is never a data series.

**Category families are a visual grouping only.**

| Family lens | Token | Hex | Exact categories it groups |
|---|---|---|---|
| Markets and narrative | `--family-narrative` | `#9085E9` | narrative, macro |
| Protocol mechanics | `--family-protocol` | `#C98500` | defi_mechanics, protocol_launch, tokenomics |
| Risk and incidents | `--family-risk` | `#D55181` | exploit_incident, infrastructure |
| Rules and capital | `--family-rules` | `#008300` | regulatory, governance, funding, partnerships |

**Binding rule, enforced by test.** `primary_category` and `secondary_category` are stored, indexed, filtered, returned by every tool, and displayed verbatim. The family exists in exactly one place: a presentation map in the frontend. No tool accepts a family as an input value or returns one in place of a category. No migration rewrites a category. A family filter expands to its exact leaf categories inside the query, and the resulting filter chips name the leaf categories, not the family. A round-trip test asserts that all eleven labels survive ingestion, storage, tool response, and display unchanged.

Validation, run with the data-visualisation palette validator against both surfaces with all pairs in play: lightness band pass, chroma floor pass, normal-vision worst pair ΔE 19.3, contrast pass on all four. One warning stands and is accepted with mitigation: green against amber measures ΔE 6.9 under protanopia, legal only with secondary encoding, and the always-present exact category label is that encoding. No five-hue set clears the floors, which is why four is a ceiling rather than a preference.

**Significance**, an ordinal cyan ramp on the accent hue, rendered as a five tick meter with the numeral always present:

`#006678` → `#008297` → `#009FB7` → `#34BAD2` → `#74D5E8`

Validator on the card surface: monotone lightness pass, adjacent gaps pass, light-end contrast 2.38:1 pass, single hue with 4 degrees of spread pass.

**Status**, a reserved channel never reused as a series colour, always with an icon and a word:

| Role | Hex | vs card |
|---|---|---:|
| good | `#0CA30C` | 4.69:1 |
| warning | `#FAB219` | 8.58:1 |
| serious | `#EC835A` | 5.97:1 |
| critical | `#D03B3B` | 3.28:1 |

Documented collision: critical against the risk family measures ΔE 9.0 to normal vision, so status always renders as a chip with an icon and a label and never as a bare dot.

### Type

One superfamily, three roles, where the axis carries meaning:

| Role | Face | Carries |
|---|---|---|
| Interface | IBM Plex Sans | Navigation, controls, tables, labels, generated interpretation |
| Reading | IBM Plex Serif | Stored source prose: summaries, detailed content, raw text, transcripts |
| Identity | IBM Plex Mono | Canonical IDs, OpenViking URIs, timestamps, checksums, byte counts |

Self hosted as woff2, subset to Latin. No external font host, which keeps the content security policy closed.

Scale: display 34/40, h1 26/32, h2 20/28, h3 16/22, body 15/24, reading 17/28, label 12/16 uppercase at 0.06em tracking, mono 13/20, micro 11/16. Reading measure 62 to 70 characters. `text-wrap: balance` on headings. `tabular-nums` only in aligned columns.

### Scales and materials

- **Spacing:** 2, 4, 8, 12, 16, 24, 32, 48, 64, 96. Layout owns spacing through flex and grid gap.
- **Radius:** three values only. 4 for controls and chips, 10 for cards and panels, 999 for pills and meters.
- **Elevation:** three levels sharing one top light direction, expressed on dark as a hairline border, a one pixel inner top highlight, then a soft shadow.
- **Glass material:** `--glass-frame` at `rgba(18,29,40,0.62)` with `backdrop-filter: blur(20px) saturate(140%)`, a `rgba(255,255,255,0.08)` hairline, and a `rgba(255,255,255,0.06)` inner top highlight. `--glass-overlay` uses the same recipe at 0.82 opacity. Permitted on the rail, top bar, command surface, overlays, and sticky headers. Forbidden beneath body copy, table cells, and chart marks. Every glass token has a solid fallback.

### Motion tokens

Durations 120, 180, 240, 320 milliseconds. Standard easing `cubic-bezier(0.2, 0, 0, 1)`, emphasised `cubic-bezier(0.3, 0, 0, 1)`. Ambient motion capped at two concurrent animations, amplitude at or below two pixels or 0.02 alpha, period at or above twelve seconds.

### Component inventory

Every component ships default, hover, focus, active, disabled, loading, empty, and error.

**Frame:** AppShell, NavRail, NavGroup, TopBar, WorkspaceSelector, CommandSurface, AnswerPanel, Breadcrumb, IntelligenceStatusBanner.

**Data display:** DataTable, EventRow, SourceRow, MediaRow, EventCard, StatLine, SignificanceMeter, FamilyChip, CategoryLabel, EntityChip, TagChip, StatusChip, ProvenanceBlock, GeneratedBlock, CitationChip, ToolTraceDisclosure, ReceiptCard, EmptyState, ErrorState, SkeletonBlock.

**Time:** TimelineChart, PrecisionMark, CaptureRail, MiniTimeline.

**Graph:** GraphCanvas2D, GraphTable, EntityPanel, DepthToggle.

**Input:** FilterBar, SearchInput, RangeControl, MultiSelect, DateRangeControl, SavedViewMenu, NoteEditor, DraftEditor, TemplatePicker, AnswerInput, IngestInput.

**Overlay:** Dialog, Popover, Tooltip, Toast, ConfirmDestructive.

**Media:** MediaPlayer, TranscriptReader, ChecksumBadge.

Enforcement: components reference only the semantic token layer; a lint rule fails the build on a raw hex or pixel value inside a component; variants are props on one component; each component carries a written usage rule including when not to use it. Radix headless primitives supply dialog, popover, combobox, and menu behaviour.

### Theme

Dark only in the first release, following the pinned direction. Tokens are structured for a theme swap and no component is styled inside a media query. A high-contrast switch ships in the first release and `forced-colors` is honoured.

## 5. Three.js components

Exactly two components, one shared scene system, one renderer, one animation loop.

### Component A: Connection Field (Connections screen, Depth toggle)

**Purpose.** Spatial exploration of the entity and event graph: 66 event nodes, up to roughly 350 entity nodes after thresholding, 100 explicit event edges plus shared-entity edges.

**Why depth earns its place.** At this node and edge count a two dimensional force layout occludes. Depth plus slow parallax separates clusters that are genuinely separate and gives a stable mental map.

**Load.** Dynamic import on the Depth toggle only.

**Fallback.** The two dimensional Canvas graph is the default view, not a degraded one, and the paired table lists every node and edge. Depth adds nothing that is not already reachable.

**Budget.** 400 nodes, 1,200 edges, instanced geometry, no textures above 256 pixels, no post-processing, no shadows.

### Component B: Ambient Intelligence Field (Brief header only)

**Purpose.** A slow point field whose density maps to corpus size and whose luminance maps to unreviewed count, so the ambience states something true.

**Why depth earns its place.** It is the product's single ambient signature. This is honestly the weaker of the two justifications and it is the first thing to cut if the frame budget is contested.

**Load.** Dynamic import after the Brief has painted, gated on idle callback, capability probe, and reduced-motion.

**Fallback.** A static SVG field with the same composition and data mapping.

**Budget.** 6,000 instanced points, one draw call, no textures, no post-processing.

### The shared scene system

One `SceneHost` singleton owns one `WebGLRenderer`, one clock, and one animation loop. Scenes register and unregister; the renderer is created lazily and disposed after 30 seconds with no mounted scene.

Gates before any renderer is created: reduced-motion or the user's Motion setting off means never mount; a capability probe requires WebGL2 and at least 4 GB device memory where reported; a first-frame probe falls back permanently for the session if the first three frames exceed 24 milliseconds.

Runtime governors: `IntersectionObserver` pauses offscreen, the Page Visibility API pauses on tab blur, device pixel ratio is clamped to 1.75, frame time above 12 milliseconds for two seconds drops to a 30 frames per second cap, above 20 milliseconds unmounts to the fallback.

### Explicitly not WebGL

Tables, timelines, filters, forms, navigation, text, charts, the reading column, media playback, and every primary control.

## 6. Motion and performance budget

### Bundle and load

| Metric | Budget |
|---|---:|
| Initial route JavaScript, gzip | 180 KB |
| Initial total transfer including fonts, gzip | 400 KB |
| Three.js chunk, gzip, on demand only | 180 KB |
| Largest Contentful Paint on a laptop over the tunnel | 1.8 s |
| Interaction to Next Paint | 200 ms |
| Cumulative Layout Shift | 0.02 |

### Runtime

| Metric | Budget |
|---|---:|
| 3D frame time at 60 frames per second target | 6 ms |
| Degrade to 30 frames per second cap when frame time exceeds | 12 ms for 2 s |
| Unmount to fallback when frame time exceeds | 20 ms |
| CPU while a 3D scene is visible and static | under 2 percent |
| CPU with the tab hidden | zero animation, zero render calls |
| Timeline brush to repaint, 66 events and 174 pins | 16 ms |
| Table sort and filter, 66 rows | 50 ms |
| Backend structured tool call, p95 | 60 ms |
| Ask, first streamed token from Hermes | 3.0 s |
| Brief counter strip, fully rendered without Hermes | 400 ms |

### Motion rules

Ambient motion limited to two concurrent animations, amplitude at or below two pixels or 0.02 alpha, period at or above twelve seconds. Transitions 120 to 320 milliseconds. Under `prefers-reduced-motion: reduce`: ambient motion off, transitions reduced to 80 millisecond opacity only, 3D replaced by the static fallback, brushing instant.

### Enforcement

Bundle budgets fail the build rather than warn. Runtime budgets are measured on a representative laptop profile before each phase is accepted. The reduced-motion path is audited as a separate checklist item.

## 7. Intelligence architecture: Hermes is the brain

### 7.1 Roles, stated as a boundary

| Concern | Owner |
|---|---|
| Reasoning, planning, synthesis, tool choice, retrieval strategy | **Hermes** |
| Semantic recall over prose, transcripts, and prior knowledge | **OpenViking**, through Hermes only |
| Deterministic structure: identity, filters, counts, ordering, relationships | **Working database**, through the tool surface |
| Authentication, authorization, rate limits, audit | **Dashboard backend** |
| Media custody, checksum verification, authorized streaming | **Dashboard backend** |
| Persistence of notes, drafts, views, sessions, receipts | **Dashboard backend** |
| Citation validation before render | **Dashboard backend** |
| Presentation, interaction, accessibility | **Frontend** |

The backend never plans a retrieval, never ranks results by relevance, never assembles model context, never chains a second call to improve an answer, and never summarises. If a behaviour requires a judgement, it belongs in Hermes.

### 7.2 Boundary diagram

```text
                          Browser (authenticated private preview hostname)
                                            |
                                 HTTPS via existing V2 tunnel
                                 Cloudflare Access at the edge
                                            |
                                            v
  +-----------------------------------------------------------------------------+
  |                    Dashboard backend (boundary, not a brain)                 |
  |                                                                              |
  |  auth  ·  rate limit  ·  audit  ·  persistence  ·  citation validation       |
  |                                                                              |
  |   [ REST + SSE to browser ]            [ crypto.* MCP endpoint, internal ]   |
  +--------|-------------------------------------------------|------------------+
           |                                                  ^
           | JSON-RPC / WebSocket  (private internal network) | MCP over HTTP
           | port 9119, authenticated                         | header auth
           v                                                  |
  +-----------------------------------------------------------|------------------+
  |                        Hermes central brain (unmodified)                      |
  |   crypto-intelligence branch skill: routing policy, citation contract         |
  |   native tools: web · browser · youtube-content · documents · xurl · cron     |
  +-------------------------------------|----------------------------------------+
                                        | native provider, isolated docker network
                                        v
                        OpenViking unified memory (private, never browser exposed)

  Backend-owned stores:   crypto-intelligence.db   one active database, the system of record
                                                   one unified FTS index, real foreign keys
                                                   backed up, restore tested
                          private media archive (owner only, authorized reads)
                          frozen handoff v1 (immutable, verified migration and rollback source)
```

The browser never reaches Hermes, never reaches OpenViking, and never receives a server path, provider key, or archive location. The MCP endpoint is a route on the existing backend process bound to the internal network, not a separate service.

### 7.3 Transports, corrected

**Backend to Hermes.** Hermes's native authenticated JSON-RPC and WebSocket backend on port **9119**, reached over the private internal Docker network. The deployed container already serves this surface: the RUNBOOK records the dashboard on `127.0.0.1:9119` and a successful authenticated `/api/auth/me` call during bootstrap. Port 8642 is closed and the deployed CLI exposes no equivalent command, so revision 1's proposal to enable it is withdrawn. The backend authenticates as a dedicated non-interactive principal, opens or resumes a session scoped to the Crypto branch, sends the user's message, and streams the reply.

**Hermes to structured data.** The backend exposes a `crypto.*` MCP server over HTTP on the internal network, registered in Hermes with `hermes mcp add --url <internal-url> --auth header`. This is Hermes's native MCP client path, so no agent, gateway, or orchestrator is introduced.

**Verification gate, not an assumption.** The local CLI available for inspection is v0.17.0 while the deployed instance is 0.19.1, so the exact 9119 method surface and the 0.19.1 MCP client behaviour are treated as unproven until tested on the deployed instance. Phase 1 proves both before anything depends on them: enumerate the authenticated 9119 surface, register the MCP endpoint, and confirm with `hermes mcp list` and `hermes mcp test` that Hermes discovers and successfully calls a trivial `crypto.ping` tool. If either interface differs from expectation, the finding is documented and the transport is re-proposed rather than worked around.

### 7.4 The structured tool surface

Narrow, typed, versioned, and read-mostly. Every response carries canonical identity. No tool returns a filesystem path, a secret, or raw media bytes.

**Every read tool queries the one active database.** Hermes sees one corpus, because there is one corpus. Each returned record carries its `origin`, `migrated` or `ingested`, so provenance and reconciliation stay separable without any structural split.

**Read tools**

| Tool | Returns |
|---|---|
| `crypto.find_events` | Compact event records by text, exact category, secondary category, significance range, source, entity, tag, subject-date range, capture-date range |
| `crypto.get_event` | One full event: fields, facets, entities, connections with unresolved flags, media references |
| `crypto.find_sources` / `crypto.get_source` | Source identity, capture basis, derived events |
| `crypto.get_timeline` | Subject pins with precision, plus capture stamps, for a window |
| `crypto.find_entities` | Entity index by type with event counts |
| `crypto.get_relationships` | Explicit connections and shared-entity edges above a threshold |
| `crypto.search_text` | Deterministic lexical matches over events, facets, and transcript text with canonical IDs and snippets |
| `crypto.get_notes` | Mark's note revisions for an event |
| `crypto.find_drafts` / `crypto.get_draft` | Draft history, raw and edited output, citations |
| `crypto.get_media_reference` | Kind, bytes, checksum, linked event, and a short-lived authorized URL |
| `crypto.get_corpus_stats` | Counts and coverage gaps |
| `crypto.resolve_identity` | Maps any canonical ID, OpenViking URI, archive reference, or SHA-256 to one canonical record |

`crypto.search_text` is the database's own unified full-text index exposed as a tool. It is lexical, it returns results in the single deterministic order defined in section 9.3, and it is only ever invoked by Hermes. It is not a retrieval engine and there is no embedding, vector store, or re-ranker anywhere in the backend.

**MCP is read only in this release.** The write tools below are specified so the contract is settled, and they are **disabled**. The reason is section 7.5.

| Tool, defined and disabled | Effect if enabled |
|---|---|
| `crypto.append_note` | New note revision for an event, never an overwrite |
| `crypto.save_draft` | New draft revision with validated citations |
| `crypto.record_quiz` | Session, question, answer, and event-link records |
| `crypto.register_source` | Canonical source record from a provenance envelope |
| `crypto.register_event` | Canonical event record linked to exactly one source |
| `crypto.acquire_media` | Backend fetches or seals a binary into the archive, verifies SHA-256, returns an archive reference |
| `crypto.write_receipt` | Reconciliation receipt for an ingestion or sync attempt |

Every write in this design still happens. It simply does not travel through an MCP tool call. All writes go to the active database through the authenticated backend, inside a transaction, with a receipt.

### 7.5 Why the acting user cannot be proven over MCP today

Revision 3 proposed a conversation-bound capability token that Hermes would carry back on a write tool call. That is wrong, and the flaw is worth stating exactly, because it is the kind that looks secure.

**Anything in a tool argument is model-visible.** MCP arguments are produced by the model, so a token placed there has already been inside the prompt and can reach transcripts, tool traces, conversation history, memory, and logs. A credential the model can see is a credential that can be replayed, echoed into an answer, or persisted somewhere it was never meant to live. The rule this design now holds to is absolute: **the acting-user credential never enters prompts, memory, tool arguments, transcripts, tool traces, or logs.**

**The static MCP header does not fix this.** The header credential registered with `hermes mcp add --auth header` authenticates *Hermes as a service*. It proves the caller is the Hermes container. It says nothing about which dashboard user, if any, caused the call, and it is identical for every conversation Hermes serves. Service authentication and user attribution are different problems, and revision 3 conflated them.

**What Phase 1B must determine.** Whether the deployed Hermes attaches trusted conversation identity to an outbound MCP call **outside model-visible content**, for example as transport metadata or per-request headers derived from the session rather than from the model's output. If such a channel exists, is not model-writable, and cannot be spoofed by conversation content, it becomes the binding and MCP writes may be enabled. That is an empirical question about the deployed 0.19.1 instance, answered with evidence rather than assumed in either direction.

**The design that ships regardless: typed action intent.**

```text
Hermes                          Backend                        Browser / session
  |                                |                                  |
  | returns a TYPED ACTION INTENT  |                                  |
  | through the conversation       |                                  |
  | channel the backend already    |                                  |
  | controls. No credential in it. |                                  |
  |   { action: "append_note",     |                                  |
  |     event_id, text, rationale }|                                  |
  |------------------------------->|                                  |
  |                                | validate against the intent      |
  |                                | schema, resolve identity, then   |
  |                                | check the user's OWN authenticated|
  |                                | session for authority            |
  |                                |                                  |
  |                                | pre-authorised low-risk class:   |
  |                                |   execute directly               |
  |                                | everything else:                 |
  |                                |   surface for confirmation ------>|
  |                                |<--------------------- confirmed  |
  |                                | execute, audit, write receipt    |
```

The authority is the session the backend already verified through Cloudflare Access, never anything the model produced. Hermes proposes, the authenticated boundary disposes. This preserves the Hermes-first architecture exactly: deciding *what* should be written is reasoning and stays with Hermes, while *whether this user may write it* is authorization and was never Hermes's job.

Little is lost by shipping without MCP writes, because the mutations already flow through channels the backend controls. Notes are saved by the browser directly. Drafts and quiz results come back through the conversation the backend is already streaming. Ingestion is a typed intent by construction. The action-intent flow is not a workaround bolted on, it is the shape the rest of the design already had.

### 7.6 Why Telegram is deferred

A message arriving through the Hermes gateway carries a sender identity in the gateway's own terms. Mapping that securely to an authorized dashboard user, including how the mapping is established, how it is revoked, and how a spoofed or forwarded message is rejected, is unproven work. Until it is proven and separately approved:

- The **dashboard is the only accepted write and ingestion channel** in this release.
- A Telegram-originated action intent has no authenticated dashboard session behind it, so the backend has no authority to execute against and rejects it with an explicit reason. The constraint lives in the authorization check rather than in a channel allowlist, so there is no list to forget to update.
- Read behaviour is unaffected. Mark can ask questions from any channel Hermes serves, because reads are not attributed writes.
- Telegram write and ingestion attribution is listed as deferred work in section 11 and as approval item 7 in section 12, and is explicitly not counted as accepted in this release. The V2 instance has no Telegram token configured today, so nothing regresses by deferring it.

### 7.7 Who decides what

Hermes decides. The routing policy lives in the `crypto-intelligence` branch skill and in the tool descriptions themselves, both of which are Hermes-native configuration and neither of which modifies Hermes source:

- Use structured tools when the answer depends on exact identity, counts, dates, ordering, filters, relationships, or the current state of a note or draft.
- Use OpenViking semantic memory when the answer depends on meaning, wording, argument, or recall across prose and transcripts.
- Use both when a claim needs semantic recall and a verifiable structural anchor, which is the normal case for a cited answer.
- Cite canonical IDs, never prose references.

The backend enforces none of this and cannot: it answers whatever tool call arrives, and it validates the citations that come back.

### 7.8 Canonical identity, one register

One identity spans four stores. `source_id` and `event_id` follow the rules already frozen in `CRYPTO-V2-INGESTION-DESIGN.md`: normalized-URL SHA-256, file-byte SHA-256, or case-folded label SHA-256 for sources, preserved legacy IDs for the 66 migrated events, and content-derived IDs for new ones.

The backend maintains an **identity register** table in the active database, one row per canonical object:

```text
canonical_id      the single key used by routes, tools, and citations
kind              source | event | theme | draft | quiz_session | media | note_revision
origin            migrated | ingested
openviking_uri    canonical URI returned by OpenViking, null while unimported
archive_ref       legacy-export:// or crypto-media:// reference, null when not a file
sha256            original bytes where a file exists
first_seen_at     receipt-stamped
last_reconciled   receipt-stamped
state             registered | memory_pending | memory_synced | memory_failed | unresolved
```

It is the only place that remembers which OpenViking URI belongs to which canonical record, and that mapping cannot be regenerated from the frozen handoff, which is one more reason the backup matters. Seeded during initialisation and extended by every ingestion receipt.

This exists because OpenViking owns its stored filename and appends a collision-safe suffix, a behaviour already proven during the import attempt. The register is what makes a returned URI resolvable back to a canonical record, and it is the mechanism behind `crypto.resolve_identity`. Citations always travel as canonical IDs; a URI is translated at the boundary, never rendered raw.

### 7.9 Intelligence availability states

One architecture, three availability states, all visible in the interface.

| State | Meaning | Interface |
|---|---|---|
| `full` | Hermes reachable, OpenViking populated | Normal. Answers may cite both semantic and structural evidence |
| `degraded_structured_only` | Hermes reachable, semantic memory empty or unreachable | Persistent banner: semantic memory unavailable, answers are limited to structured records. Answers are additionally marked in place |
| `unavailable` | Hermes unreachable | Ask, standing brief, Studio generation, and Recall generation disabled with an explanatory state and a retry. Browsing, filtering, reading, notes, saved views, and media continue normally |

`degraded_structured_only` is the state on day one because the 197-record import is paused on funded model access. It is a temporary operating condition, not a design target, and the product says so on screen. No alternative provider, local model, or substitute retrieval path is introduced to work around it.

## 8. Complete read and write flows

### 8.1 Asking a question

```text
Browser        Backend                Hermes 9119           crypto.* MCP        OpenViking
   |              |                        |                     |                  |
   | POST /api/ask|                        |                     |                  |
   |------------->|                        |                     |                  |
   |              | verify Access JWT      |                     |                  |
   |              | + app session          |                     |                  |
   |              | rate limit, open       |                     |                  |
   |              | ask_log row            |                     |                  |
   |              |                        |                     |                  |
   |              | send message + minimal |                     |                  |
   |              | situational preamble   |                     |                  |
   |              | (workspace, acting     |                     |                  |
   |              | user, current object,  |                     |                  |
   |              | availability state)    |                     |                  |
   |              |----------------------->|                     |                  |
   |              |                        |                     |                  |
   |              |                        | HERMES DECIDES      |                  |
   |              |                        |-------------------->|                  |
   |              |                        | crypto.search_text  |                  |
   |              |                        | crypto.find_events  |                  |
   |              |                        | crypto.get_event    |                  |
   |              |          authorize +   |<--------------------|                  |
   |              |          read-only SQL |  typed JSON, every  |                  |
   |              |<-----------------------|  record carries a   |                  |
   |              |          (same process)|  canonical_id       |                  |
   |              |                        |                     |                  |
   |              |                        | viking search / exact read             |
   |              |                        |--------------------------------------->|
   |              |                        |<---------------------------------------|
   |              |                        |                     |                  |
   |              |  stream tokens         |                     |                  |
   |              |<-----------------------|                     |                  |
   |              |                        |                     |                  |
   |              | resolve every cited id through the identity register            |
   |              | strip unknown ids, attach a visible note                        |
   | SSE tokens   |                        |                     |                  |
   |<-------------|                        |                     |                  |
   |              | close ask_log: tools called, records read, citations emitted    |
```

The backend contributes authentication, a fixed situational preamble, transport, citation validation, and audit. It selects no content.

### 8.2 Generating a cited draft

```text
Browser         Backend               Hermes                crypto.* MCP
   |               |                     |                        |
   | POST /api/drafts/generate           |                        |
   | template, range, focus, collection  |                        |
   |-------------->|                     |                        |
   |               | auth, rate limit    |                        |
   |               | open draft_run row  |                        |
   |               |-------------------->|                        |
   |               |                     | crypto.find_events     |
   |               |                     | (range, categories,    |
   |               |                     |  significance, ids)    |
   |               |                     |----------------------->|
   |               |                     |<-----------------------|
   |               |                     | crypto.get_event xN    |
   |               |                     | crypto.get_notes       |
   |               |                     |----------------------->|
   |               |                     |<-----------------------|
   |               |                     | viking recall for      |
   |               |                     | phrasing and argument  |
   |               |                     |                        |
   |               | stream draft +      |                        |
   |               | structured citations|                        |
   |               |<--------------------|                        |
   |               |                                              |
   |               | validate every cited id against the register |
   |               | reject the run if any citation is unresolvable and
   |               | report which ones, rather than silently trimming
   |               |                                              |
   |               | the draft arrives through the conversation    |
   |               | the backend is already streaming, so the      |
   |               | backend persists it directly.                 |
   |               | No MCP write, no credential anywhere near     |
   |               | the model. Preserved original untouched.      |
   | draft + panel |                                              |
   |<--------------|                                              |
```

Draft citation validation is stricter than answer validation: an answer strips an unknown citation and says so, a draft fails the run, because a draft is an artifact Mark may read from a stage.

### 8.3 Ingesting a new source

The five stages requested, in order, using Hermes-native acquisition and the existing thin provenance layer.

```text
  Mark, in the dashboard (the only accepted ingestion channel in this release)
        |
        |  a link or a file, on his Access-verified session
        |  the backend holds that authority for the whole flow
        |  and never hands a credential to Hermes
        v
  +-----------------------------------------------------------------+
  | 1. SOURCE ACQUISITION            Hermes native capabilities      |
  |    web / browser / youtube-content / document skills / xurl      |
  |    produces: extracted text, transcript, title, dates, method,   |
  |    extraction_status                                             |
  |    Hermes returns a TYPED INGESTION INTENT through the           |
  |    conversation: provenance envelope + derived events + media    |
  |    descriptors. It contains no credential and executes nothing.  |
  +-----------------------------------------------------------------+
        |
        |  provenance envelope built to mark.crypto.source/v1
        |  source_id = sha256(normalized url | file bytes | folded label)
        v
  +-----------------------------------------------------------------+
  | 2. CANONICAL DATABASE RECORD     backend executes the intent     |
  |    backend: validate the intent schema, confirm the requesting   |
  |    session still holds authority, resolve the candidate id       |
  |    against the identity register                                 |
  |      new id      -> write source row + identity-register row     |
  |                     with origin = 'ingested'                     |
  |      existing id -> refuse the create, record the re-encounter,  |
  |                     receipt records skipped_duplicate            |
  |    then one event row per derived event, each linked to exactly  |
  |    one source id by a real enforced foreign key, categories      |
  |    stored verbatim, all in one transaction                       |
  +-----------------------------------------------------------------+
        |
        v
  +-----------------------------------------------------------------+
  | 3. PRIVATE MEDIA ARCHIVE         backend executes                |
  |    text artifacts arrive inline in the intent, size capped       |
  |    binaries: backend fetches server side under an allowlist and  |
  |    size cap, or seals a file Hermes wrote to the staging volume  |
  |    backend computes sha256, writes under crypto-media://, sets   |
  |    mode 0600, records bytes and checksum. No bytes ever          |
  |    reach the model. No path is ever returned.                    |
  +-----------------------------------------------------------------+
        |
        v
  +-----------------------------------------------------------------+
  | 4. OPENVIKING MEMORY             Hermes native resource path     |
  |    CREATE ONLY. No existing resource is updated in place.        |
  |    body-visible provenance envelope, never front matter          |
  |    one source resource plus one child resource per event         |
  |    large binaries referenced by checksum, never duplicated       |
  |    deterministic ids make a replay a skip, not an overwrite      |
  |    OpenViking returns its canonical URI                          |
  +-----------------------------------------------------------------+
        |
        v
  +-----------------------------------------------------------------+
  | 5. RECONCILIATION RECEIPT        backend writes                  |
  |    status, source id, event ids, openviking uris, archive refs,  |
  |    checksums, timestamps, error class on failure                 |
  |    identity register updated: memory_synced or memory_failed     |
  |    checkpoint + encrypted backup copy on success                 |
  |    dashboard shows the receipt on the source detail screen       |
  +-----------------------------------------------------------------+
```

Stage 4 is the one write Hermes performs itself, and it needs no credential from us: it is Hermes writing to its own memory through its native provider, using the canonical IDs the backend minted at stage 2 and returned to it. Stages 2, 3, and 5 are executed by the backend under the requesting session's authority. Hermes decides what is worth ingesting and produces the envelope; it never holds the authority to commit it.

Failure is explicit at every stage. A failed extraction writes a receipt with an error class and no false-success URI, which is the rule the ingestion design already froze and the fixture suite already proves. Replay is safe: the deterministic identity check at stage 2 and the pre-storage identity check at stage 4 both skip rather than duplicate.

### 8.4 Updating Mark's notes

Nothing in this flow updates an existing OpenViking resource. Memory is append only.

```text
Browser              Backend                        Hermes           OpenViking
   |                    |                              |                  |
   | PUT /api/events/:id/notes                         |                  |
   |------------------->|                              |                  |
   |                    | verify Access identity,      |                  |
   |                    | app session, workspace       |                  |
   |                    |                              |                  |
   |                    | append note revision N to    |                  |
   |                    | note_revisions               |                  |
   |                    |   revision 0 = the migrated   |                  |
   |                    |   mark_notes value, so the    |                  |
   |                    |   original is never edited,   |                  |
   |                    |   only superseded            |                  |
   | 200 saved          |                              |                  |
   |<-------------------|                              |                  |
   |                    |                              |                  |
   |                    | fixed rule, no judgement:    |                  |
   |                    | every note revision produces |                  |
   |                    | one NEW memory resource      |                  |
   |                    |----------------------------->|                  |
   |                    |  store note-revision resource                   |
   |                    |  schema mark.crypto.note/v1                     |
   |                    |  note_revision_id =                             |
   |                    |    sha256(event_id + revision + normalized text)|
   |                    |  body carries: event_id, revision, author,      |
   |                    |    created_at, supersedes(prev id), note text,  |
   |                    |    body-visible provenance block                |
   |                    |                              |----------------->|
   |                    |                              |  CREATE only.    |
   |                    |                              |  Deterministic   |
   |                    |                              |  id makes replay |
   |                    |                              |  a skip, never   |
   |                    |                              |  an overwrite.   |
   |                    |                              |<-----------------|
   |                    |<-----------------------------|                  |
   |                    | receipt written, register row added for the     |
   |                    | note_revision: memory_synced | memory_failed    |
   |                    |                                                 |
   | note badge shows sync state, retry offered on failure                |
   |<---------------------------------------------------------------------|
```

**Why append only.** Revision 2 assumed an event resource could be revised in place. That assumption is not proven for this OpenViking version, and the failure modes are exactly the ones that matter here: a partial update leaves memory disagreeing with the database, a replay could overwrite a newer revision with an older one, and there is no per-resource rollback short of restoring the whole volume. Appending sidesteps all three. The deterministic identity rule already frozen in the ingestion design does the rest: replaying the same revision is a skip, not a duplicate and not an overwrite.

**How currency is established without mutating history.** The database is authoritative for what the note says now. `crypto.get_notes` returns the current revision and, on request, the revision history. Semantic recall may surface an older note-revision resource, so each resource body states its own `revision` and its `supersedes` link, and the branch skill instructs Hermes to treat note-revision resources as historical evidence and to confirm current text through `crypto.get_notes` before asserting it. This is the same division of labour used everywhere else in the design: memory for meaning, structured tools for exact state.

**The same rule covers drafts and every other mutation.** No OpenViking resource is updated in place anywhere in this design. Draft edits store new draft-revision resources under the same pattern.

**Phase 1 tests the assumption rather than carrying it.** In an isolated fixture namespace: attempt a native in-place update, replay it, and attempt a per-resource rollback, recording exactly what the deployed version does. If update, replay, and rollback all prove safe and reversible, in-place update is re-proposed as a change to this document. Until then, append only is the design, not a workaround.

**No credential leaves the boundary.** The browser writes the note on its own authenticated session, so no acting-user credential is minted, passed, or held anywhere near the model. The instruction the backend then sends to Hermes contains the canonical event ID, the revision number, and the note text, and nothing else: no token, no session identifier, no path. This is why the note flow needs neither an MCP write nor an action intent. It is the simplest case, and it sets the pattern the other mutations follow.

**One write path.** The dashboard is the only entry point in this release, per section 7.6. If a dictated note is ever accepted from another channel, it arrives as a typed action intent that the backend validates and executes under an authenticated session, and every stage after that is identical. The user-facing save never blocks on the memory sync, and a failed sync is visible rather than silent.

### 8.5 Backing up and restoring

```text
  crypto-intelligence.db  (the active database, sole system of record)
        |
        | WAL checkpoint, consistent copy, SHA-256,
        | encrypted off-server copy, retention
        v
  verified backup set  ----------- restore path (primary) ------------+
                                                                       |
  frozen handoff v1 (immutable, checksum pinned)                       |
  crypto-dashboard-v2.db                                               |
        |                                                              |
        | reinitialise path (rollback source of last resort)           |
        | recovers the migrated 66 events and 47 sources ONLY.         |
        | GATED: refuses to run against a database holding             |
        | post-migration records unless an operator confirms and a     |
        | fresh verified backup exists.                                |
        v                                                              v
  +--------------------------------------------------------------------+
  | reconcile                                                          |
  |  migrated counts vs handoff manifest                               |
  |  post-migration counts reported separately via origin              |
  |  every event resolves to its canonical source (real FK, enforced)  |
  |  identity mappings vs OpenViking exact reads                       |
  |  89 legacy media checksums plus new media                          |
  |  FTS integrity check                                               |
  +--------------------------------------------------------------------+
        v
  reconciliation receipt written; Settings shows green or names
  exactly what disagreed, by canonical ID
```

The active database is the only copy of everything captured after migration, so the backup is the protection, not the frozen handoff. The frozen handoff proves the migration was faithful and can rebuild the migrated baseline; it cannot recover a single record ingested since.

## 9. The active database

One SQLite database, `crypto-intelligence.db`. It is the system of record for the whole workspace.

### 9.1 What it holds

Migrated sources, events, facets, entities and relationships; all newly ingested intelligence; notes and their revision history; drafts and their revision history; quizzes and conversations; media metadata; canonical identity mappings; ingestion receipts and audit history; and **one unified FTS index** over all searchable text regardless of when it arrived.

### 9.2 How it is built

Initialised once from the immutable verified handoff, then evolved by forward migrations.

```text
frozen handoff v1  ->  verify sha256 against handoff-manifest.json
                       refuse on mismatch
                   ->  initialise crypto-intelligence.db
                   ->  apply forward migrations in order
                   ->  reconcile against the manifest, write a receipt
```

- A `schema_migrations` table records every applied migration, so the build is reproducible and forward only.
- Every record carries an `origin` value, `migrated` or `ingested`, which is how migrated and post-migration counts stay separately reportable without any structural split.
- Canonical IDs from the handoff are preserved exactly and are the primary keys, the route keys, and the citation keys.
- Foreign keys are real and enforced by SQLite, because everything lives in one file.
- Reinitialising from the frozen handoff is destructive to post-migration data. It refuses to run against a database containing `origin = 'ingested'` records unless an operator explicitly confirms and a fresh verified backup exists.

### 9.3 Search

One FTS5 index maintained by triggers inside the same transaction as any content write, so newly ingested material is searchable immediately. One index means one bm25 corpus, one score, and one ordering. `crypto.search_text` returns results ordered `bm25 ASC, significance DESC, subject_date DESC, canonical_id ASC`, which is total and reproducible across restarts. This is lexical matching over a SQLite index. There is no embedding, vector, re-ranker, or learned scoring anywhere in the backend; semantic recall belongs to OpenViking through Hermes.

### 9.4 Backup and restore

The active database holds every note Mark writes, every source captured after migration, the identity mappings that resolve memory back to canonical records, and every receipt. Losing it loses all of that, and the frozen handoff restores only the migrated baseline.

- WAL checkpoint, consistent copy, SHA-256, encrypted off-server copy, retention, following the pattern already established for the OpenViking volume.
- Scheduled full copy, plus a checkpoint and copy after every completed ingestion receipt, so backup frequency follows write volume rather than a nominal daily habit.
- The private media archive is backed up on the same schedule, since a file without its metadata row is an orphan and a metadata row without its file is a broken reference.
- **Restore is drilled before the private preview is presented, not after**, and the drill must recover post-migration sources, events, notes, and identity mappings, not only annotations. It is a named acceptance item in Phase 8.

### 9.5 Media custody

New media is written under a `crypto-media://` archive alongside the existing `legacy-export://` archive, mode 0700 directories and 0600 files, owner only. Reads go through `GET /api/media/:archive_ref`, which resolves the reference through the database, refuses any path that does not normalise inside the archive root, requires an authenticated session, streams with range support for the 22 video and 14 audio files, and logs the access. The archive is never mounted as a static directory. Tools return short-lived authorized URLs, never paths and never bytes.

## 10. Frontend, backend, security, deployment

### Stack

Frontend: React with TypeScript on Vite, TanStack Query, TanStack Virtual, CSS Modules over a single token file, Radix primitives, Canvas and SVG for charts, Three.js lazily for the two components in section 5.

Backend: Node 22 with Fastify and TypeScript, `better-sqlite3`, Zod schemas shared between the REST routes and the MCP tool definitions so a tool contract cannot drift from its validator, server-sent events to the browser. One language across the stack, and the existing Python tooling stays in migration and ingestion support where it belongs.

### API surface

Browser facing, all requiring Access identity plus an app session:

```text
GET  /api/health | /api/session | /api/reconciliation
GET  /api/brief                  counters, plus the cached Hermes narrative and its age
POST /api/brief/refresh          asks Hermes to rewrite the standing brief
GET  /api/events | /api/events/:id | /api/sources | /api/sources/:id
PUT  /api/events/:id/notes       append a revision, then sync memory
GET  /api/timeline | /api/graph | /api/themes | /api/themes/:id
GET  /api/search                 lexical, local, no model
POST /api/ask                    SSE relay to Hermes
GET  /api/drafts | POST /api/drafts | PUT /api/drafts/:id
POST /api/drafts/generate        SSE relay to Hermes
GET  /api/quiz/sessions | POST /api/quiz/sessions | POST /api/quiz/sessions/:id/answers
POST /api/ingest                 hands a link or file to Hermes, returns a receipt id
GET  /api/receipts | /api/receipts/:id
GET  /api/conversations | /api/conversations/:id
GET  /api/media/:archive_ref     authorized stream with range support
GET  /api/views | POST /api/views
```

Internal network only, never routed through the tunnel:

```text
POST /mcp                        the crypto.* tool endpoint, header authenticated,
                                 READ TOOLS ONLY in this release, write tools
                                 registered as disabled and refusing with a reason
```

Every route and every tool carries the workspace identifier and is scoped by it in the query layer.

### Authentication

Cloudflare Access as the identity provider, matching the pattern already proven for the management hostnames. The backend validates `Cf-Access-Jwt-Assertion` against the team's public keys on every request, checks audience and expiry, maps the verified email to an allowed user, and issues a short-lived signed app session cookie as defence in depth. Anonymous requests receive 401 with no data and no hint.

The MCP endpoint uses a separate credential class: a header secret bound to the Hermes tenant, accepted only from the internal network, with per-tool authorization and mandatory acting-user attribution on writes.

Proposed hostname: `intel-preview.forkedbrain.fyi` on the existing `mark-personal-ai-v2` tunnel with an Access policy allowing the same two approved identities. `intel.forkedbrain.fyi`, its `crypto-intel` tunnel, and the old VPS are not touched. Nothing happens without explicit approval and a written plan.

### Security

No provider key, OpenViking key, cookie, credential, raw environment value, or server path appears in browser code or any client-visible payload. Strict content security policy with no external hosts, self-hosted fonts, `frame-ancestors 'none'`, no inline script. Rate limits on ask, generate, and ingest. Audit rows for every tool call, note revision, draft revision, media access, and question. Secrets are supplied by name only and documented by name only.

### Deployment

A new Coolify application in the existing project, its own Compose resource, attached to a shared internal network with Hermes, resource limited to roughly 1 vCPU and 1 GiB, no host published ports, reachable only through the existing V2 tunnel on the preview hostname behind Access. Hermes and OpenViking images, volumes, source, and native behaviour are unchanged. The only Hermes-side additions are configuration: one MCP server registration and one branch skill.

## 11. Implementation phases and acceptance criteria

Effort is stated as relative weight and sequence, not as dates.

### Phase 0: two separate approvals

Weight: low.

First, this document is approved or amended and the approval items in section 12 are answered. That approval unblocks Phase 1A only.

Second, a written **interface proof plan** is submitted and approved on its own, covering exactly what will be touched, in what order, with what rollback. Until that second approval exists: no Hermes configuration change, no MCP registration, no service deployment, and no Cloudflare or DNS change of any kind. The Cloudflare plan for the preview hostname is a third, separate approval and is not needed until Phase 8.

### Phase 1A: local data foundation, no external contact

Weight: moderate. Everything in this phase runs against the local read-only copy of the frozen handoff. It makes no connection to the VPS, Hermes, OpenViking, or Cloudflare, and deploys nothing.

Scope: initialise `crypto-intelligence.db` from the frozen handoff, the forward-migration runner, the unified FTS index, the identity register, the `crypto.*` read tool implementations with their shared schemas, the action-intent write path, and the test harness including a local MCP client stub that exercises every tool without Hermes.

Accepted when:

- initialisation verifies the frozen handoff SHA-256 against the manifest and refuses a modified file;
- migrated counts reconcile exactly at 47 sources, 66 events, 1,612 facets, 1 theme, 51 theme links, 41 drafts, 15 quiz sessions, 107 questions, 23 answers, 176 quiz event links, 16 pins, 13 conversation sessions, 614 messages, 89 media records;
- every event resolves to its canonical source through an enforced foreign key, the 7 unresolved connections are reported explicitly, and all 89 media checksums verify;
- all eleven category labels round-trip unchanged through ingestion, storage, tool response, and display;
- `schema_migrations` records every applied migration and a second run is a clean no-op;
- a simulated post-migration ingestion writes a source, event, facets, entities, relationships, and media metadata that are returned by the same tools as migrated records, distinguished only by `origin`;
- re-ingesting a migrated source records a re-encounter and a `skipped_duplicate` receipt, never a second record and never an overwrite;
- migrated and post-migration counts are separately reportable from `origin` alone;
- the unified FTS index is maintained inside the same transaction as any content write, proven by searching for a record immediately after writing it, and search ordering is total and byte-identical across process restarts;
- reinitialising from the frozen handoff refuses to run against a database holding `origin = 'ingested'` records without explicit operator confirmation and a fresh verified backup;
- **backup and restore are drilled in this phase, not deferred**: a restored copy is byte-identical by checksum and passes the full reconciliation.


### Phase 1B: interface proof, gated on the separately approved proof plan

Weight: low to moderate. This phase does not start until the interface proof plan of Phase 0 is approved in writing. It is deliberately ordered read-only first, reversible second.

Sequence: enumerate the authenticated 9119 surface on the deployed 0.19.1 instance without writing anything; then, only if that succeeds, register the `crypto.*` MCP endpoint in an isolated fixture scope with a documented removal command; then run the OpenViking mutation fixture tests in an isolated fixture namespace; then remove the fixture scope and record the result.

Accepted when:

- a non-interactive principal can open a session on 9119, send a message, and stream a reply over the private internal network, with the exact method surface recorded;
- `hermes mcp add --url ... --auth header` registers the endpoint and `hermes mcp list` and `hermes mcp test` confirm Hermes discovers and successfully calls a trivial `crypto.ping` tool;
- **the acting-user question is answered with evidence.** A `crypto.whoami` diagnostic tool records everything the deployed Hermes actually sends with an MCP call: transport metadata, headers, and any per-request context. The finding is recorded either way. MCP writes are enabled only if a channel exists that carries trusted conversation identity, is not model-writable, cannot be spoofed by conversation content, and never appears in model-visible content. If any of those four fails, MCP writes stay disabled permanently for this release and the typed action-intent flow is the shipped mechanism, which is the assumption the rest of the design already builds on;
- **no credential is placed in a tool argument at any point during this phase**, including the diagnostics themselves;
- the registration is proven reversible by removing it and confirming Hermes returns to its prior state;
- **the OpenViking mutation question is answered with evidence:** in an isolated fixture namespace, a native in-place update is attempted, replayed, and rolled back, and the observed behaviour of this deployed version is recorded. Append-only note-revision resources remain the design unless update, replay, and rollback all prove safe and reversible, in which case in-place update is re-proposed as a documented change rather than adopted silently;
- any deviation from the expected interface is documented and re-proposed rather than worked around;
- the fixture scope and namespace are removed and the removal is verified.

### Phase 2: authenticated boundary, tool surface, and media custody

Weight: significant.

Accepted when: anonymous requests to every browser route return 401 with no payload; the MCP endpoint is unreachable from the tunnel and rejects a missing or wrong header credential; every read tool returns canonical IDs and never a path, secret, or byte payload; **every MCP write tool is registered as disabled and returns an explicit refusal naming section 7.5 rather than executing**; a typed action intent with a malformed schema, an unknown canonical ID, or no authenticated session behind it is rejected with a specific reason and logged; **a simulated non-dashboard origin intent, standing in for the deferred Telegram channel, is rejected because there is no session authority to execute against, with no channel allowlist involved**; reads from a non-dashboard origin continue to work, confirming the constraint is scoped to writes; **an automated scan of prompts, tool arguments, tool traces, conversation transcripts, receipts, and logs finds zero occurrences of any session credential, and that scan runs in CI**; traversal attempts on media return 404 with an empty body; range requests stream correctly for the largest video; `crypto.resolve_identity` round-trips canonical ID, OpenViking URI, archive reference, and SHA-256 across both stores.

### Phase 3: design system and core interface

Weight: significant. Token file, component library with the full state matrix, application shell, Library, event detail, source detail, note editing with revisions and sync state.

Accepted when: no component contains a raw colour or spacing value and the lint rule proves it; every component demonstrates all eight states; keyboard reach and visible focus are complete; contrast gates pass at 4.5:1 body and 3:1 large and interface; absent-field states render correctly for the 19, 61, 5, and 59 event cases; a note revision writes to the active database, never to the frozen handoff, produces a new note-revision memory resource rather than mutating an existing one, and shows its memory sync state with a retry on failure; revision 0 of every migrated note matches the frozen `mark_notes` value; desktop at 1440 and phone at 390 pass usability review.

### Phase 4: timeline and filtering

Weight: significant.

Accepted when: a year-precision pin renders as a band and a day-precision pin as a point, with precision also stated in text; the full 2000 to 2026 range and the 2026 focus window both read correctly; brush to repaint stays within 16 milliseconds; every filter is in the URL and restored by back navigation; a family filter expands to exact leaf categories and the resulting chips name the leaf categories.

### Phase 5: Hermes intelligence plane

Weight: significant. Ask relay, standing brief, Studio generation, Recall generation and evaluation, the branch skill, citation validation, tool-trace disclosure, and the three availability states.

Accepted when: Hermes demonstrably chooses its own tools, evidenced by tool traces showing structured-only, semantic-only, and mixed answers for appropriate questions; the backend performs no ranking, context assembly, or retrieval planning, confirmed by code review against this section; an injected invalid citation is stripped from an answer with a visible note and fails a draft run outright; all 41 preserved drafts open and save new revisions without altering the originals; each availability state renders correctly, including a forced Hermes outage in which browsing, filtering, reading, notes, and media continue working.

### Phase 6: Connections, Recall, Brief, ingestion

Weight: moderate.

Accepted when: every relationship visible in the graph is present in the paired table; the graph is fully operable by keyboard; all 15 quiz sessions and 13 conversation sessions open read-correct; a new source ingested end to end from the dashboard produces a canonical record with `origin = 'ingested'`, an archived file with a verified checksum, a newly created OpenViking resource, an identity-register row, and a receipt visible in the interface; **a backup taken before that ingestion and restored afterwards reproduces the pre-ingestion state exactly, and the forward path replays cleanly**; a replayed ingestion skips rather than duplicating at both identity checks and never overwrites an existing resource; a deliberately failed extraction writes a receipt with an error class and no false-success URI; an ingestion intent with no authenticated session behind it is rejected before stage 2 executes.

### Phase 7: depth, motion, and performance

Weight: moderate.

Accepted when: every bundle and runtime budget in section 6 is met and enforced in the build; reduced motion produces the static path everywhere; a forced capability failure falls back cleanly and records the reason; a hidden tab performs zero render calls; removing WebGL entirely leaves every piece of information and every action reachable.

### Phase 8: semantic completion, preview, and final acceptance

Weight: moderate. This phase cannot complete while the semantic import is blocked on funded model access, which is outside this scope and is not worked around.

Accepted when:

- the complete **197-record semantic import** finishes: 131 source and artifact identities plus 66 event identities, an idle zero-error OpenViking queue, and a replay proving 197 skips with zero creates;
- the identity register reconciles one to one against OpenViking exact reads, with every canonical ID carrying a resolvable URI;
- **Hermes retrieval and citation testing passes**: a defined question set returns relevant memory, every citation resolves to a canonical record, mixed structured and semantic answers are demonstrated, and no citation fails validation;
- the intelligence state moves from `degraded_structured_only` to `full` and the interface reflects it;
- backup and restore of the active database are drilled successfully, including a restore that recovers post-migration sources, events, notes, and identity mappings, not only annotations;
- migration, backup, restore, deployment, monitoring, and rollback are recorded in the existing infrastructure documents with no secret values;
- a full accessibility and usability review passes on desktop and mobile;
- `intel.forkedbrain.fyi` is verified unchanged;
- Mark or Darshan explicitly accepts the private preview.

### Deferred, and explicitly not accepted in this release

- **Telegram writes and ingestion.** Deferred until Hermes gateway sender identity can be securely mapped to an authorized user, including how the mapping is established, how it is revoked, and how a spoofed or forwarded message is rejected. That work is a separate proposal with its own acceptance criteria. Nothing in this release counts Telegram as an accepted write or ingestion channel, and no acceptance test passes on the strength of a Telegram path.
- **In-place OpenViking updates.** Deferred pending the Phase 1B fixture evidence. Append-only revision resources are the shipped design regardless of what that evidence shows, unless a change to this document is separately approved.
- **MCP write tools.** Defined but disabled. Enabled only if Phase 1B proves the deployed Hermes carries trusted conversation identity to MCP through a channel that is not model-visible, not model-writable, and not spoofable by conversation content. Until then every mutation goes through the browser or a typed action intent, and no acceptance test passes on the strength of an MCP write.

### Out of scope, unchanged

No cutover of `intel.forkedbrain.fyi`. No Telegram cutover. No change to Hermes or OpenViking source or native behaviour. No new agent, vector database, memory provider, RAG framework, orchestration service, or scheduler. No AI Tooling or Real Estate branch. No modification of the frozen handoff, the legacy media archive, the old VPS, or existing Cloudflare state. No alternative model provider to unblock the paused import.

## 12. Approval items

1. **Preview hostname and Access application.** `intel-preview.forkedbrain.fyi` on the existing V2 tunnel, same two approved identities, with a separate written plan before any Cloudflare action. Not needed until Phase 8.
2. **Transports, and the gate on them.** Hermes native JSON-RPC and WebSocket on 9119 over the private internal network, and an internal-only MCP endpoint registered with `hermes mcp add`. Both stay behind the Phase 1B proof gate. No Hermes change, MCP registration, service deployment, or Cloudflare change happens until a separate written interface proof plan is approved on its own.
3. **Hermes-side configuration.** One MCP server registration and one `crypto-intelligence` branch skill carrying the routing policy, the citation contract, and the instruction to confirm current note text through `crypto.get_notes` rather than trusting a recalled revision. No Hermes source change.
4. **Backend language.** Node with Fastify for the request path and the MCP endpoint, keeping Python for migration and ingestion support.
5. **One active database.** `crypto-intelligence.db` initialised from the frozen handoff and evolved by forward migrations, holding the migrated corpus, all new intelligence, revision histories, identity mappings, receipts, and one unified FTS index. The frozen handoff stays untouched as the verified migration and rollback source. The active database is backed up and its restore is drilled in Phase 1A and again in Phase 8.
6. **MCP is read only in this release, and mutations flow through typed action intents** validated and executed by the backend under the user's own authenticated session. The acting-user credential never enters prompts, memory, tool arguments, transcripts, traces, or logs. MCP writes are enabled only if Phase 1B proves a trusted, non-model-visible, non-spoofable identity channel.
7. **Append-only memory.** No OpenViking resource is updated in place. Note and draft changes store new deterministic revision resources linked to the canonical record, and currency is established structurally. In-place update is re-proposed only if the Phase 1B fixture proves update, replay, and rollback all safe.
8. **Dashboard-only writes and ingestion.** Authority comes from the Access-verified session the backend already holds, so an intent with no session behind it, including anything from Telegram, has nothing to execute against. Telegram write and ingestion attribution is deferred to a separate proposal and is not counted as accepted in this release.
9. **Media acquisition path.** Backend-side fetch under an allowlist and size cap as the primary route, with a shared staging volume as the documented alternative where Hermes must use its own authenticated session.
10. **Dark only for the first release**, with high contrast and forced-colors support included.
11. **Four category families as a visual lens only**, with the eleven-label taxonomy stored and displayed verbatim and a round-trip test enforcing it.
12. **Two Three.js components**, with the ambient field named as the first candidate for removal if the budget tightens.

On approval of this document, work begins at **Phase 1A only**, which is entirely local and touches no external system. Phase 1B waits for the separately approved interface proof plan.
