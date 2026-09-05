# Crypto Intelligence sidebar utility state

Date: 2026-09-05

Release: `20260905T061516Z`

Status: accepted in canary and production

## Visual state

- The primary navigation still contains exactly five numbered screens.
- Control Center remains separate and unnumbered.
- Control Center has a clear interactive surface and purpose label.
- Telegram synchronization is grouped into one aligned status card.
- Dark mode uses a labeled switch with visible on and off states.
- The utility area is responsive in desktop and mobile layouts.

## Verification

- Web type check: passed
- Web production build: passed
- Local browser acceptance: 89 of 89 passed
- Canary browser acceptance: 89 of 89 passed
- Production browser acceptance: 89 of 89 passed
- First-party request failures: 0
- Browser console errors: 0
- Paid model calls: 0

## Production and recovery

- Production image: `mark-crypto-dashboard:20260905T061516Z`
- Immediate rollback: `crypto-dashboard-rollback-20260905T051408Z`
- Database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260905T061516Z/crypto-intelligence.db`
- Deployment snapshot: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260905T061516Z`

No credential, private source text, or client content is recorded in this state file.
