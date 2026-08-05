# Crypto Intelligence command center, redacted state

**Accepted:** 2026-08-05 14:52 UTC
**Release:** `20260805T143933Z`

## Product state

- The Brief is a decision-oriented command center with a sourced daily review,
  attention items, changes, watchlists, suggested actions, strongest stored
  signals, recent work, and system activity.
- Ask, evidence-linked Quiz, X and LinkedIn creation, review briefs, Speaking
  Preparation, Capture, and Library remain directly accessible.
- Suggested actions hand focused context into the existing workflows instead of
  creating another agent or state layer.
- Desktop, mobile, reduced-motion, and high-contrast layouts were visually
  accepted in a real Chrome browser.

## Architecture and cost boundary

- Hermes remains the only reasoning and agent layer.
- OpenViking remains the only semantic-memory provider.
- The existing Crypto SQLite file remains the only structured product store;
  the accepted briefing is stored in its existing `generation_meta` table.
- Hermes uses its official key-free DDGS web-search backend. No custom scraper,
  queue, database, vector store, memory provider, agent runtime, or model
  provider was added.
- Automatic reviews run at most once per 24 hours. Manual refresh is limited to
  once per 10 minutes per authenticated user and IP. A failed review preserves
  the last accepted result and scheduled failures back off for 24 hours.
- The accepted production review's Hermes session was estimated at about $0.15;
  the provider dashboard remains authoritative.

## Acceptance

- 77 of 77 server tests and 18 of 18 migration/provenance tests passed.
- Server and web type checks and production builds passed.
- Deployment-script syntax and `git diff --check` passed.
- A disposable real-Hermes canary passed identity rejection and acceptance, a
  sourced live briefing, native memory, grounded Ask, cited Studio generation
  and revision, and evidence-linked Quiz generation and grading.
- The canary database was removed and no canary content entered production.
- Production retained 66 events, 47 sources, and 89 media records. SQLite
  integrity is `ok` and foreign-key violations are zero.
- The briefing survived a container restart with the same identifier and
  unchanged database checksum.
- The production container is healthy, loopback-only, non-root, read-only at
  the container root, capability-free, and protected by Cloudflare Access.
- `crypto.forkedbrain.fyi` redirects unauthenticated requests to Access, plain
  HTTP redirects to HTTPS, and the legacy `intel.forkedbrain.fyi` endpoint
  remains unchanged and available.

## Recovery

- Pre-promotion database backup:
  `/srv/mark-v2/crypto-dashboard/backups/pre-20260805T143933Z/crypto-intelligence.db`
- Stopped predecessor:
  `crypto-dashboard-rollback-20260805T123859Z`
- Restore the backup and predecessor together if rollback is required. Do not
  alter Hermes, OpenViking, ForkedBrain, Cloudflare, or the legacy service.
