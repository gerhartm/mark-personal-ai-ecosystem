# Maintainer handoff

## Current state — 20 October 2026

The requested accidental-import cleanup is complete. See [BUILD_LOG.md](BUILD_LOG.md), checkpoint `wrong-import-removal-20261020`, for verification and retention limits. Production code remains at `209133f`; this checkpoint records a data-maintenance operation and does not deploy code.

## Setup and references

- [Development setup](docs/development/README.md)
- [Operations](docs/operations/README.md)
- [Technical handover](docs/handbook/technical-handover.md)
- [User guide](docs/handbook/user-guide.md)

GitHub ownership is now `gerhartm/mark-personal-ai-ecosystem`. Keep production release-branch and ledger handling separate from documentation updates to main.

## Decisions and next steps

There is still no user-facing delete action for an already queued/imported source. The upload form's Remove action applies only before submission. No delete feature was added during this maintenance task.

For another removal, identify the exact import and source first, inspect dependent saved outputs and shared memories, and use OpenViking's supported deletion API rather than filesystem deletion. Verify database integrity and unrelated rows after the operation. Never restore the entire production database merely to undo one import.

The next client action is to refresh the dashboard and confirm the unwanted import is absent. Any self-service deletion feature requires a separate implementation and verification, including pending-job handling and shared-memory cleanup.

## Owner access update — 27 October 2026

The owner-supplied `mark-mac-forkedbrain` Ed25519 key is installed for root SSH login on the netcup VPS. Its fingerprint matches the one supplied by the owner. The SSH configuration and existing operator connection were verified; the owner still needs to confirm a connection from his own computer. See checkpoint `owner-ssh-access-20261027` in [BUILD_LOG.md](BUILD_LOG.md).

The owner intends to prepare updates with Claude on GitHub branches and select when to deploy through an extended release helper. This is his proposed workflow, not a verified deployment change. The ops/operator-release branch remains unreviewed by this maintenance task. Continue using the existing production release safeguards until any helper changes have been reviewed and tested.

## Owner control — 28 October 2026

Mark Gerhart owns the project and approves every change; no other person's approval is required. Earlier documents that name Darshan as approver or reviewer are historical.

Mark logs in to the server himself and has released the website through `mark-dashboard-release operator` since 27 October 2026 (five operator releases on `satoshi-dashboard`, from `ux/layout-pass-1` to `ux/topics-waiting-claims`). That operator path is now the normal release process.

The release helper on the `ops/owner-control` branch can also publish the project's instructions and documentation (`CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/`), on their own without rebuilding the website, or together with a website release. [`tools/owner-access/install-release-helper.py`](tools/owner-access/install-release-helper.py) installs it with a backup and a read-only check, signs future release commits as Mark and points the release checkout at `gerhartm/mark-personal-ai-ecosystem` directly. See [Dashboard editing](docs/operations/dashboard-editing.md).
