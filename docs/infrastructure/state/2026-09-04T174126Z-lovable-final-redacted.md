# Crypto Intelligence final Lovable parity release

**Release:** `20260904T174126Z`

**Accepted:** 2026-09-04

## Scope

This release makes Mark's freshest preserved Lovable project the literal visual and interaction specification for the five visible Crypto Intelligence screens. Topics, Timeline, Prep, Haseeb bot, and Tarun bot retain the approved design while using the existing production database, Hermes generation boundary, OpenViking memory, Telegram synchronization, identity, and evidence contracts.

Dark mode is the only intentional visual addition. No seeded record, mock response, fake count, legacy dashboard tab, or dummy action is present.

## Verification

- Web and server production builds passed.
- All 92 server tests passed across ten test files.
- All 72 Chrome checks passed locally, in an isolated production canary, and after production promotion.
- Desktop and mobile layouts passed without horizontal overflow.
- Timeline year and month color filtering, expanded evidence dossiers, source cards, sourced reactions, and next-signal navigation passed.
- Prep returned five readable source-backed points with direct quotes, limitations, and exact sources.
- Haseeb and Tarun output shape, length, citations, copy behavior, revision continuity, and rendered Markdown passed.
- Settled dark-mode surfaces and text contrast passed.
- No first-party request failed and no browser console error occurred.
- No paid model call was made.

## Production

- container: `crypto-dashboard`
- image: `mark-crypto-dashboard:20260904T174126Z`
- image digest: `sha256:7693f82d2ae02eabc7c6fe191330a018fa7adb5bf6a1aba87d2f8099269575b3`
- health: `healthy`
- restarts at acceptance: `0`
- canonical events: `66`
- canonical sources: `54`
- media assets: `89`
- origin binding: `127.0.0.1:9330`

## Recovery

- immediate rollback container: `crypto-dashboard-rollback-20260904T150300Z`
- immediate rollback image: `mark-crypto-dashboard:20260904T150300Z`
- pre-promotion database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260904T174126Z/crypto-intelligence.db`
- previous deployment definition: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260904T174126Z`

Cloudflare configuration, Hermes, OpenViking, Satoshi, ForkedBrain, and the legacy Intel service were unchanged.
