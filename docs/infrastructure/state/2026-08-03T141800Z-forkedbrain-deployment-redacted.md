# ForkedBrain production deployment, redacted state

**Captured:** 2026-08-03 14:18 UTC
**Scope:** private command center release, production boundary, functional acceptance, and rollback

## Accepted release

- Release `20260803T1408Z` is healthy at the loopback-only origin `127.0.0.1:9320`.
- The application runs as a non-root UID/GID `1001` container with a read-only root filesystem, all Linux capabilities dropped, no new privileges, explicit CPU, memory, and PID limits, and no Docker socket.
- The normalized Crypto database is a separate production copy mounted read-only. Its checksum remained unchanged through canary, promotion, and restart checks.
- The Hermes credential is mounted from an owner-only file. No raw dashboard password exists in the image, source, normal documentation, or container environment.
- The application shares only the existing private service network needed to reach Hermes. OpenViking remains Hermes's native private memory provider and publishes no host port.

## Product acceptance

- The graph returns exactly 20 visible nodes and 24 edges from 164 indexed memories.
- Sixteen ranked memory records are selected dynamically, including retained research conversations when their importance places them in the visible set.
- Real source, event, artifact, and conversation details return stored content and provenance from the read-only database.
- The interface is dark by default, supports an explicit light theme, respects reduced motion, and uses a bounded graph on both wide and mobile layouts.
- Mobile verification at 390 by 844 showed no horizontal overflow and no default collision among individual memory labels.
- Selected-memory chat authenticates to the existing Hermes service. The current configured provider returns the documented credit failure, which the interface exposes as a temporary-unavailable state instead of inventing an answer.

## Security and recovery checks

- Unauthenticated graph, memory, and chat access is rejected with HTTP `401`.
- The health endpoint is available only on the loopback origin.
- Container restart returned to healthy state without changing the database checksum.
- Release `20260803T1357Z` is retained as the stopped rollback container and image.
- Existing Hermes, OpenViking, Coolify, tunnel, and legacy Crypto services were not modified by the release promotion.

## Remaining external gate

The production origin is complete. `forkedbrain.fyi` still requires addition to the existing exact-email Cloudflare Access application, one root ingress entry on the existing V2 tunnel, and the corresponding root DNS route. The change must preserve the current policy for Mark and Darshan and must not alter `brain`, `manage`, `manage-realtime`, `intel`, or the legacy `crypto-intel` tunnel. The configured Hermes model provider also requires credits before selected-memory chat can return model-generated answers.
