# Security and private access

Keep this repository private. Report suspected exposure or access issues privately to [darshan@growthforgeai.com](mailto:darshan@growthforgeai.com), with a short description and affected component. Do not include passwords, tokens or unredacted logs in GitHub issues.

## Data that does not belong in Git

Provider keys, password material, session-signing secrets, private SSH keys, OpenViking encryption keys, full chat exports, production databases and private media are delivered separately. `.gitignore` helps prevent mistakes but is not a secret scanner or a guarantee against exposure.

## Application boundaries

The dashboard uses its configured login and session checks. Satoshi uses an approved Telegram sender allowlist. Memory services remain private. The controlled dashboard editor publishes through a restricted host command, but its source-editing instructions are not an independent filesystem sandbox.

Do not disable authentication or publish private ports as a troubleshooting shortcut. If access material is exposed, coordinate revocation, replacement and affected-service validation with the operator.

See [Architecture](docs/architecture/README.md) and [Operations](docs/operations/README.md) for the actual boundaries and recovery requirements. This document does not imply a penetration test, certification or guaranteed response time.
