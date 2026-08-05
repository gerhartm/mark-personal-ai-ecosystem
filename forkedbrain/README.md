# ForkedBrain Command Center

Private interface for Mark's Personal AI Ecosystem.

The current experience includes:

- a dark-default command center with the central brain and active intelligence branches
- a live, force-directed memory graph capped at 20 total nodes and ranked from the existing Crypto data, including retained research conversations
- real memory details, provenance, metadata, insights, and original-source links
- selected-memory chat through Hermes's native authenticated dashboard transport
- a clear distinction between the operational Crypto Intelligence branch and future branches
- an About Mark view and private workspace index
- light and dark themes with reduced-motion support
- responsive layouts from mobile to large displays

## Architecture

ForkedBrain does not add another database, memory provider, or reasoning service. It reads the verified Crypto SQLite handoff in read-only mode, calls the existing Hermes service for reasoning, and leaves OpenViking as Hermes's native persistent-memory provider.

Production boundaries:

- standalone Next.js container running as UID `1001`
- read-only container root filesystem
- read-only database mount at `/data/crypto-intelligence.db`
- loopback-only host binding at `127.0.0.1:9320`
- existing private application network for Hermes access
- Cloudflare Access required before any browser API can be used
- no Docker socket, public container port, or Hermes/OpenViking source change

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

## Production

Current release: `20260805T152846Z`
Private URL: `https://forkedbrain.fyi/`

Server paths:

- releases: `/srv/mark-v2/forkedbrain/releases/`
- current release link: `/srv/mark-v2/forkedbrain/current`
- runtime database copy: `/srv/mark-v2/forkedbrain/data/crypto-intelligence.db`
- runtime environment: `/srv/mark-v2/secrets/forkedbrain.env`
- Hermes password file: `/srv/mark-v2/secrets/forkedbrain-hermes-password`

The container image is `mark-forkedbrain:<release>`. Operational commands, rollback, database refresh, and acceptance checks are documented in `docs/infrastructure/RUNBOOK.md`.

The root hostname is routed through the isolated V2 Cloudflare tunnel and protected by the existing exact-email Cloudflare Access policy for Mark and Darshan. The origin remains bound only to VPS loopback.

## Known provider state

Hermes authentication and transport are working. The currently configured OpenAI Platform provider has no remaining credits, so selected-memory chat returns an explicit temporary-unavailable response until Mark funds the provider or approves another model provider. The graph, inspector, search, filtering, and source retrieval remain operational without model spend.
