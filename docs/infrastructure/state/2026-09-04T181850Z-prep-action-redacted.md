# Crypto Intelligence Prep action release

**Release:** `20260904T181850Z`

**Accepted:** 2026-09-04

## Scope

This release restores the visible `Generate with Hermes` action to the bottom right of Mark's Prep input card. It retains the existing Enter-key shortcut, structured Hermes generation endpoint, evidence contract, and exact Lovable composition.

## Verification

- Web and server production builds passed.
- All 92 server tests passed across ten test files.
- All 73 Chrome checks passed locally, in an isolated production canary, and after production promotion.
- The browser clicked the restored button and received five source-backed Prep points.
- Direct quotes, counterarguments, exact sources, clean formatting, dark mode, and desktop and mobile layouts passed.
- No first-party request failed and no browser console error occurred.
- Production dependency audits found zero vulnerabilities.
- No paid model call was made.

## Production

- container: `crypto-dashboard`
- image: `mark-crypto-dashboard:20260904T181850Z`
- image ID: `sha256:710aa10d17b860042703a627b22a62d30e1bd1a257ea907757f0ee637d4b1b37`
- health: `healthy`
- restarts at acceptance: `0`
- canonical events: `66`
- canonical sources: `54`
- media assets: `89`
- origin binding: `127.0.0.1:9330`

## Recovery

- immediate rollback container: `crypto-dashboard-rollback-20260904T174126Z`
- immediate rollback image: `mark-crypto-dashboard:20260904T174126Z`
- pre-promotion database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260904T181850Z/crypto-intelligence.db`
- previous deployment definition: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260904T181850Z`

Cloudflare, Hermes, OpenViking, Satoshi, ForkedBrain, and the legacy Intel service were unchanged.
