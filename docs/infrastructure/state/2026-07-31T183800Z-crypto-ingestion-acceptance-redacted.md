# Crypto Intelligence ingestion acceptance — redacted state

**Captured:** 2026-07-31 18:38 UTC  
**Scope:** synthetic fixtures only; no client content imported

## Accepted behavior

- Hermes used its unmodified native OpenViking provider for every live write, search, and exact read.
- OpenViking's native URL resource path fetched and stored a non-sensitive public example URL.
- One source-URL envelope, one document envelope, one transcript envelope, and one linked event envelope were stored under one isolated fixture namespace.
- Exact reads preserved each visible schema, deterministic source/event ID, capture/event date, source URL where applicable, and unique test marker.
- Replay of the document identity was skipped before storage by the thin deterministic-ID guard.
- The final fixture tree contained exactly one canonical raw resource for each packet.
- A failed receipt is structurally required to carry an error class and contains no false-success OpenViking URI.
- Thirteen local provenance/receipt unit tests passed.

## Native behavior learned

OpenViking 0.4.11 removes YAML front matter while parsing Markdown. The Crypto envelope therefore stores provenance in a visible fenced YAML block inside the resource body. This preserves the metadata in exact reads without modifying Hermes or OpenViking.

Hermes's native `viking_add_resource` call may reach its synchronous timeout while OpenViking continues healthy asynchronous semantic processing. The accepted integration submits with `wait=false`, then proves completion using exact marker search/read. It does not interpret a client timeout as a failed ingestion.

OpenViking accepts a replay to an existing target and may reprocess that target rather than reject the request. The Crypto layer must therefore check the deterministic identity before calling the native provider. It does not create a second database or duplicate memory service.

## Cleanup and final state

- Removed the exact fixture namespace from `viking://user/hermes/resources/`.
- Removed the exact acceptance-only resource-reason session.
- Removed the exact server and Hermes-container fixture staging directories.
- Removed the disposable local fixture packets and state pointer.
- OpenViking remained connected and healthy with zero queue errors; semantic cleanup was allowed to finish before final closeout.
- No Cloudflare, DNS, tunnel, public hostname, Coolify service definition, Hermes native behavior, legacy service, credential, or client content changed.

## Remaining gate

The deterministic envelope and acceptance behavior are ready. The next step is to build the production migration executor around the already verified 47-source/66-event plan, run it in write-free mode, and present the final counts before any legacy client record is imported.
