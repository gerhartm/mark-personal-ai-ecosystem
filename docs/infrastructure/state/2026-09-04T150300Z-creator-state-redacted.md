# Crypto Intelligence creator-state completion

**Release:** `20260904T150300Z`

**Accepted:** 2026-09-04

## Scope

This release retains Mark's exact five-screen frontend and the structured response-quality work accepted in release `20260904T141918Z`. It corrects one final interaction edge: changing a creator workflow from tweet to blog, or from blog to tweet, clears incompatible prior output instead of reinterpreting it under the newly selected format.

No Hermes prompt, provider, model, source, database, ingestion, identity, or access configuration changed.

## Verification

- Runtime source matched the canary build source by SHA-256 hash.
- Server TypeScript and production builds passed.
- Web production build passed.
- All 91 server tests passed against a disposable database and live built server.
- All 54 Chrome checks passed locally, in the isolated production canary, and after production promotion.
- Desktop and 390-pixel mobile layouts passed without horizontal overflow.
- No first-party request failed and no browser console error occurred.
- No additional paid model call was needed because the Hermes workflows were unchanged from the real-service acceptance in release `20260904T141918Z`.

## Production

- container: `crypto-dashboard`
- image: `mark-crypto-dashboard:20260904T150300Z`
- image digest: `sha256:68623cc4b7d29460d553a25c7250eb7c3e99c3bb880abe5743bc53ffd7e82f77`
- health: `healthy`
- restarts at acceptance: `0`
- canonical events: `66`
- canonical sources: `54`
- media assets: `89`

## Recovery

- immediate rollback container: `crypto-dashboard-rollback-20260904T141918Z`
- immediate rollback image: `mark-crypto-dashboard:20260904T141918Z`
- pre-promotion database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260904T150300Z/crypto-intelligence.db`
- previous deployment definition: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260904T150300Z`
