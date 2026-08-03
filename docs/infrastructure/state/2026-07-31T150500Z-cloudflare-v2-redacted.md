# V2 Cloudflare Tunnel — Redacted Acceptance Snapshot

**Captured:** 2026-07-31 15:05 UTC

## Cloudflare state

- V2 tunnel: `mark-personal-ai-v2`
- Tunnel UUID: `faa04374-384f-4eea-a3e6-0c56ef2c309d`
- Connector state: connected through four QUIC edge connections
- `brain.forkedbrain.fyi`: V2 tunnel to Hermes loopback port `9119`; HTTPS returns the authenticated login redirect
- `manage.forkedbrain.fyi`: V2 tunnel to Coolify loopback port `8000`; terminal WebSocket path maps to loopback port `6002`; HTTPS returns the Coolify login redirect
- Catch-all ingress: HTTP 404
- `intel.forkedbrain.fyi`: unchanged legacy tunnel; HTTPS returned HTTP 200 after V2 deployment
- OpenViking: no hostname and no public route

## New VPS state

- `cloudflared` `2026.7.3` installed from Cloudflare's signed Ubuntu Noble repository
- `cloudflared.service`: enabled and active
- Configuration: `/etc/cloudflared/config.yml`, root-owned mode `0600`
- Tunnel credential: root-owned mode `0600`; exact local/server hashes match
- Metrics: loopback `127.0.0.1:20241`
- Coolify UI/realtime/terminal listeners: loopback only on `8000`, `6001`, and `6002`
- Hermes dashboard listener: loopback only on `9119`
- Coolify containers healthy; Hermes running; zero failed systemd units

## Security and acceptance boundaries

- The broad account certificate remains on Darshan's workstation only and was not copied to the VPS.
- Direct public-IP access to Coolify port `8000` timed out after the binding override.
- Cloudflare Access for `manage.forkedbrain.fyi` remains pending; Coolify's own authentication gate is active.
- Coolify realtime requires a separately approved supporting hostname under the official tunnel configuration. It was not created.
- No legacy DNS record, legacy tunnel, old-VPS connector, client dataset, or application content changed.

## Rollback

Stop `cloudflared.service` to remove V2 serving without changing DNS. If a full rollback is authorized, remove only the two V2 DNS routes and the V2 tunnel after preserving the tunnel-specific credential. Never modify `intel.forkedbrain.fyi` or `crypto-intel` as part of V2 rollback.
