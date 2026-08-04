# Crypto Capture Release Snapshot (Redacted)

**Captured:** 2026-08-04 07:18 UTC
**Release:** `20260804T071121Z`
**Status:** production healthy; native ingestion awaiting funded embeddings

## Accepted scope

- An authenticated Capture screen accepts a URL or pasted text.
- The existing Crypto backend computes stable source identity, skips exact
  duplicates, exposes non-secret receipts, and registers data only after
  OpenViking's native resource path accepts it.
- Hermes remains the only reasoning brain and OpenViking remains the only
  semantic-memory provider.
- No custom scraper, queue, vector database, RAG framework, memory engine, model
  credential, or additional agent was added.

## Runtime boundary

- Container: `crypto-dashboard`
- Image: `mark-crypto-dashboard:20260804T071121Z`
- Origin: `127.0.0.1:9330`
- Runtime user: `dashboard`
- Root filesystem: read only
- Capabilities: dropped
- Privilege escalation: disabled
- Writable application mount: active database directory only
- OpenViking access: existing tenant-scoped key through a read-only file mount
- Provider keys: none in the image, environment, source, logs, or repository

## Acceptance evidence

- 65 of 65 server tests passed.
- Server and web type checks and production builds passed.
- URL, text, normalization, duplicate, provider-failure, partial-write cleanup,
  locked-resource safety, and receipt behavior passed in isolated tests.
- Desktop and mobile Capture screens were inspected.
- Canary and production reported the existing OpenViking service configured and
  connected.
- Database integrity was `ok`, with zero foreign-key violations.
- Existing counts remained 66 events, 47 sources, and 89 media files.
- Ask remained connected to Hermes.
- `crypto.forkedbrain.fyi` remained protected by Cloudflare Access.
- `intel.forkedbrain.fyi` remained unchanged and returned HTTP `200`.

## Native failure behavior

The disposable live canary reached OpenViking and reconfirmed that the configured
OpenAI embedding project has no credits. OpenViking can materialise a requested
target before the failed semantic task releases its lock. The application now
removes an exact remote-only target before retry, attempts exact cleanup after a
native failure, and reports `memory_processing` if the resource is still locked.
It never registers that resource as ready locally. Both synthetic canary targets
were removed; production contains no synthetic source or partial client import.

## Recovery

- Prior image: `mark-crypto-dashboard:20260804T065421Z`
- Stopped rollback container: `crypto-dashboard-rollback-20260804T065421Z`
- Pre-promotion database backup:
  `/srv/mark-v2/crypto-dashboard/backups/pre-20260804T071121Z/crypto-intelligence.db`

Restore the database backup and recreate the prior image with its prior mounts,
environment, loopback origin, network, and hardening. Do not change Hermes,
OpenViking, Cloudflare, ForkedBrain, the legacy content, or
`intel.forkedbrain.fyi` during this application rollback.

## Remaining gate

Add credits to the existing OpenAI Platform project or explicitly approve a
different supported embedding provider. Then run one disposable fixture through
native acceptance, search, exact read, and cleanup before submitting client data
or resuming the prepared 197-record semantic import.
