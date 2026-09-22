# Handover and repository ownership

[Documentation](../README.md) / Handover

## Current stage: owner review

The repository remains private under `darshanahirrao`. The default `main` branch contains the latest published dashboard source and the handover documentation. Review it before any ownership transfer. Updating the repository does not transfer accounts or deploy the application.

## Review the package

1. Read the [project overview](../../README.md) and [dashboard README](../../dashboard/README.md).
2. Follow the [Quick Start](../handbook/quick-start.md) against the existing dashboard.
3. Review the [Technical Handover](../handbook/technical-handover.md) and [verification limits](../verification/README.md).
4. Agree on changes, the destination GitHub account or organisation and ongoing maintenance responsibility.

## Complete before transfer sign-off

| Item | Required confirmation |
| --- | --- |
| Repository destination | Correct username/organisation and authorised recipient. |
| Default and release branches | `main` provides the current source and documentation. Preserve the separate `satoshi-dashboard` release-helper branch/ledger contract. |
| Integration URLs | Review hardcoded GitHub owner/repository references in editor/release scripts and private Git credentials. |
| Source completeness | Reconcile installed helpers, skills and deployment definitions with Git; the quota-recovery helper is still only in the operator workspace/installed host in this branch. |
| VPS and service ownership | Recipient can access the hosting account, approved SSH, Cloudflare, Coolify and the Telegram bot administration where required. |
| Provider billing | Owner knows which configured accounts fund Hermes and OpenViking. |
| Private recovery materials | Deliver credentials, persistent data backups and the matching OpenViking key through a separate agreed channel. |
| Backup operations | Agree off-server destination, schedule, retention and responsible owner; verify restoration separately. |
| Acceptance | Confirm the accepted release, remaining items and support responsibilities. |

## Transfer is not deployment

Repository ownership transfer changes where the source is managed. It does not automatically move the VPS, change provider billing or transfer every external service account. Follow the technical checklist and update the configured remotes and release references deliberately.

Do not treat GitHub redirect behaviour as a substitute for validating the release helper after ownership changes. Verify a controlled edit and restore with an agreed test scope, preserving the original dashboard behaviour and research.

Prepared for Mark Gerhart by Darshan Ahirrao

Contact: [darshan@growthforgeai.com](mailto:darshan@growthforgeai.com)
