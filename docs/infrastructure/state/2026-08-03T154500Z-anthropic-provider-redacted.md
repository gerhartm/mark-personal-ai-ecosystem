# Hermes Anthropic Provider Snapshot

**Captured:** 2026-08-03 15:45 UTC
**Status:** active and verified
**Secrets:** redacted; no provider value is present in this document

## Accepted state

- Native Hermes provider: `anthropic`
- Default model: `claude-sonnet-5`
- Hermes source and native behavior: unchanged
- Provider file: `/opt/data/.env`, mode `0600`, owner UID/GID `10000:10000`
- Model-provider credentials in ForkedBrain or Crypto containers: none

## Verification

- Existing OpenAI credential returned the documented exhausted-quota response.
- The stored Anthropic credential returned a successful provider response.
- An isolated Hermes safe-mode call with `claude-sonnet-5` returned the exact expected marker.
- Hermes configuration validation passed at schema version 33.
- Hermes restarted successfully with the native Anthropic provider active.
- A post-restart Hermes response returned the exact expected marker.
- ForkedBrain selected-memory chat returned a non-empty answer.
- Crypto Intelligence Ask returned `mode=hermes`, `state=connected`, a non-empty answer, and evidence.

## Recovery

Pre-switch copies are retained inside the persistent Hermes volume:

```text
/opt/data/operator-backups/provider-switch-20260803T151944Z/config.yaml
/opt/data/operator-backups/provider-switch-20260803T151944Z/provider.env
```

Restore only after capturing the current configuration and provider file. Validate the restored configuration, restart Hermes, and rerun both application-level chat tests. Do not expose or place either raw provider value in a command argument, document, repository, or application container.
