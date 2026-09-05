# Crypto Intelligence Control Center state

Date: 2026-09-05

Release: `20260905T051408Z`

Status: accepted in canary and production

## Product state

- The primary navigation contains exactly five numbered screens: Topics, Timeline, Prep, Haseeb bot, and Tarun bot.
- Control Center is a separate, unnumbered utility link near the bottom of the sidebar.
- Topics, Prep, Haseeb bot, and Tarun bot have editable page instructions.
- Timeline is evidence-only and has no editable generation prompt.
- Saved instructions create append-only revisions and can be restored.
- Source grounding, citation validation, format checks, and anti-invention rules remain fixed outside editable text.
- Topic rebuilding is manual and costs one bounded low-reasoning Hermes request when selected.
- No topic rebuild or paid model request runs automatically.
- Satoshi status is live: 7 received, 7 synced, 0 processing, and 0 failed at acceptance.

## Data and runtime

- Canonical events: 66
- Canonical sources: 54
- Media assets: 89
- Database migrations: 8
- Prompt control revisions at acceptance: 0
- Active topic organization at acceptance: none
- Production image: `mark-crypto-dashboard:20260905T051408Z`
- Production container: `crypto-dashboard`
- Loopback publication: `127.0.0.1:9330`

## Verification

- Server tests: 97 passed
- Local browser acceptance: 89 of 89 passed
- Canary browser acceptance: 89 of 89 passed
- Production browser acceptance: 89 of 89 passed
- Browser console errors: 0
- First-party request failures: 0
- Paid model calls during release acceptance: 0

## Recovery

- Immediate rollback container: `crypto-dashboard-rollback-20260904T184636Z`
- Database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260905T051408Z/crypto-intelligence.db`
- Deployment snapshot: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260905T051408Z`

No credential, secret, private source text, or client content is recorded in this state file.
