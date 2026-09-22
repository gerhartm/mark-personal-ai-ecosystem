# Operations

[Documentation](../README.md) / Operations

## Start with the affected stage

| Symptom | First place to inspect |
| --- | --- |
| Cannot sign in | The specific public URL, login gate and verification challenge. |
| Upload rejected immediately | Format, signature, file size and import validation. |
| Queued item seems stuck | Import job state and the retention dependency. |
| Source saved but missing evidence | Source-processing status, exact retained content and model availability. |
| Provider authentication message | Raw provider error and correct billing account, not the generic Telegram wording alone. |
| Website edit not visible | Editor run state, published commit and live release ledger. |
| Local API healthy but public site fails | Tunnel, Caddy and application login path. |

The [full technical guide](../handbook/technical-handover.md) supplies exact service names, host paths, read-only diagnostic commands and recovery procedures.

## Provider recovery has a narrow purpose

An external timer recognises a specific stale quota state. It checks every two minutes and probes only eligible failures with the same configured credential. A successful small provider response is required before clearing the targeted persisted state.

It does not replenish credits, repair invalid credentials, replay interrupted jobs or rewrite old Telegram messages. One incident receives at most one reset attempt. A running session may re-persist stale in-memory status; that case requires an operator. A small successful request does not prove a much larger job fits rate limits.

The installed recovery helper is documented in the private operational inventory. Its source currently exists in the operator workspace but is not present under `deploy/hermes-recovery/` in this review branch. Include its reviewed source and deployment state in the final engineering handover before treating Git as a complete code inventory.

## Backups and restore

Git preserves code. Complete recovery also requires the dashboard SQLite database, Hermes persistent home, OpenViking data, matching encryption key, private configuration and service definitions.

Release-time database and configuration backups support individual deployments. They do not establish a scheduled off-server backup service or prove a current full disaster restore. Confirm ownership, retention and a restore rehearsal before relying on a recovery target.

Code rollback creates a new commit of a prior published version. It does not roll research data backwards. Review database compatibility before restoring application code across schema changes.

## Maintain carefully

Before changing Hermes, OpenViking or infrastructure, record current versions, preserve compatible backups and test the relevant integration contracts. The controlled dashboard editor has a narrower role and does not provide unrestricted VPS management.

After any runtime change, update the release/operations record and the matching documentation. Historical acceptance results remain tied to their original release.
