# Crypto Intelligence Public Acceptance Snapshot

**Captured:** 2026-08-04 04:33 UTC
**Release:** `20260803T155532Z`
**Status:** live and accepted behind Cloudflare Access

## Public boundary

- Public URL: `https://crypto.forkedbrain.fyi/`
- Edge result without a session: HTTP `302` to Mark's Cloudflare Access login
- External forged identity header: still HTTP `302`; it cannot bypass Access
- Access application: the existing shared self-hosted application with exactly four approved destinations
- Access policy: exact-email allow for Mark and Darshan only, no excludes, no additional requirements, 12-hour session
- Tunnel: `mark-personal-ai-v2`, outbound only
- Origin: `127.0.0.1:9330`; direct public connection to port `9330` times out
- Legacy endpoint: `https://intel.forkedbrain.fyi/` remains HTTP `200` and unchanged

## Runtime and data acceptance

- Container: `crypto-dashboard`, healthy after restart
- Runtime: non-root `dashboard` user, read-only root filesystem, all capabilities dropped, `no-new-privileges:true`
- Limits: 2 GiB memory, 2 CPU, 256 PIDs
- Origin identity boundary: missing and unknown identities return HTTP `401`; an approved identity returns HTTP `200`
- Corpus: 66 events, 47 sources, 89 media files
- Database: integrity `ok`, zero foreign-key errors, checksum unchanged across restart
- Private media: byte-range request returns HTTP `206`
- Hermes Ask: `mode=hermes`, `state=connected`, a substantive answer, and six canonical evidence records
- Provider: Hermes native Anthropic provider with `claude-sonnet-5`; no provider credential exists in the dashboard
- Local release validation: server and web TypeScript checks and production builds passed; 56 of 56 server tests passed
- Visual acceptance: production desktop, mobile, relationship-map, reduced-motion, and high-contrast captures were inspected; the interface remains aligned with the ForkedBrain dark command-center system

## Existing-service regression

Unauthenticated edge checks after cutover:

- `forkedbrain.fyi`: HTTP `302`
- `brain.forkedbrain.fyi`: HTTP `302`
- `manage.forkedbrain.fyi`: HTTP `302`
- `manage-realtime.forkedbrain.fyi/ready`: HTTP `302`
- `intel.forkedbrain.fyi`: HTTP `200`

No legacy DNS record, old-VPS service, Hermes source, OpenViking source, model key, or client corpus record was changed.

## Recovery

- Pre-cutover tunnel configuration: `/srv/mark-v2/operator-backups/20260804T042710Z-cloudflared-pre-crypto-live/config.yml`
- Owner-only Access API backup: `.secrets/cloudflare-backups/20260804T042650Z-crypto-cutover/`
- Earlier pre-route tunnel configuration: `/srv/mark-v2/operator-backups/20260803T154358Z-cloudflared-crypto-route/config.yml`
- Application rollback container: `crypto-dashboard-rollback-20260803T152748Z`
- Pre-promotion database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260803T155532Z/crypto-intelligence.db`

Restore only the Crypto Access destination and V2 tunnel route when rolling back the public hostname. Do not alter another Access destination, the shared exact-email policy, the legacy `crypto-intel` tunnel, or `intel.forkedbrain.fyi`.

## Credential closeout

The short-lived Cloudflare token was used only through the guarded hidden-input path and is not required at runtime. At 05:46 UTC, Darshan confirmed revocation and successful interactive OTP login; an independent verification request reports the token revoked or invalid. The edge still redirects unauthenticated requests through Access, the dashboard runtime remains healthy, and legacy `intel.forkedbrain.fyi` remains HTTP `200`.
