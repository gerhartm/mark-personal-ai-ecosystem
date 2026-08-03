# Crypto Intelligence V2: Claude Code Dashboard Handoff

**Prepared:** 2026-08-03 05:15 UTC  
**Owner:** Mark Gerhart  
**Implementation boundary:** Codex prepares and verifies the data/backend handoff; Claude Code owns dashboard product design and implementation.

## Product outcome

Build a clean, modern Crypto Intelligence workspace that behaves as the visible Crypto branch of Mark's Personal AI Ecosystem. It should help Mark retain research, recover exact evidence quickly, prepare for panels and fundraising conversations, understand timelines and themes, and turn knowledge into useful content.

The old dashboard is a source of product requirements and preserved data, not a visual template. Claude Code should improve its information architecture and interaction design rather than reproduce it.

## Pinned visual direction

> Follow a premium dark liquid-glass fintech intelligence style with smooth ambient motion, layered translucent surfaces, precise data hierarchy, and restrained cyan-blue accents.

Interpret this as a focused intelligence product, not a generic sci-fi dashboard. The hierarchy and research workflow come first. Glass, depth, glow, and motion should clarify structure and relationships rather than compete with the data.

Use Three.js selectively for a small number of high-value 3D components. Appropriate uses include an ambient intelligence field, a source-to-insight relationship explorer, or a restrained ecosystem visualization. Do not render tables, timelines, text-heavy views, ordinary charts, navigation, forms, or primary controls in WebGL.

Performance and accessibility constraints:

- Use one shared Three.js scene system where practical instead of multiple independent render loops.
- Lazy-load the Three.js bundle and mount it only on routes or states that use it.
- Avoid large textures, expensive post-processing, excessive particles, and always-running offscreen animation.
- Pause rendering when the scene is hidden, offscreen, or the tab is inactive.
- Cap rendering resolution appropriately and preserve a smooth experience on an ordinary laptop.
- Honor `prefers-reduced-motion` and provide a static or lightweight fallback.
- Keep all information and actions available without 3D, animation, hover, or color alone.
- Validate contrast, keyboard navigation, loading, empty, error, and low-performance states.

Before implementation, include a motion and 3D budget in the design proposal. Identify exactly which components use Three.js, why they benefit from depth, when they load, and what their non-3D fallback is.

## Frozen architecture boundary

```text
Dashboard browser
      |
      v
Authenticated dashboard backend
      |--------------------------|
      v                          v
Working structured database      Hermes central brain
(derived from immutable handoff)      |
      |                                v
      v                          OpenViking unified memory
Private legacy media archive     (private; never browser-exposed)
```

- Hermes remains the single central reasoning brain.
- OpenViking remains Hermes's unified long-term memory and retrieval provider.
- The dashboard receives a normalized relational handoff for deterministic views, filters, history, and source linkage.
- Original transcript/audio/video assets remain private files referenced by checksum and stable archive reference.
- Do not introduce another agent, vector database, memory provider, RAG framework, or ingestion service unless a measured requirement proves the native stack cannot meet it.
- Do not modify Hermes or OpenViking source or native behavior.

## Prepared artifacts

The verified server-side handoff is frozen at:

```text
/srv/mark-v2/crypto-dashboard-handoff/v1/
  crypto-dashboard-v2.db
  handoff-manifest.json
  media-manifest.json

/srv/mark-v2/crypto-legacy-media/v1/
  transcripts/
  archive/
```

The SQLite file is an immutable migration input. Create a working copy or explicit migrations for the application; do not mutate the frozen handoff in place.

The raw old-VPS export and credentials are not part of the dashboard workspace. They remain owner-only recovery inputs.

## Verified dataset

| Dataset | Rows |
|---|---:|
| Sources | 47 |
| Events | 66 |
| Normalized event facets | 1,612 |
| Themes / theme-event links | 1 / 51 |
| Content drafts | 41 |
| Quiz sessions | 15 |
| Quiz questions / answers | 107 / 23 |
| Quiz-event links | 176 |
| Pinned summaries | 16 |
| Sanitized conversation sessions / messages | 13 / 614 |
| Media/transcript inventory records | 89 |

Conversation history contains only user/assistant text needed for product continuity. Tool calls, tool results, credentials, cookies, caches, runtime logs, and duplicate backups were deliberately excluded.

The prepared semantic migration separately contains 131 source/artifact resources and 66 linked event resources for:

```text
viking://user/hermes/resources/crypto/
```

That production namespace is intentionally empty at this handoff checkpoint. The first live batch proved the configured OpenAI Platform account had exhausted its credits, so the partial volume was restored to the clean pre-import backup. Dashboard work may use the complete structured/media handoff now; ask-Hermes acceptance and final cutover must wait until a funded provider completes the documented 197-record import and replay.

## Database contract

### Core knowledge

- `sources`: deterministic source identity, URL/label/type/channel, capture time, and title.
- `events`: canonical legacy event ID, source link, dates, text, summaries, notes, category, significance, business signal, and supporting metadata.
- `event_facets`: normalized ordered facets such as tags, entities, insights, implications, and related values.

### Product history

- `themes` and `theme_events`: preserved theme synthesis and event ordering.
- `content_drafts`: generated and edited content history.
- `quiz_sessions`, `quiz_questions`, `quiz_answers`, and `quiz_event_links`: learning history and its source evidence.
- `pin_summaries`: saved per-event summaries.
- `conversation_sessions` and `conversation_messages`: sanitized old assistant conversations.

### Assets and metadata

- `media_assets`: stable archive reference, private relative path, kind, byte count, SHA-256, semantic-memory flag, and event-reference flag.
- `generation_meta` and `metadata`: preserved generation/state metadata and handoff schema information.

All primary source/event IDs and provenance links must remain stable. Display labels and derived UI state may change; canonical identities may not.

## Recommended product capabilities

Claude Code should decide the visual system and final navigation, but the finished product must support:

1. A high-signal intelligence home view rather than a generic admin dashboard.
2. Timeline exploration with useful date, source, category, entity, significance, and tag filters.
3. Fast search and a clear path to ask Hermes across the complete Crypto memory.
4. Answers and generated outputs that retain citations back to canonical sources/events.
5. Source and event detail views with notes, insights, provenance, related records, and transcript/media linkage.
6. Theme and relationship exploration that is comprehensible without visual clutter.
7. Content drafting workflows for panel prep, social posts, and research synthesis.
8. Preserved quiz/history functionality where it serves Mark's recall workflow.
9. Responsive, keyboard-usable, accessible interactions with clear loading, empty, error, and permission states.
10. A design that can later accommodate AI Tooling and Real Estate branches without mixing their data into the Crypto workspace.

## Security and implementation guardrails

- Keep the dashboard private and authenticated.
- Never place provider keys, OpenViking keys, cookies, credentials, raw `.env` values, or server paths in browser code or client-visible payloads.
- The browser must never connect directly to OpenViking.
- Route AI requests through a narrow authenticated backend boundary to Hermes.
- Authorize every media request; do not expose the archive as a public static directory.
- Preserve source citations and distinguish stored facts from newly generated interpretation.
- Keep `intel.forkedbrain.fyi` unchanged until the new dashboard passes acceptance and Mark approves cutover.
- Avoid destructive edits to the frozen handoff, legacy media, Hermes volume, or OpenViking volume.
- Record schema migrations, runtime variables by name only, deployment steps, verification, and rollback in the infrastructure documents without recording secrets.

## Claude Code starting sequence

1. Read this handoff and the migration manifest before touching UI code.
2. Inspect the SQLite schema and representative redacted shapes; do not copy client content into source control, test snapshots, screenshots, logs, or prompts that leave the approved environment.
3. Propose the information architecture, primary user journeys, visual direction, design tokens, component system, motion and 3D budget, and dashboard/backend boundary for Darshan's approval.
4. Create a new isolated dashboard application in the existing Mark project; do not edit Hermes/OpenViking containers.
5. Use a migrated working database while retaining the frozen handoff for reconciliation.
6. Implement authenticated backend reads and Hermes requests before connecting the polished UI.
7. Test every preserved dataset count, source/event link, citation path, media authorization boundary, and failure state.
8. Present the dashboard on an isolated preview hostname. Do not replace the legacy hostname without explicit approval.

## Acceptance gate

Dashboard implementation is not complete until:

- all 66 events and 47 sources reconcile exactly;
- every event resolves to its canonical source;
- all preserved themes, drafts, quiz history, pin summaries, and sanitized conversations are reachable where product-relevant;
- all 89 asset records reconcile to checksum-verified private files or an explicitly documented unavailable state;
- search/ask-Hermes returns relevant memory with source citations;
- authentication and media authorization reject anonymous access;
- no secret is present in frontend bundles, logs, source control, or screenshots;
- desktop and mobile flows pass accessibility and usability review;
- migration, backup, deployment, monitoring, rollback, and legacy cutover steps are documented;
- Mark or Darshan explicitly accepts the preview before any `intel.forkedbrain.fyi` change.

## Out of scope for this handoff

- Visual design decisions and dashboard code by Codex.
- Telegram cutover.
- Legacy hostname cutover.
- AI Tooling and Real Estate branch implementation.
- A browser/desktop environment for Hermes.
- New memory or vector services.
- Destruction or cancellation of the old VPS.
