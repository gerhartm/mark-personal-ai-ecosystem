# Project entry: Crypto Intelligence

Start with `README.md`, `dashboard/README.md` and `docs/README.md`. The reviewed handbooks describe the current implementation. Older design proposals and infrastructure notes are historical evidence and can describe superseded screens, models or login methods.

Read `docs/development/README.md` before running the application or tests. Use isolated data and preserve the private frozen handoff. Read `docs/operations/dashboard-editing.md` before publication: `satoshi-dashboard`, its remote and the host release ledger must remain consistent.

Hermes is the assistant runtime, OpenViking is the retained memory service, and SQLite stores dashboard records and queues. Preserve citation provenance, canonical source identity and research integrity. A code restore does not restore a database.

Keep credentials, raw exports, production databases and private media out of Git and generated client output. Use private access channels for secrets. Record runtime changes and verification honestly; distinguish historical, isolated and live tests.

The dedicated dashboard editor is pinned to GPT-6 Astra High. Its restrictions and release controls do not provide general VPS administration or an independent OS sandbox.

Never add AI or Codex co-author attribution to commit messages.
