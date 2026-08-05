# Crypto Intelligence workflow polish, redacted state

**Accepted:** 2026-08-05 12:44 UTC
**Release:** `20260805T123859Z`

## Product state

- Ask is a first-class grounded workflow and shows the corpus records reviewed.
- Quiz creates evidence-linked questions, grades the complete submission in one
  bounded Hermes call, and preserves scores, feedback, and session history.
- Studio exposes direct paths for X, LinkedIn, review briefs, and Speaking
  Preparation.
- The Brief exposes all four primary outcomes without requiring a keyboard
  shortcut.
- Desktop and 390-pixel mobile layouts were visually accepted.

## Architecture and security boundary

- Hermes remains the only reasoning and generation layer.
- OpenViking remains the only semantic-memory provider.
- The existing Crypto SQLite file remains the only structured product store.
- No new database, vector store, scraper, agent runtime, provider, credential,
  Cloudflare object, DNS record, tunnel route, Access policy, or legacy service
  was added or changed.
- Production remains loopback-only, non-root, read-only at the container root,
  capability-free, and protected by Cloudflare Access.

## Acceptance

- 74 of 74 server tests passed.
- Server and web type checks and production builds passed.
- A disposable real-Hermes canary passed grounded Ask, cited Studio generation
  and revision, three evidence-linked Quiz questions, and complete batch grading.
- No canary draft, quiz, or answer entered the production database.
- Production retained 66 events, 47 sources, 89 media records, 41 drafts, and 15
  pre-existing quiz sessions.
- SQLite integrity is `ok`; foreign-key violations are zero.
- `crypto.forkedbrain.fyi` remains behind Access, HTTP redirects to HTTPS, and
  the protected legacy `intel.forkedbrain.fyi` endpoint remains HTTP `200`.

## Recovery

- Pre-promotion database backup:
  `/srv/mark-v2/crypto-dashboard/backups/pre-20260805T123859Z/crypto-intelligence.db`
- Stopped predecessor:
  `crypto-dashboard-rollback-20260804T081020Z`
- Restore the backup and predecessor together if rollback is required. Do not
  alter Hermes, OpenViking, ForkedBrain, Cloudflare, or the legacy service.
