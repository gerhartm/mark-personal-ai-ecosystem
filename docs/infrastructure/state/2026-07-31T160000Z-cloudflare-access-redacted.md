# Cloudflare Access — Redacted Acceptance Snapshot

**Captured:** 2026-07-31 16:00 UTC

## Application

- Name: `Mark V2 Infrastructure Management`
- Application ID: `529f193c-2aad-4acf-af00-05ad556b58d0`
- Type: self-hosted
- Destinations: `manage.forkedbrain.fyi`, `manage-realtime.forkedbrain.fyi`
- Identity provider: existing email one-time PIN
- Session duration: 12 hours
- App Launcher visibility: disabled

## Policy

- Name: `Allow Mark and Darshan`
- Policy ID: `a5166e47-b9a3-4c51-82c2-977e0eacb171`
- Decision: allow
- Precedence: 1
- Included identities: Mark's accepted account email and Darshan's accepted account email only
- No `Everyone`, domain wildcard, bypass, or service-token rule

## External verification

- Unauthenticated `manage.forkedbrain.fyi`: HTTP 302 to the Access organization
- Unauthenticated `manage-realtime.forkedbrain.fyi/ready`: HTTP 302 to the same Access organization
- `brain.forkedbrain.fyi`: unchanged Hermes login redirect
- `intel.forkedbrain.fyi`: unchanged HTTP 200

## Credential state

- The one-time setup token is not retained in project files, documentation, the VPS, or macOS Keychain.
- The raw token appeared in the authorized client chat and was therefore considered compromised.
- Darshan confirmed deletion of account token `restless-morning-62df` in Cloudflare on 2026-07-31. No retained copy exists locally, in Keychain, in the project, or on the VPS.

## Rollback

After explicit approval, delete only the Access policy and application identified above. Do not remove or modify the V2 tunnel routes, the protected legacy hostname, or the legacy tunnel.
