# Claude Code project entry: Mark Crypto Intelligence V2

Before dashboard work, read these documents in order:

1. `docs/migration/CLAUDE-CODE-DASHBOARD-HANDOFF.md`
2. `docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md`
3. `docs/infrastructure/README.md`
4. `docs/infrastructure/RUNBOOK.md`

Claude Code owns dashboard product design and implementation. Begin by proposing the information architecture, primary workflows, visual direction, component system, and authenticated frontend/backend boundary for Darshan's approval. Do not copy the old dashboard or begin with an unreviewed UI implementation.

Use this pinned visual direction: "Follow a premium dark liquid-glass fintech intelligence style with smooth ambient motion, layered translucent surfaces, precise data hierarchy, and restrained cyan-blue accents."

Use Three.js selectively for beautiful, meaningful 3D components such as an ambient intelligence field or relationship explorer. Keep research, filtering, timelines, tables, reading, and primary controls in accessible HTML, CSS, SVG, or Canvas. The dashboard must remain fast and data-first: lazy-load Three.js, use one shared scene system where practical, avoid large textures and continuous decorative effects, provide a lightweight fallback, and honor `prefers-reduced-motion`. No information or action may depend on 3D.

The immutable structured handoff and private media archive are already checksum-verified on the V2 VPS. Use a working database copy/migrations; never mutate the frozen handoff or serve media publicly.

The 197-record OpenViking semantic import is prepared but production memory is intentionally empty because the configured OpenAI Platform account has exhausted its credits. Do not work around that with a new provider, local model, or architecture change without Darshan's explicit approval.

Preserve these boundaries:

- Hermes is the single central brain; OpenViking is its private unified memory.
- Do not modify Hermes/OpenViking source or native behavior.
- Do not add another agent, vector database, memory service, or RAG stack without a measured gap and approval.
- Do not change Cloudflare, DNS, tunnels, `intel.forkedbrain.fyi`, the old VPS, or production hostnames without presenting a plan and receiving explicit approval.
- Keep credentials, raw exports, client content, and server paths out of source control, frontend bundles, screenshots, logs, and ordinary documentation.
- Build and validate on an isolated private preview before any legacy cutover.

Record every runtime/schema/deployment change, verification, and rollback in the existing infrastructure documents. Never record secret values.
