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

## Protected root cutover

`forkedbrain.fyi` is an approved public destination in the existing Cloudflare Access application. The exclusive policy still allows only Mark and Darshan, uses the existing one-time-PIN identity provider, and expires sessions after 12 hours. The existing V2 tunnel now routes only the root hostname to loopback port `9320`, and one proxied root CNAME targets that tunnel. An unauthenticated root request redirects to the expected Access organization. Existing `brain`, `manage`, and `manage-realtime` hostnames retained their Access redirects, while legacy `intel` retained HTTP `200` through its separate tunnel.

The only remaining product gate is model funding. The configured Hermes provider requires credits before selected-memory chat can return model-generated answers. Graph, detail, provenance, filtering, search, source links, and conversation-memory inspection remain operational without model spend.
