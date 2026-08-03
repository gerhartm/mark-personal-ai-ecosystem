# OpenViking Private Memory Service

This directory documents the official self-hosted OpenViking service used by Hermes. The authoritative running Compose definition remains `../hermes/docker-compose.yml` so both tightly coupled containers share one isolated Coolify network without a public port or a global Docker network.

## Frozen design

- Release: `v0.4.11`
- Image: `ghcr.io/volcengine/openviking:v0.4.11`
- Linux AMD64 manifest digest: `sha256:6bca0c71301a918b6cb6a614677d0a15556ce2d62ba3e491e3be78c490008bbe`
- Internal endpoint: `http://openviking:1933`
- Persistent mount: `openviking_data:/app/.openviking`
- Storage: OpenViking's native local AGFS and vector database under `/app/.openviking/data`
- Authentication: native `api_key` mode with separate root and Hermes user keys
- At-rest protection: native local AES-GCM file encryption plus Argon2id API-key hashing
- Embedding: OpenAI `text-embedding-3-small`, 1536 dimensions
- VLM: OpenAI `gpt-5.4`
- Optional OpenViking bot: disabled
- Public exposure: none

## Why it belongs in the Hermes stack

Hermes is the only central brain and user-facing agent. OpenViking is a memory service that Hermes already supports natively. Keeping it as a second container in the same Coolify Compose stack provides:

1. Service-name networking without publishing port `1933`.
2. Separate images, health checks, resource limits, and persistent volumes.
3. No custom proxy, plugin, adapter, extra database, or duplicated agent gateway.
4. One reversible deployment unit for the two components that must communicate.

## Secret boundary

No raw API key, model credential, encryption key, or client content may enter this directory. Raw values exist only inside the owner-only credential archive, OpenViking's mode-`0600` persistent configuration, and Hermes's mode-`0600` profile environment file.

Coolify treats service-level variables as shared Compose inputs. The Hermes dashboard credentials therefore use Hermes's native `dashboard.basic_auth` config in the private `hermes_data` volume; they are absent from Coolify's service-wide variable store and from OpenViking's container environment.

## Acceptance gate

Do not import Mark's legacy data until all of the following pass:

1. Image digest and version match the frozen release.
2. `/health` and `ov status` pass inside the private network. OpenViking 0.4.11's unauthenticated `/ready` root-namespace probe can return `503` even while the authenticated tenant is healthy; do not patch native code to hide that upstream behavior.
3. Host and public scans show no listener for port `1933`.
4. A dedicated Hermes tenant key can write, search, and read a test memory.
5. Hermes reports OpenViking as its active native memory provider and its core `viking_remember`, `viking_search`, and `viking_read` path passes.
6. Test memory survives independent Hermes and OpenViking restarts.
7. A cold backup is checksum-verified and restored into a disposable volume without touching production.
8. The temporary Coolify API credential is revoked and API access is disabled again.

## Accepted runtime state — 2026-07-31

All gates above passed. The live service is `openviking-27am3wgv7vkohkenprml4s3p` with volume `27am3wgv7vkohkenprml4s3p_openviking-data`. Account `mark-gerhart` has a dedicated user/agent identity named `hermes`; Hermes stores only that tenant-bound API key in its mode-`0600` profile environment. The root key, user key, encryption master key, and private config are escrowed only under the owner-only client credential tree.

The acceptance marker was written through Hermes's native provider, found semantically, read exactly, recovered after independent OpenViking and Hermes restarts, restored from a consistent backup into a disposable volume, and then deleted from production. The retained checksum-verified acceptance backup is:

```text
/root/mark-v2-backups/20260731T175000Z-openviking-acceptance/openviking-data.tar.gz
```

The disposable container and volume, staging secrets, test script, temporary Coolify token, and API window were removed. No Cloudflare or DNS object was created for OpenViking.

## Rollback

Disable the external memory provider in Hermes first, then remove only the OpenViking service from the running Compose definition while retaining `openviking_data`. Restore the prior frozen Compose through Coolify. No Cloudflare route, DNS record, or public hostname is involved.
