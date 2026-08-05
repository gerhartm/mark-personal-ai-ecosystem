# Crypto Intelligence command center

**Date:** 2026-08-05
**Status:** implementation contract

## Product job

Give Mark one private daily intelligence surface that answers three questions immediately:

1. What matters now?
2. What changed since the last review?
3. What should I do next?

The existing grounded Ask, Quiz, Content Studio, Speaking Preparation, Capture,
Timeline, Library, and Connections workflows remain intact. This pass improves
how they work together. It does not add a second brain, memory service, agent
runtime, database, or scraper.

## Intelligence boundary

- Hermes remains the only reasoning and agent layer.
- Hermes native web search and browser tools handle live research.
- SQLite remains the only structured product database.
- OpenViking remains the unified semantic memory.
- The dashboard schedules at most one bounded intelligence refresh every 24
  hours and stores only the latest validated brief in the existing
  `generation_meta` table.
- Refreshes are also available on demand. Concurrent or repeated refreshes are
  collapsed so they do not create avoidable model spend.
- Hermes may research and recommend. It may not publish, send messages, modify
  accounts, or perform external actions from this workflow.

## Content skeleton

1. **Today:** concise Hermes synthesis and the latest refresh state.
2. **Needs attention:** up to three time-sensitive items, ordered by urgency.
3. **What changed:** up to five sourced changes from bounded live research.
4. **Suggested actions:** useful next steps that open existing product workflows.
5. **Watchlists:** dynamically derived from the strongest entities in the corpus.
6. **Continue:** recently viewed evidence and recent drafts.
7. **System activity:** corpus scale, memory connection, and the last intelligence run.
8. **Quick actions:** Ask, Quiz, Content Studio, and Speaking Preparation.

## Visual system

The accepted design language remains unchanged:

- dark blue-black surfaces with opaque reading panels;
- restrained cyan for interaction only;
- IBM Plex Sans for interface, Serif for stored evidence, and Mono for identity;
- liquid glass limited to the frame, not body copy;
- the existing ambient field remains the single decorative depth effect;
- responsive layouts preserve the same priority from wide displays to phones;
- reduced motion, keyboard focus, empty, loading, error, stale, refreshing, and
  completed states are explicit.

## Acceptance

- The home screen is useful before a user clicks anything.
- A refresh runs through a full Hermes agent session and uses Hermes native tools.
- Every live change includes a real URL returned by Hermes.
- Invalid or incomplete model output is rejected and never replaces the last
  accepted brief.
- Ask, Quiz, Studio, Speaking Preparation, Capture, Library, Timeline,
  Connections, Archive, and media access continue to pass their existing tests.
- The public site remains behind the current exact-email Cloudflare Access gate.
