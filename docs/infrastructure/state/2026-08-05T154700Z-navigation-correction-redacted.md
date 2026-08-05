# Navigation Correction State

Captured: 2026-08-05 15:47 UTC

## Accepted state

- ForkedBrain image: `mark-forkedbrain:20260805T152846Z`
- Crypto Intelligence image: `mark-crypto-dashboard:20260805T152846Z`
- ForkedBrain Crypto destination: `https://crypto.forkedbrain.fyi/`
- Memory Graph logo action: return to the main brain overview
- Memory Graph Back action: return to the main brain overview
- Crypto Intelligence logo action: return to the dashboard home route

## Verification

- ForkedBrain tests, lint, and production build passed.
- Crypto Intelligence type checking and production build passed.
- Real Chromium navigation passed at desktop and mobile widths against the built production images and the promoted production containers.
- Both current applications are healthy, loopback only, non-root, read-only at the container root, capability-dropped, and protected with `no-new-privileges`.
- Unauthenticated requests to both current hostnames redirect to Cloudflare Access.
- Plain HTTP for Crypto Intelligence redirects to HTTPS.
- The legacy `https://intel.forkedbrain.fyi/` service still returns HTTP `200` and was not changed.

## Recovery

- ForkedBrain predecessor: stopped container `forkedbrain-rollback-20260803T1408Z`, image `mark-forkedbrain:20260803T1408Z`.
- Crypto Intelligence predecessor: stopped container `crypto-dashboard-rollback-20260805T143933Z`, image `mark-crypto-dashboard:20260805T143933Z`.
- Crypto Intelligence database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260805T152846Z/crypto-intelligence.db`.
- No database, client content, Hermes, OpenViking, provider, Cloudflare object, DNS record, tunnel route, Access policy, or credential changed in this release.
