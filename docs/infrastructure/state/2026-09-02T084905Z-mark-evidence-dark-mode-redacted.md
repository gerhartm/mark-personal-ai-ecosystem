# Mark evidence and dark-mode completion

**Release:** `20260902T084905Z`

**Accepted:** 2026-09-02

**Scope:** Crypto Intelligence dashboard only

## Outcome

The remaining product-quality work was completed behind Mark's accepted Lovable frontend. The navigation, information architecture, route order, typography hierarchy, and core layouts were preserved.

The release adds:

- a bounded source overview and up to six distinct key arguments;
- clear event fields for what happened, source context, and key evidence;
- direct, plain-language Ask instructions with named sources and inline canonical citations;
- clickable evidence links in general Ask and source-scoped Ask;
- real-corpus topic filters for Studio source selection;
- exact output contracts for X posts, X threads, LinkedIn posts, speaking preparation, and review briefs;
- server-side format and citation validation before Studio drafts are saved;
- one bounded correction attempt when a generated Studio draft misses its contract;
- a persistent light and dark theme switch that follows the system preference until the user makes a choice.

No new database, vector store, memory provider, model provider, agent, scraper, or reasoning service was added. Hermes remains the brain, OpenViking remains the semantic memory, and `crypto-intelligence.db` remains the structured corpus.

## Automated verification

- server TypeScript check passed;
- web TypeScript check passed;
- server production build passed;
- web production build passed;
- all 87 server tests passed;
- production dependency audits reported zero known vulnerabilities;
- deployment scripts passed shell syntax validation;
- `git diff --check` passed;
- active application source contained no Lovable sample records or seeded timeline data;
- light and dark foreground, muted, accent, button, and focus colors passed the measured contrast targets used for this release.

## Canary acceptance

The immutable image `mark-crypto-dashboard:20260902T084905Z` was started as an isolated canary on `127.0.0.1:9331` against a SQLite backup of the live production database.

The canary verified:

- requests without an authenticated identity returned HTTP `401`;
- the approved Mark identity returned HTTP `200`;
- 66 events, 54 sources, and 89 media assets were present;
- database quick check passed and foreign-key violations were zero;
- migrations `006` and `007` were present;
- Hermes, OpenViking, intelligence status, Studio, Quiz, ingestion, and Telegram synchronization boundaries were connected;
- the private synchronization endpoint rejected a missing credential;
- source briefs, event presentation fields, timeline takeaways, and theme assets were present;
- the container ran as `dashboard` with a read-only root filesystem, all Linux capabilities dropped, and `no-new-privileges`;
- zero paid model calls were made.

## Production acceptance

The accepted container is `crypto-dashboard`, image `mark-crypto-dashboard:20260902T084905Z`, published only on `127.0.0.1:9330`.

Post-promotion checks verified:

- both approved Mark and Mari identities returned HTTP `200` at the origin;
- requests without identity returned HTTP `401`;
- source briefs and event presentation fields resolved from real production records;
- Timeline included stored dates from 2000 through 2026 and returned source takeaways;
- light and dark theme assets were served from the production image;
- SQLite quick check and integrity check returned `ok`;
- foreign-key violations were zero;
- all seven source synchronization jobs were `ready` and no job was failed;
- the production container was healthy with zero restarts;
- the root filesystem was read only, runtime user was non-root, all capabilities were dropped, and the origin remained loopback only;
- unauthenticated public HTTPS redirected to Cloudflare Access;
- public HTTP redirected to HTTPS;
- `intel.forkedbrain.fyi` remained HTTP `200` and unchanged.

No paid model call was used during deployment or post-promotion acceptance.

## Recovery

- Previous container: `crypto-dashboard-rollback-20260902T073200Z`
- Previous state: stopped with automatic restart disabled
- Database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260902T084905Z/crypto-intelligence.db`
- Previous deployment definition: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260902T084905Z`
- Current immutable image digest: `sha256:a341579be70d08fe80b3d47c257269d3d61eac74f20d1e2f45e1573dd3c82a31`

Rollback requires stopping the current container, restoring the retained predecessor and matching deployment definition, and restoring the pre-promotion database only if a data rollback is explicitly required. Database restoration must never be inferred from an application rollback because it can discard newer ingested records.

## Unchanged systems

- Cloudflare DNS, tunnel, and Access policy
- Hermes source and provider configuration
- OpenViking source and storage
- ForkedBrain application
- Satoshi gateway and allowlist
- legacy VPS and `intel.forkedbrain.fyi`
