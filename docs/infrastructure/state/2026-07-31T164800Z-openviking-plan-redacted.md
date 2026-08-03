# OpenViking Pre-Deployment State — Redacted

**Captured:** 2026-07-31 16:48 UTC  
**Status:** deployment definition frozen; server unchanged

## Before state

- Hermes Agent `0.19.1` is healthy in Coolify with one persistent `hermes_data` volume.
- The existing application stack has no OpenViking container or volume.
- No host or public listener exists for TCP `1933`.
- Hermes uses its built-in memory only; no external memory provider is active.
- No legacy client data has been imported into V2.

## Planned after state

- Official OpenViking `v0.4.11` runs as a second container in the same isolated Compose stack.
- OpenViking uses its own `openviking_data` volume and no public route.
- Hermes connects through the supported native provider at `http://openviking:1933` with a tenant-bound user key.
- Native file encryption and API-key hashing are enabled before any client content is written.
- The existing OpenAI Platform credential is reused inside owner-only runtime configuration for the official OpenAI embedding and VLM providers.

## Explicitly unchanged

- `brain.forkedbrain.fyi`, `manage.forkedbrain.fyi`, and `manage-realtime.forkedbrain.fyi`
- Cloudflare DNS, tunnel ingress, and Access application/policy
- Protected legacy `intel.forkedbrain.fyi` and tunnel `crypto-intel`
- Hermes image, source code, prompts, tools, agent behavior, dashboard route, and persistent data
- Telegram and legacy-data migration state

## Acceptance and rollback

The service is not accepted until health, readiness, isolation, tenant authentication, native Hermes memory tools, restart persistence, and a disposable restore test pass. Rollback restores the prior Compose and disables only the external provider while retaining the OpenViking volume for inspection.
