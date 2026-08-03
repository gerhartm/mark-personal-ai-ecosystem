# Redacted Coolify Bootstrap State

**Captured:** 2026-07-31 10:42:09 UTC  
**Purpose:** evidence after client-owned administrator creation  
**Secrets:** none included

## Platform

- Coolify version: `4.2.0`
- Image digest: `coollabsio/coolify@sha256:b8aea35f4113e54c38be3e88f842e09856aebcf92bd3e264b06c567c99ed4921`
- Operating system: Ubuntu 24.04.4 LTS
- SSH: key-only
- Failed systemd units: `0`

## Administrator state

- Root administrator exists with database ID `0`.
- Account uses the approved Mark-owned email; the value is recorded in the redacted credential register.
- Root team ID: `0`.
- Team role: `owner`.
- Password hash verified against the private temporary credential.
- Public registration: disabled.
- `/register` response: HTTP `302` redirect to `/login`.
- Plaintext bootstrap password persisted in server `.env`: no.

## Container state

The following containers were observed running and healthy:

```text
coolify
coolify-db
coolify-redis
coolify-realtime
coolify-proxy
coolify-sentinel
```

## Remaining acceptance boundary

The raw endpoint is HTTP-only. Interactive administrator login is intentionally deferred until a Mark-controlled domain and valid HTTPS certificate are configured. The temporary password must not be transmitted to the raw public HTTP endpoint.
