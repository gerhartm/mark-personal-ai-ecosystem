# Mark Lovable exact frontend release

**Release:** `20260903T163620Z`

**Accepted:** 2026-09-03

**Scope:** Crypto Intelligence frontend and its existing dashboard API only

## Outcome

The freshest preserved Lovable export is now the literal production frontend specification. The application exposes the same five screens, in the same order, with the same visible structure:

1. Topics
2. Timeline
3. Prep
4. Haseeb bot
5. Tarun bot

The Lovable shell, labels, typography, dimensions, spacing, borders, controls, charts, output states, feedback controls, citations, and responsive rules are retained. Dark mode is the only intentional visual addition. Light mode is the default and a saved preference persists across sessions.

All seeded records, fake totals, mock actions, and sample creator responses were removed. Visible counts, topics, claims, speakers, dates, sources, and generated results come from the existing production database and API boundaries.

The existing Ask, Quiz, Studio, Capture, source, and synchronization capabilities remain available to approved backend clients. They are not exposed as extra tabs in Mark's five-screen interface.

## Implementation corrections

- Removed the legacy global style imports that were overriding Mark's Lovable layout.
- Kept only the Lovable-aligned style and token layers in the active application entry point.
- Matched the navigation rail, active states, typography, card grid, filters, and detail hierarchy to the fresh export.
- Returned real topic claim counts and related tags from the dashboard API.
- Rebuilt topic detail around real claims, speakers, sources, date windows, source types, related tags, and stance values.
- Kept Prep's visible interaction aligned with the mock while connecting it to the existing Hermes generation boundary.
- Preserved the Haseeb and Tarun layouts while replacing demo output with real Creator Reference generation.
- Fixed an effect cleanup fault discovered during real browser navigation before final acceptance.
- Updated compatible server and web dependencies so both production audits report zero known vulnerabilities.

## Automated verification

- Web production build passed.
- Server TypeScript check passed.
- Server production build passed.
- All 87 automated server tests passed across nine test files.
- Web dependency audit reported zero known vulnerabilities.
- Server production dependency audit reported zero known vulnerabilities.
- `git diff --check` passed before checkpointing.
- API health, brief, topics, selected topic, timeline, sources, and drafts checks returned HTTP `200`.
- Selected topic contract returned 65 topics, 39 Aave claims, eight Aave sources, and eight related tags.

## Browser acceptance

The exact release image passed interactive browser checks for:

- Topics to Timeline to Prep to Haseeb bot to Tarun bot to Topics navigation;
- opening the Aave topic detail from a real topic card;
- real topic filters and 39 real Aave claims;
- light and dark theme switching;
- desktop layout and content hierarchy;
- a true 390 by 844 mobile viewport;
- 65 loaded topic cards on mobile;
- zero horizontal overflow at 390 pixels;
- zero browser exceptions;
- zero failed browser requests.

Candidate `20260903T162235Z` was promoted briefly during verification. Interactive browser navigation exposed an effect cleanup fault. It was immediately superseded by release `20260903T163620Z`, which passed the same complete navigation sequence without errors.

## Production acceptance

The accepted container is `crypto-dashboard`, image `mark-crypto-dashboard:20260903T163620Z`, published only on `127.0.0.1:9330`.

Post-promotion checks verified:

- container health is `healthy` with zero restarts;
- runtime user is non-root user `dashboard`;
- the root filesystem is read only;
- all Linux capabilities are dropped;
- `no-new-privileges` is enabled;
- the six authenticated routes `/`, `/timeline`, `/prep`, `/haseeb`, `/tarun`, and `/topics/aave` return HTTP `200`;
- an unauthenticated origin request returns HTTP `401`;
- public HTTPS redirects to Cloudflare Access;
- public HTTP redirects to HTTPS;
- `intel.forkedbrain.fyi` remains HTTP `200` and unchanged.

No paid model call was used during build, canary, browser, deployment, or post-promotion acceptance.

## Recovery

- Preferred known-good rollback container: `crypto-dashboard-rollback-20260903T131714Z`
- Preferred known-good rollback image: `mark-crypto-dashboard:20260903T131714Z`
- Rejected candidate container: `crypto-dashboard-rollback-20260903T162235Z`
- Pre-promotion database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260903T163620Z/crypto-intelligence.db`
- Previous deployment definition: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260903T163620Z`
- Accepted image digest: `sha256:a5168548b7ef389ba9f2789e335bd4be8a7079179fedd94fc859cab0a7cc1597`

Candidate `20260903T162235Z` must not be used as a rollback target. Application rollback should use the retained `20260903T131714Z` release. Restore a database backup only when a data rollback is explicitly required because an application-only rollback does not require discarding newer ingested data.

## Unchanged systems

- Cloudflare DNS, tunnel, and Access policy
- Hermes source and provider configuration
- OpenViking source and storage
- Satoshi gateway and allowlist
- ForkedBrain application
- legacy VPS and `intel.forkedbrain.fyi`

