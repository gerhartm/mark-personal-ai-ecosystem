# Crypto Intelligence dashboard

The web application for research imports, source-backed evidence, interview preparation and writing. React and Vite provide the interface; Fastify and TypeScript provide the API; SQLite stores application records. Hermes handles model work and OpenViking retains research and memory.

[Project overview](../README.md) · [User Guide](../docs/handbook/user-guide.md) · [Development](../docs/development/README.md) · [Configuration](../docs/development/configuration.md)

## Application surfaces

| Page | Purpose |
| --- | --- |
| Topics | Explore claims, categories, sources and supporting passages. |
| Timeline | Inspect dated developments and undated evidence without inventing event dates. |
| Prep | Generate interview or panel preparation from selected research. |
| Haseeb bot / Tarun bot | Produce writing drafts using the configured creator-reference workflows. |
| Sources and imports | Submit research, inspect retained sources and retry failed stages. |
| Saved work | Reopen generated outputs, inputs, citations and writing revisions. |
| Control center | Manage recurring page instructions, topic rebuilds and scheduled intelligence. |

Topics and Timeline refresh stored records every ten seconds while visible and on focus. This refresh does not itself run a new model analysis.

## Imports and documents

The current interface accepts **DOC, DOCX, PDF, TXT, MD, SRT, VTT, CSV and Telegram JSON**, plus article URLs and pasted text. Limits are 5 MB per file, 250,000 extracted characters per imported document and 100 items per server request. The interface splits larger selections into bounded requests.

Scanned PDFs need OCR before upload; audio and video need transcripts. There is no current ZIP-import or dedicated Telegram batch-capture interface. [Upload workflow and failure stages](../docs/guides/uploads.md).

## Build the code

Use **Node.js 22**, matching the Dockerfiles. From this directory:

```bash
cd server
npm ci
npm run typecheck
npm run build
cd ../web
npm ci
npm run typecheck
npm run build
```

These commands compile the code; they do not initialise a working research system. Runtime and integration tests require an isolated compatible database and, where relevant, isolated or mocked service dependencies. The private frozen handoff and live research database are not included in Git. Follow [Development](../docs/development/README.md) before starting the API.

`npm run build:db` reconstructs the migrated baseline from a verified private handoff. It is **not** a routine production upgrade command. Do not run it against a live database or bypass its protection with `--force`.

## Code map

| Path | Responsibility |
| --- | --- |
| [`web/src/App.tsx`](web/src/App.tsx) | Browser routes and application entry. |
| [`web/src/screens/`](web/src/screens/) | Dashboard pages and their controls. |
| [`server/src/index.ts`](server/src/index.ts) | API routes and worker startup. |
| [`server/src/imports.ts`](server/src/imports.ts), [`documents.ts`](server/src/documents.ts) | Import queue, document validation and extraction. |
| [`server/src/ingestion.ts`](server/src/ingestion.ts), [`telegram-sync.ts`](server/src/telegram-sync.ts) | Retention, canonical identity and Satoshi registration. |
| [`server/src/source-processor.ts`](server/src/source-processor.ts), [`source-queue.ts`](server/src/source-queue.ts) | Evidence processing and durable checkpoints. |
| [`server/src/hermes-client.ts`](server/src/hermes-client.ts) | Native Hermes integration. |
| [`server/src/workflows.ts`](server/src/workflows.ts) | Prep and creator generation. |
| [`server/src/db.ts`](server/src/db.ts) | Runtime database setup and forward schema changes. |
| [`server/test/`](server/test/) | Backend regression and integration tests. |
| [`Dockerfile`](Dockerfile), [`Dockerfile.checks`](Dockerfile.checks) | Production image and isolated release-test image. |

## Production changes and restore

Production uses the controlled host release helper and `satoshi-dashboard` branch. The committed Compose file can contain a historical image reference; the live release ledger determines what is deployed. Use the existing release process rather than redeploying an old reference.

Each published editor change receives a Git commit. Restoring a prior published version creates another commit and preserves history. It does not restore an old research database. [Editing and rollback](../docs/operations/dashboard-editing.md).

## Verification

The 21 September acceptance record includes 137 backend tests, eight document extraction tests, nine isolated HTTP ingestion tests, ten browser checks and a native Hermes edit followed by restore. These are historical results for that release, not a claim that all tests ran again for these docs. [Evidence and limits](../docs/verification/README.md).
