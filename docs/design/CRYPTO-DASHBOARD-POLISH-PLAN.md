# Crypto Intelligence workflow polish

**Date:** 2026-08-05
**Status:** implemented and accepted in release `20260805T123859Z`

## Product job

Give Mark one private workspace where stored crypto intelligence becomes four useful outcomes: a grounded answer, a knowledge check, publishable content, or a speaking brief.

## Audience and hierarchy

- **Primary user:** Mark, usually returning with a question or a topic.
- **Secondary users:** authorized staff reviewing sources and prepared outputs.
- **Primary actions:** Ask, Quiz, Create content, Prepare to speak.
- **Supporting actions:** capture, browse, timeline, connections, and history.

## Visual system

This release extends the existing token system without adding a second visual language.

- Surfaces remain dark blue-black with opaque reading panels and glass only in the frame.
- Cyan remains the single interaction accent.
- IBM Plex Sans remains the interface face, Serif remains stored source prose, and Mono remains canonical identity.
- New task launchers use existing spacing, card radius, hairlines, status colors, and motion tokens.
- The interface stays data-first. No decorative metrics, extra gradients, badges, or new Three.js scenes.

## Content skeleton

1. Brief adds a compact action desk for the four primary workflows.
2. Ask becomes a dedicated page while the existing command search remains available.
3. Studio opens with clear output choices and keeps the draft archive beneath them.
4. Recall becomes Quiz and gains a live five-question generation, answer, and scoring loop.
5. Mobile keeps the same information hierarchy and preserves every primary action.

## Intelligence boundary

- Hermes remains the only reasoning and generation layer.
- SQLite remains the only structured product database.
- OpenViking remains semantic memory.
- Ask and Studio reuse their existing Hermes path.
- Quiz adds one Hermes call to create a session and one Hermes call to grade all answers together, keeping cost and latency bounded.
- No new vector store, agent runtime, search service, or model router is introduced.

## Acceptance

- Each requested workflow is visible without knowing a keyboard shortcut.
- Every generated answer, draft, quiz question, and quiz result is tied to stored evidence.
- Empty, loading, error, generating, completed, and disconnected states are explicit.
- Keyboard focus, narrow layouts, and reduced motion remain supported.
- Existing database identity, provenance, and migrated records remain unchanged.
