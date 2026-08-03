# Crypto Intelligence Dashboard Deployment Snapshot

**Captured:** 2026-08-03 15:45 UTC
**Release:** `20260803T155532Z`
**Status:** production origin accepted; public route held until Access verification

## Accepted runtime

- Container: `crypto-dashboard`
- Image: `mark-crypto-dashboard:20260803T155532Z`
- Loopback origin: `127.0.0.1:9330`
- Application network: `27am3wgv7vkohkenprml4s3p`
- Runtime user: `dashboard`, non-root
- Root filesystem: read only
- Capabilities: all dropped
- Security option: `no-new-privileges:true`
- Limits: 2 GiB RAM, 2 CPU, 256 PIDs
- Database directory: the only writable application mount
- Media archive and Hermes password file: read only
- Model-provider credentials in the dashboard: none

## Data and functional acceptance

- Database integrity: `ok`
- Foreign-key errors: zero
- Events: 66
- Sources: 47
- Media files: 89
- Missing Access identity: HTTP `401` for data routes
- Approved identity: brief, search, timeline, library, details, notes, and media routes accepted
- Media range request: HTTP `206`
- Ask: real Hermes answer, connected state, and canonical evidence returned
- Local contract/API/database suite: 56 of 56 tests passed
- Desktop and mobile production builds were rendered and visually inspected

## Persistence and isolation

The production container restarted to healthy. The database checksum and event/source counts remained unchanged. The host publishes only `127.0.0.1:9330`; there is no direct public origin listener. The canary container and its disposable data copy were removed after acceptance.

The prior accepted container is retained stopped as `crypto-dashboard-rollback-20260803T152748Z`. A consistent pre-promotion database backup is retained at `/srv/mark-v2/crypto-dashboard/backups/pre-20260803T155532Z/crypto-intelligence.db`.

## Public route gate

DNS was created for `crypto.forkedbrain.fyi`. A temporary tunnel-route test showed that the hostname was not yet included in the existing Cloudflare Access application. The route was immediately rolled back, leaving the hostname at the tunnel's final HTTP `404` rule. The API itself remained identity-protected throughout, and the legacy `intel.forkedbrain.fyi` endpoint stayed HTTP `200` and unchanged.

Restore the prepared crypto tunnel ingress only after Cloudflare Access is independently confirmed to return the organization login redirect for the hostname. Then verify Mark and Darshan, the authenticated dashboard, a real Ask response, all existing protected hostnames, and the legacy endpoint.

The pre-route tunnel configuration is retained at:

```text
/srv/mark-v2/operator-backups/20260803T154358Z-cloudflared-crypto-route/config.yml
```
