# Mark Personal AI V2 Cloudflare Tunnel

This directory contains the non-secret, frozen configuration for the isolated V2 Cloudflare tunnel.

- Tunnel: `mark-personal-ai-v2`
- Tunnel UUID: `faa04374-384f-4eea-a3e6-0c56ef2c309d`
- `brain.forkedbrain.fyi` routes to the authenticated Hermes dashboard on server loopback port `9119`.
- `manage.forkedbrain.fyi` routes to the authenticated Coolify dashboard on port `8000`.
- `manage.forkedbrain.fyi/terminal/ws` routes to Coolify's terminal service on port `6002`.
- `manage-realtime.forkedbrain.fyi` routes to Coolify's realtime service on port `6001`.
- The final catch-all returns HTTP 404.
- OpenViking has no public hostname.
- `intel.forkedbrain.fyi` and tunnel `crypto-intel` are protected legacy production state and are not referenced by this configuration.

The tunnel-specific credential is stored only in the ignored owner-only credential tree and on the new VPS at `/etc/cloudflared/faa04374-384f-4eea-a3e6-0c56ef2c309d.json`. The account-wide Cloudflare certificate must never be copied to the VPS.

Coolify advertises `manage-realtime.forkedbrain.fyi:443` through the persistent custom Compose override. One self-hosted Cloudflare Access application protects both `manage.forkedbrain.fyi` and `manage-realtime.forkedbrain.fyi`. It uses the account's email one-time-PIN identity provider and permits only Mark's and Darshan's exact account emails for a 12-hour session. Application and policy identifiers are recorded in the redacted infrastructure state; no Access API token is retained locally or on the VPS.
