# Crypto Intelligence response-quality completion

**Release:** `20260904T141918Z`

**Accepted:** 2026-09-04

**Scope:** behavior and evidence handling behind Mark's existing five-screen Lovable interface

## Outcome

The visible interface remains Mark's exact five-screen structure:

1. Topics
2. Timeline
3. Prep
4. Haseeb bot
5. Tarun bot

Dark mode remains the only intentional visual addition. No old dashboard tab, seeded record, sample response, fake count, or dummy action was restored.

The work completed the response and workflow behavior requested in Mark's structured feedback. Topic evidence is readable and links to original sources when available. Timeline covers all retained years, uses distinct supporting-source counts, and opens clear event and source context. Prep returns an answer-led overview, selected tangents, supporting points, explicit uncertainty, exact sources, and quote-level evidence.

Haseeb bot and Tarun bot now combine retained creator-specific material with bounded crypto evidence. The server enforces requested output count, platform format, tone, length, real post shape, citation resolution, exact quotations, evidence notes, and append-only revisions. Internal evidence IDs are rejected if they appear inside publishable copy and remain available only in Works cited.

## Defects found during acceptance

The real canary pass found two issues that mocked interface states could not reveal:

- a Haseeb draft placed an internal evidence ID inside the post text;
- Tarun generation depended on a separate Creator Reference lookup even though Tarun material already existed in the retained corpus.

Both were corrected before production promotion. Publishable-copy validation now blocks evidence-ID leakage, and creator generation explicitly retrieves retained Haseeb or Tarun records in addition to topical evidence.

## Automated verification

- Server TypeScript check passed.
- Server production build passed.
- Web production build passed.
- All 91 server tests passed across 10 test files.
- Production dependency audits reported zero known vulnerabilities.
- `git diff --check` passed.
- Deployment scripts passed shell syntax validation.

## Browser acceptance

The local build, isolated production canary, and promoted production image each passed all 53 Chrome checks. The checks covered:

- exactly five visible navigation destinations;
- live topic cards, filters, detail, claims, and source evidence;
- historical Timeline controls, month density, categories, event detail, and source reading;
- structured Prep generation, five supporting points, uncertainty, quotes, and exact sources;
- Haseeb generation, realistic post length, copying, citations, and revision preservation;
- Tarun blog generation, requested word range, rendered headings, and citations;
- persistent dark mode;
- desktop layout;
- 390-pixel mobile layout;
- no horizontal overflow;
- zero failed first-party requests;
- zero browser console errors;
- no raw Markdown markers in user-facing evidence or generated output.

## Real Hermes acceptance

A copied disposable production database was used for a bounded set of real Hermes checks. The final accepted checks produced:

- a five-point Aave Prep brief with a concise overview, uncertainty, and resolved sources;
- a Haseeb post in the requested character range;
- a Haseeb revision that preserved the prior draft and changed only the requested framing;
- a 314-word Tarun article with readable headings and three resolved sources.

The final outputs contained no internal evidence IDs in publishable copy. All canary test drafts were discarded before promotion, so production data was not polluted. These checks used paid model calls; build, static browser acceptance, and deployment checks did not.

## Production acceptance

- container: `crypto-dashboard`
- image: `mark-crypto-dashboard:20260904T141918Z`
- image digest: `sha256:9697e390acdd66725c6e91e9db7f6f0bc804bf13a9b4b00c30fd93a4618a5434`
- loopback origin: `127.0.0.1:9330`
- health: `healthy`
- restarts at acceptance: `0`
- runtime user: `dashboard`
- root filesystem: read only
- Linux capabilities: all dropped
- `no-new-privileges`: enabled
- SQLite quick check: `ok`
- SQLite integrity check: `ok`
- foreign-key violations: `0`
- canonical events: `66`
- canonical sources: `54`
- media assets: `89`

Mark and Marimar both returned HTTP `200` through the approved origin identity boundary. Missing identity returned HTTP `401`. Public HTTPS redirected to Cloudflare Access, public HTTP redirected to HTTPS, and `intel.forkedbrain.fyi` remained HTTP `200`.

## Recovery

- immediate rollback container: `crypto-dashboard-rollback-20260903T163620Z`
- immediate rollback image: `mark-crypto-dashboard:20260903T163620Z`
- pre-promotion database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260904T141918Z/crypto-intelligence.db`
- previous deployment definition: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260904T141918Z`

Restore the database only when data rollback is explicitly required. An application-only rollback can use the retained container and current database.

## Unchanged systems

- Cloudflare DNS, tunnel, and Access policy
- Hermes source and provider configuration
- OpenViking source and storage
- Satoshi gateway and allowlist
- ForkedBrain application
- legacy VPS and `intel.forkedbrain.fyi`
