# Hermes Bootstrap — Redacted State Snapshot

**Captured:** 2026-07-31 11:42 UTC  
**Host:** netcup RS 2000 G12, Ubuntu 24.04.4 LTS  
**Secret content:** none

## Coolify objects

| Object | Name | UUID |
|---|---|---|
| Project | Mark Personal AI Ecosystem | `wldhdj3wjm2zacaf3317u0w4` |
| Environment | production | `9sd4ykxw1k8bsmzfzbr8lgoj` |
| Service | Hermes Central Brain | `27am3wgv7vkohkenprml4s3p` |

## Runtime identity

- Container: `hermes-27am3wgv7vkohkenprml4s3p`
- Hermes: `0.19.1` / `2026.7.30`, upstream `cc4cab2f`
- Image: `nousresearch/hermes-agent:v2026.7.30`
- Linux AMD64 digest: `sha256:5316c2c2534c49f5e1b1691e1a2115f1230d900033c3b35d1c8fc2e47352b26d`
- Persistent volume: `27am3wgv7vkohkenprml4s3p_hermes-data:/opt/data`
- CPU limit: 2 vCPU
- Memory limit/reservation: 4 GiB / 1 GiB

## Boundary and acceptance

- Dashboard host binding: `127.0.0.1:9119`
- Public reachability of `9119`: blocked/unreachable
- API `8642`: not published or listening
- Unauthenticated dashboard: redirects to `/login`
- Valid dashboard credential: login and authenticated identity endpoint verified
- Config schema: version `33`, validation passed
- Tool-loop hard stops: enabled at five identical failures or five idempotent no-progress repetitions
- Restart persistence: data, configuration, permissions, session signing, listener boundary, and limits survived

## Cleanup state

- Coolify API: disabled
- Temporary bootstrap-token count: zero
- Temporary request/response/cookie/token files: removed
- Acceptance probe: removed after persistence verification

## Explicitly absent

- No model-provider credential or validated model call
- No OpenViking service
- No Telegram integration
- No Crypto-specific ingestion workflow
- No selected old-VPS data migrated
- No public application domain or endpoint
