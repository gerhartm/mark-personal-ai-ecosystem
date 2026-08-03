# Coolify Realtime Hostname — Redacted Acceptance Snapshot

**Captured:** 2026-07-31 15:28 UTC

## Implemented state

- Public hostname: `manage-realtime.forkedbrain.fyi`
- V2 tunnel: `mark-personal-ai-v2`
- Origin: loopback `127.0.0.1:6001`
- Coolify application configuration: `PUSHER_HOST=manage-realtime.forkedbrain.fyi`, `PUSHER_PORT=443`
- Persistence: non-secret values in `/data/coolify/source/docker-compose.custom.yml`
- Public readiness result before Access: HTTP 200 at `/ready`

## Verification

- Tunnel ingress validation: passed locally and on the VPS
- Three-file Coolify Compose validation: passed before apply
- `cloudflared.service`: active after restart
- `coolify`: healthy after recreation
- `coolify-realtime`: healthy and unchanged
- `manage.forkedbrain.fyi`: expected Coolify login redirect
- `brain.forkedbrain.fyi`: expected Hermes login redirect
- `intel.forkedbrain.fyi`: unchanged, HTTP 200

## Security boundary

- Ports `6001`, `6002`, and `8000` remain bound only to server loopback.
- The tunnel credential remains mode `0600` and account certificate remains workstation-only.
- Cloudflare Access for both management hostnames remains pending a scoped Access Apps and Policies credential.

## Rollback

Remove only the new DNS route after explicit approval, restore the timestamped pre-realtime tunnel and custom-Compose files on the VPS, validate both configurations, restart `cloudflared`, and reapply the three-file Coolify Compose stack. Do not alter the protected legacy hostname or tunnel.
