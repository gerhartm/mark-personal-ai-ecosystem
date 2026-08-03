# OpenViking Acceptance Snapshot — Redacted

**Captured:** 2026-07-31 17:53 UTC  
**Scope:** V2 private memory service and Hermes native integration  
**Secrets:** no raw credential, token, model key, password, or encryption key is present

## Frozen runtime

| Item | Accepted state |
|---|---|
| Hermes | `v0.19.1` / image tag `v2026.7.30`; stock `gateway run` |
| OpenViking | `v0.4.11`; pinned AMD64 digest recorded in deployment README |
| Network | Same isolated Coolify service network |
| OpenViking exposure | No host port, public domain, proxy route, or Cloudflare object |
| Hermes origin | `127.0.0.1:9119`; approved public hostname retains Hermes login |
| OpenViking volume | `27am3wgv7vkohkenprml4s3p_openviking-data` |
| Hermes volume | `27am3wgv7vkohkenprml4s3p_hermes-data` |
| Tenant | Account `mark-gerhart`; dedicated user/agent `hermes` |
| Storage | Native local AGFS and vector database with native encryption |
| Models | `text-embedding-3-small` (1536 dimensions) and `gpt-5.4` VLM |

## Acceptance results

- Hermes internal dashboard: HTTP `200`.
- Hermes public unauthenticated request: HTTP `302` to its login.
- Hermes memory provider: `openviking`, plugin installed, status available.
- Hermes container restart count: `0` after accepted restart sequence.
- OpenViking container: running and healthy; restart count `0`.
- OpenViking `/health`: HTTP `200`.
- OpenViking authenticated status: connected/healthy; queue, VectorDB, models, lock, retrieval, and filesystem healthy.
- OpenViking host-published ports: none.
- Hermes native remember, semantic search, and exact read: passed.
- Independent OpenViking and Hermes restart persistence: passed.
- Consistent backup checksum: passed.
- Disposable restore startup, authentication, search, and exact read: passed.
- Disposable restore container and volume cleanup: passed.
- Production acceptance-marker deletion: passed.
- Sensitive Compose/container environment names in both application containers: none.
- Temporary Coolify deployment token: revoked and file removed.
- Coolify API window: disabled.
- Server staging secret directory and temporary integration script: removed.
- Local credential directories/files: mode `0700`/`0600`.
- Exact-value secret scan of ordinary project/source/deliverable trees: zero matches.

## Native readiness note

OpenViking 0.4.11's unauthenticated `/ready` root-namespace probe returns `503` because it probes `viking://` without tenant context. The authenticated tenant and all component/status checks are healthy, and real Hermes operations pass. The upstream readiness implementation was left unchanged in accordance with the Hermes-first/no-patching rule.

## Recovery material

The checksum-verified acceptance archive remains owner-only at:

```text
/root/mark-v2-backups/20260731T175000Z-openviking-acceptance/openviking-data.tar.gz
```

The matching private configuration and encryption material are escrowed only in the ignored owner-only client credentials tree. A restore requires all of them; none is copied into the VPS documentation mirror.

## Boundary and next step

No client content, legacy-VPS data, Telegram token, Cloudflare object, DNS record, or Crypto-specific workflow changed during this acceptance. The next authorized application stage is a thin Crypto ingestion/provenance layer built only for verified gaps beyond native Hermes/OpenViking behavior.
