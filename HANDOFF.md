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
