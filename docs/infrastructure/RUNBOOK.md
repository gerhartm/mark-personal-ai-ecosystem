# Infrastructure Operations Runbook

## Guardrails

- Never paste passwords, private keys, API keys, OAuth tokens, session cookies, recovery codes, or raw `.env` files into this repository or ordinary documentation. A generated login password may be delivered once in the authorized active client conversation when Darshan explicitly requests it; never disclose signing secrets, keys, cookies, or raw environment files there.
- Never change SSH authentication until a second key-based connection has succeeded.
- Never rely on UFW alone for Docker-published services; use the netcup provider firewall for production boundaries.
- Before every mutation, add a pending entry to `OPERATIONS-LOG.md`. Complete the entry with verification and rollback details afterward.
- Keep every new service private until its owner credential, listener boundary, persistence, and recovery path are documented and verified.

## Connect to the server

From the development Mac:

```bash
ssh mark-netcup-v2
```

Equivalent explicit command:

```bash
ssh -i "<CLIENT_ROOT>/.secrets/credentials/new-vps/ssh/mark_netcup_v2" root@159.195.16.212
```

Replace `<CLIENT_ROOT>` with the local `Mark Gerhart` client-folder path. The `mark-netcup-v2` alias already resolves this correctly on the configured development Mac.

Expected SSH public-key fingerprint:

```text
SHA256:/Yjy3IfjFbrGFhNxqMv6T1xX0hiQ1k+lKbIrb4R2Wrs
```

## Quick health check

```bash
timedatectl show -p Timezone --value
free -h
df -h /
swapon --show
systemctl --failed
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication) '
ufw status numbered
docker ps -a
```

Healthy current-state expectations:

- Timezone is `UTC`.
- Memory is approximately 15 GiB and swap is 8 GiB.
- No failed systemd units.
- Root SSH is key-only and password authentication is off.
- UFW is active.
- All six Coolify platform containers are running and healthy.
- Hermes is running with its dashboard bound only to `127.0.0.1:9119`.
- No Hermes listener exists on the server's public address, and TCP `8642` is closed.

## Resume Coolify

Record the action in `OPERATIONS-LOG.md` first.

```bash
cd /data/coolify/source
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d

cd /data/coolify/proxy
docker compose up -d

docker start coolify-sentinel
```

Verify:

```bash
docker ps --format '{{.Names}} | {{.Status}} | {{.Ports}}'
curl -I --max-time 10 http://127.0.0.1:8000
```

Expected:

- `coolify`, `coolify-db`, `coolify-redis`, `coolify-realtime`, `coolify-proxy`, and `coolify-sentinel` are running.
- Health-capable containers become healthy.
- Local HTTP returns a redirect to the login/setup flow.

## Pause Coolify

This retains containers, data, volumes, configuration, and generated secrets:

```bash
cd /data/coolify/source
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  stop

cd /data/coolify/proxy
docker compose stop

docker stop coolify-sentinel
```

Verify:

```bash
docker ps
ss -lntup
```

Expected: no running Docker containers and no public Coolify listeners.

## Initial Coolify administrator — completed 2026-07-31

Mark's approved owner email for Coolify and subsequent project-owned service accounts is `gerhartmark@gmail.com`. Use a different identity only after Mark or Darshan explicitly approves the exception.

1. Resume Coolify.
2. Open `http://159.195.16.212:8000`.
3. Create the root administrator with `gerhartmark@gmail.com`.
4. Generate a unique strong password of at least 20 characters.
5. Immediately store the generated password in `.secrets/credentials/new-vps/ALL-CREDENTIALS.txt`, retaining owner-only `0600` permissions.
6. Confirm login in a fresh session.
7. Tell Darshan in the active project chat that the account and temporary password were created so he can rotate it later.
8. Record the account owner, exact email, creation timestamp, verification result, and rotation status in the credential records. Never place the password in non-secret documentation, logs, source files, or Git.

If the registration page shows an unexpected existing user, stop immediately. Do not attempt password resets until the database and audit state are inspected.

Apply this same process to every future client-owned account created for Hermes, OpenViking, storage, backups, monitoring, domains, or related services: use Mark's approved owner email, generate a unique password, store it in the V2 master credential file, notify Darshan in chat, and mark it for later rotation.

Completion state:

- Root administrator created for Mark with the approved owner email.
- Password hash validated against the private temporary credential.
- Root team membership and `owner` role validated.
- Public registration disabled and `/register` redirects to `/login`.
- Plaintext bootstrap password was not persisted to Coolify's server-side `.env`.
- Interactive login is intentionally deferred until a proper HTTPS endpoint exists; do not transmit the password over the raw public HTTP endpoint.

## Domain and HTTPS — pending

After the administrator exists:

1. Choose a Mark-controlled domain or subdomain for Coolify.
2. Point its DNS record to the server's public IPv4.
3. Configure the Coolify instance URL with `https://`.
4. Verify Let's Encrypt issuance and renewal configuration.
5. Verify access from a new browser session.
6. Add a netcup provider firewall policy.
7. Close direct public access to TCP `8000`, `6001`, and `6002` when no longer required.

Ports `80` and `443` remain required for web traffic and certificate issuance. Port `22` remains required for key-based administration.

## Provider firewall — pending

The production netcup policy should default-deny inbound traffic and allow only:

- TCP 22 for SSH, preferably restricted to approved operator source IPs where practical.
- TCP 80 for HTTP and certificate issuance.
- TCP 443 for HTTPS.
- Any temporary Coolify bootstrap ports only while actively needed.

Apply IPv4 and IPv6 policies. Keep the netcup console open during the first policy change and verify a second SSH session before closing the existing one.

## Coolify configuration backup — pending

`/data/coolify/source/.env` contains secrets. It must never be pasted into documentation.

Before application deployment:

1. Store an encrypted off-server backup of Coolify configuration.
2. Document the backup destination, timestamp, encryption method, retention, and restore test.
3. Create a netcup snapshot only after confirming any cost and retention behavior.
4. Test restoration before declaring the control plane production-ready.

## Hermes central brain — deployed internally

Hermes is managed by Coolify as the service `Hermes Central Brain` with service UUID `27am3wgv7vkohkenprml4s3p`. Its dashboard origin is bound only to VPS loopback and is published through the approved Cloudflare tunnel at `https://brain.forkedbrain.fyi/`.

From the development Mac, create the private dashboard tunnel:

```bash
ssh -L 9119:127.0.0.1:9119 mark-netcup-v2
```

Keep that terminal open and visit:

```text
http://127.0.0.1:9119
```

The username and temporary password are stored in `.secrets/credentials/new-vps/ALL-CREDENTIALS.txt`. Never paste the session-signing secret into a browser or chat.

Verify the deployment on the VPS:

```bash
docker ps --filter name=hermes-27am3wgv7vkohkenprml4s3p
docker exec hermes-27am3wgv7vkohkenprml4s3p hermes --version
docker exec hermes-27am3wgv7vkohkenprml4s3p hermes gateway status
docker exec hermes-27am3wgv7vkohkenprml4s3p hermes config check
ss -lntp | grep ':9119'
curl -I --max-time 10 http://127.0.0.1:9119
```

Expected state:

- Hermes reports `0.19.1` / `2026.7.30`.
- The gateway is running under its supervisor.
- Configuration schema version `33` is valid.
- Only `127.0.0.1:9119` is listening for the dashboard.
- An unauthenticated request redirects to `/login`.
- Port `8642` is not published.

Persistent state is stored in Docker volume `27am3wgv7vkohkenprml4s3p_hermes-data`, mounted at `/opt/data`. Preserve this volume before recreating or deleting the service. Use the Coolify dashboard for ordinary stop, start, restart, and redeploy actions. Direct Docker commands are reserved for documented diagnostics or emergency recovery.

The current resource envelope is 2 vCPU and 4 GiB RAM with a 1 GiB reservation. Do not raise it without recording before/after host capacity and an operations-log entry.

The configuration backup created before schema migration is:

```text
/opt/data/config.yaml.pre-migrate-20260731T1138Z
```

### Hermes model provider

The active primary provider is Hermes' native `openai-api` provider with default model `gpt-5.6-sol` and reasoning effort `high`. This is the shared brain provider for Satoshi, ForkedBrain, and the Crypto Intelligence dashboard. No Hermes source, tool, or memory implementation was patched for this switch.

The raw provider key is stored only in the owner-only credential bundle and Hermes's native credential pool inside persistent data. The dashboard containers receive no model-provider credential.

Verify without exposing the key:

```bash
docker exec hermes-27am3wgv7vkohkenprml4s3p hermes config get model.provider
docker exec hermes-27am3wgv7vkohkenprml4s3p hermes config get model.default
docker exec hermes-27am3wgv7vkohkenprml4s3p hermes config get agent.reasoning_effort
docker exec hermes-27am3wgv7vkohkenprml4s3p hermes config check
```

Expected provider state:

```text
model.provider=openai-api
model.default=gpt-5.6-sol
agent.reasoning_effort=high
configuration valid at schema 33
```

The current pre-switch recovery point is:

```text
/root/mark-v2-backups/20260807T120931Z-mark-owner-simulation-sol/
```

The Anthropic credential is retained only for controlled rollback and is not selected. Do not silently switch providers or delete historical authentication state. Any future change requires a provider backup, one isolated minimal response, configuration validation, a Hermes restart, and real Satoshi plus application-level Ask tests.

The gateway status may briefly retain a recent-history message that the pre-restart process is gone. That message was produced by the deliberate restart acceptance test; verify the current process and dashboard before treating it as an incident.

### Telegram owner-experience acceptance mode

Darshan's existing allowlisted implementation chat is intentionally configured as a bounded Mark owner-experience test. The native Telegram channel prompt makes Satoshi address that chat as Mark and retrieve Mark's canonical context, while the gateway's numeric-user allowlist remains the real access boundary.

Verify without printing the real chat ID or prompt:

```bash
docker exec -u hermes hermes-27am3wgv7vkohkenprml4s3p /opt/hermes/.venv/bin/python -c "import yaml; c=yaml.safe_load(open('/opt/data/config.yaml')); p=c['platforms']['telegram']['extra'].get('channel_prompts', {}); print(len(p)); print(any('owner-experience acceptance testing' in str(v) for v in p.values()))"
docker exec -u hermes hermes-27am3wgv7vkohkenprml4s3p hermes sessions list --source telegram --limit 20
```

Expected configuration result is one prompt and `True`. After a deliberate identity-behavior change, back up recent Telegram session state and remove only the tester sessions so cached conclusions do not override the new instructions. Never remove OpenViking memory for this purpose. The accepted pre-change recovery point is `/root/mark-v2-backups/20260807T120931Z-mark-owner-simulation-sol/`.

To end the simulation, restore the backed-up config or remove only the tester's channel prompt through Hermes's supported config path, restart Hermes, and send a new test message. Do not change the allowlist, token, memory provider, or Mark's canonical profile.

## OpenViking native memory — deployed privately

OpenViking runs as `openviking-27am3wgv7vkohkenprml4s3p` in the same Coolify Compose resource as Hermes. It has no host-published port, DNS record, Traefik route, Cloudflare ingress, or user-facing interface. Hermes reaches it only at `http://openviking:1933` on the isolated stack network.

Verify the runtime without printing credentials:

```bash
docker inspect -f '{{.State.Status}} {{.State.Health.Status}} {{json .HostConfig.PortBindings}}' openviking-27am3wgv7vkohkenprml4s3p
docker exec openviking-27am3wgv7vkohkenprml4s3p ov status
docker exec hermes-27am3wgv7vkohkenprml4s3p hermes memory status
docker exec openviking-27am3wgv7vkohkenprml4s3p stat -c '%n|%a|%u:%g' /app/.openviking/ov.conf /app/.openviking/master.key
```

Expected state:

- OpenViking is `running` and `healthy`, with `{}` port bindings.
- `ov status` reports connected/healthy, zero queue errors, healthy VectorDB, models, lock, retrieval, and filesystem.
- Hermes reports provider `openviking`, plugin installed, and status available.
- `ov.conf` and `master.key` remain mode `0600`.
- OpenViking 0.4.11 may return `503` from its unauthenticated `/ready` root-namespace probe while the authenticated tenant and all `ov status` components are healthy. Record the discrepancy; do not patch native code or expose the service to suppress it.

The accepted consistent backup is:

```text
/root/mark-v2-backups/20260731T175000Z-openviking-acceptance/openviking-data.tar.gz
```

Verify its checksum with `sha256sum -c SHA256SUMS` from that directory. A restore test must always use a disposable volume, the same pinned image, no host port, and a unique container name. Never mount the restored volume into the production container or run two writers against the production volume. Delete only the disposable container and volume after exact read/search verification.

For rollback, first set Hermes back to built-in memory using its supported configuration command, verify `hermes memory status`, then remove only the OpenViking service while retaining `27am3wgv7vkohkenprml4s3p_openviking-data`. No DNS or Cloudflare change is involved.

## Updating Coolify

Do not run an upgrade without:

1. Reviewing the current release notes.
2. Capturing container status and disk usage.
3. Confirming a recent recoverable backup.
4. Adding a pending operations-log entry.

The official installer and upgrade logs live under `/data/coolify/source/`.

After upgrade, verify:

```bash
docker ps
docker inspect coolify --format '{{.Config.Image}} | {{.State.Health.Status}}'
curl -I --max-time 10 http://127.0.0.1:8000
systemctl --failed
df -h /
```

## SSH recovery

If normal SSH fails:

1. Open netcup SCP.
2. Select the server.
3. Open **Screen** for console access.
4. Confirm networking and `sshd`:

```bash
ip addr
ss -lntp | grep ':22'
systemctl status ssh
sshd -t
```

5. Confirm the authorized key and permissions:

```bash
ls -ld /root /root/.ssh
ls -l /root/.ssh/authorized_keys
ssh-keygen -lf /root/.ssh/authorized_keys
```

Expected permissions:

- `/root/.ssh`: `0700`
- `/root/.ssh/authorized_keys`: `0600`

## Firewall recovery

If UFW blocks required host access, use the netcup console:

```bash
ufw status numbered
ufw disable
```

Diagnose and correct the rules before re-enabling:

```bash
ufw --force enable
```

Remember that Docker-published ports may bypass UFW. Diagnose Docker exposure with:

```bash
docker ps --format '{{.Names}} | {{.Ports}}'
iptables -S DOCKER-USER
```

## Swap recovery

Check:

```bash
swapon --show
grep '^/swapfile ' /etc/fstab
sysctl vm.swappiness vm.vfs_cache_pressure
```

If `/swapfile` is missing after a reboot, recreate it using the exact procedure in `BUILD-LOG.md`.

## Complete Crypto semantic import

Accepted state:

- OpenViking contains exactly 131 source/artifact identities and 66 event identities.
- Exact reconciliation found all 197 targets with zero locked, missing, or error results.
- The acceptance replay produced 197 skips, zero creates, and zero failures.
- The queue is idle with zero errors; Hermes reports OpenViking installed and available.
- Production Crypto Ask returned through Hermes with eight evidence records and four citations, all resolving to returned canonical evidence.
- The accepted recovery point is `/root/mark-v2-backups/20260805T112800Z-post-complete-crypto-import/`; its checksum and disposable restore test passed.

For any future replay, use the deterministic target `stat` guard in
`apply_crypto_packets.py`. Never use semantic search to decide identity, never
reuse an existing receipt filename, and never add a second memory/vector layer.
After any new ingestion, require an idle zero-error queue, exact target
reconciliation, a skip-only replay, representative deep reads, and a new
checksum/restore-tested backup.

The authoritative acceptance counts and estimated model cost are in
`docs/migration/CRYPTO-V2-MIGRATION-REVIEW.md`. The import did not alter
Cloudflare, DNS, tunnels, the legacy hostname, Telegram, or dashboard code.

## Next application sequence

The isolated V2 Cloudflare tunnel, `brain`, `manage`, and `manage-realtime` hostnames, edge HTTPS, loopback binding, and shared Cloudflare Access application are complete.

1. **Completed:** freeze the official Hermes release, image digest, persistent path, environment contract, resource limits, health checks, and rollback procedure.
2. **Completed:** deploy one internal-only Hermes profile as the central brain through Coolify.
3. **Completed for the provider-free baseline:** validate gateway supervision, authentication, configuration, hard-stop guardrails, resource limits, loopback exposure, and restart persistence.
4. **Completed for the baseline:** connect Mark's approved OpenAI Platform credential through `openai-api`; select GPT-5.6 Sol; validate model discovery, exact-response inference, permissions, and restart persistence.
5. **Completed:** deploy the official self-hosted OpenViking provider as a separate internal Coolify service with persistent encrypted storage and no public exposure.
6. **Completed:** connect Hermes through the official OpenViking provider path and verify tenancy, write/search/read, independent restarts, consistent backup, disposable restore, credential escrow, and temporary-access cleanup.
7. **Completed:** add and live-test only the thin Crypto-specific identity, visible provenance, replay guard, and receipt logic that Hermes/OpenViking do not already provide.
8. **Completed:** promoted native OpenAI API `gpt-5.6-sol` with high reasoning as the shared Hermes default after an isolated canary and Satoshi owner-context acceptance.
9. **Completed for synthetic data:** run native URL/document/transcript/event acceptance, exact retrieval, replay-skip, failure-receipt, and cleanup tests.
10. **Superseded by the complete plan:** the earlier 47-source/66-event bundle remains a historical dry-run artifact.
11. **Completed:** build and independently verify the complete 131-source/artifact plus 66-event semantic bundle, normalized dashboard database, 89-file media archive, and Claude Code handoff.
12. **Completed:** stage and verify the immutable dashboard database and media originals privately on the VPS.
13. **Completed:** imported all 197 semantic packets through native OpenViking, proved a 197-skip replay, verified exact reads and production Hermes citations, and restore-tested the post-import backup.
14. **Claude Code boundary:** Claude may begin isolated dashboard information architecture and implementation from the frozen handoff; do not cut over the legacy hostname until both semantic-memory and dashboard acceptance gates pass.

The governing architecture rule remains: **Hermes first; build only verified gaps.**

## ForkedBrain command center operations

Current accepted release: `20260811T132229Z`

Runtime contract:

- container: `forkedbrain`
- image: `mark-forkedbrain:20260811T132229Z`
- loopback origin: `http://127.0.0.1:9320`
- application network: `27am3wgv7vkohkenprml4s3p`
- release link: `/srv/mark-v2/forkedbrain/current`
- read-only database: `/srv/mark-v2/forkedbrain/data/crypto-intelligence.db`
- runtime environment: `/srv/mark-v2/secrets/forkedbrain.env`
- mounted Hermes password file: `/srv/mark-v2/secrets/forkedbrain-hermes-password`

### Routine status

```bash
docker ps --filter name=^/forkedbrain$ --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
curl -fsS http://127.0.0.1:9320/api/health
docker inspect forkedbrain --format '{{.HostConfig.ReadonlyRootfs}} {{.Config.User}} {{json .HostConfig.SecurityOpt}}'
```

Expected state is healthy, `127.0.0.1:9320->3000/tcp`, read-only root filesystem, user `nextjs`, and `no-new-privileges:true`.

### Restart

```bash
docker restart forkedbrain
docker inspect forkedbrain --format '{{.State.Health.Status}}'
curl -fsS http://127.0.0.1:9320/api/health
```

Do not treat `starting` as accepted. Wait for `healthy` and require `{"status":"ok","database":"ok"}`.

### Stop and start

```bash
docker stop forkedbrain
docker start forkedbrain
```

Stopping ForkedBrain does not stop Hermes, OpenViking, Coolify, the V2 tunnel, or the legacy Crypto service.

### Roll back the application

The latest accepted predecessor is retained as stopped container `forkedbrain-rollback-20260803T1408Z` and image `mark-forkedbrain:20260803T1408Z`.

```bash
docker stop forkedbrain
docker rename forkedbrain forkedbrain-failed-<utc-release>
docker rename forkedbrain-rollback-20260803T1408Z forkedbrain
docker update --restart=unless-stopped forkedbrain
docker start forkedbrain
```

Then wait for healthy status and run the routine status checks. Do not remove the failed container until its logs are captured and the cause is understood.

### Refresh the read-only database copy

Never mount a live WAL-mode workstation database directly into production. Create a consistent copy with SQLite's backup mechanism, switch only the copy to `journal_mode=DELETE`, and validate it before transfer:

```bash
sqlite3 <source-database> ".backup '<temporary-copy>'"
sqlite3 <temporary-copy> "PRAGMA journal_mode=DELETE; PRAGMA quick_check; PRAGMA foreign_key_check;"
```

Require `ok`, no foreign-key rows, the expected 164 indexed memories, and the expected source/event/artifact reconciliation. Stop ForkedBrain, replace only `/srv/mark-v2/forkedbrain/data/crypto-intelligence.db`, restore owner/group and mode `0440`, start ForkedBrain, and repeat API, restart, and hash checks. Never replace the authoritative local handoff while performing this refresh.

### API acceptance

The health endpoint is intentionally available only on the loopback origin. Every data or chat endpoint must reject a request without Cloudflare's authenticated identity header. With an approved identity, require:

- graph HTTP `200`, exactly 20 total visible nodes, 16 ranked memory records, at least one retained research conversation when conversation data exists, and the current total of 164 indexed memories
- detail HTTP `200` with real body, metadata, and stored insights where available
- chat reaches Hermes and returns a non-empty answer through the configured native OpenAI API provider
- unknown or unapproved identities receive HTTP `401`

### Root-domain verification

Before root DNS exists, add `forkedbrain.fyi` to the existing Cloudflare Access application with the same exact-email policy used for management. Then add the root tunnel ingress immediately before the final `http_status:404` rule:

```yaml
- hostname: forkedbrain.fyi
  service: http://127.0.0.1:9320
```

Validate the ingress file before restarting cloudflared. Externally, an unauthenticated request must redirect to the existing Cloudflare Access organization. Test Mark and Darshan separately. After authentication, verify the overview, graph, real memory detail, search/filter, and Hermes credit-state message. Recheck `brain`, `manage`, `manage-realtime`, and `intel` after the root change.

## Crypto Intelligence dashboard operations

Current accepted release: `20260903T163620Z`

Runtime contract:

- container: `crypto-dashboard`
- image: `mark-crypto-dashboard:20260903T163620Z`
- loopback origin: `http://127.0.0.1:9330`
- application network: `27am3wgv7vkohkenprml4s3p`
- database directory: `/srv/mark-v2/crypto-dashboard/data`
- private media archive: `/srv/mark-v2/crypto-legacy-media/v1`
- runtime environment: `/srv/mark-v2/secrets/crypto-dashboard.env`
- mounted Hermes password file: `/srv/mark-v2/secrets/forkedbrain-hermes-password`
- mounted OpenViking tenant key: `/srv/mark-v2/secrets/crypto-dashboard-openviking-key`
- mounted Satoshi registration secret: `/srv/mark-v2/secrets/satoshi-dashboard-sync-key`
- versioned deployment definition: `dashboard/deploy/docker-compose.production.yml`

Preferred application rollback: `mark-crypto-dashboard:20260903T131714Z` with
stopped container `crypto-dashboard-rollback-20260903T131714Z`. Candidate
`20260903T162235Z` was superseded after browser interaction exposed a navigation
cleanup defect and must not be treated as an accepted rollback target. Restore a
database backup only when data rollback is explicitly required.

### Routine status

```bash
docker ps --filter name=^/crypto-dashboard$ --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
curl -fsS http://127.0.0.1:9330/api/health
docker inspect crypto-dashboard --format '{{.HostConfig.ReadonlyRootfs}} {{.Config.User}} {{json .HostConfig.SecurityOpt}}'
```

Expected state is healthy, `127.0.0.1:9330->5183/tcp`, read-only root filesystem, user `dashboard`, and `no-new-privileges:true`. The database directory is the only writable application mount. Media, the Hermes password file, the tenant-scoped OpenViking key, and the Satoshi registration secret are read only. No model-provider key is mounted.

### Authenticated acceptance

The static interface must be protected by Cloudflare Access. Every data endpoint also requires the verified Access identity header and rejects missing or unknown identities with HTTP `401`. With an approved identity, require:

- brief reports 66 events, 54 sources, and 89 media files
- `GET /api/intelligence` reports `connected=true`, a 24-hour refresh interval,
  and the latest accepted briefing
- a disposable-canary `POST /api/intelligence/refresh` returns a non-empty
  briefing with at least one verified HTTP or HTTPS source
- media streaming supports byte ranges and returns HTTP `206`
- Ask returns `mode=hermes`, `state=connected`, a non-empty answer, and at least one canonical evidence record
- `GET /api/ingestion` reports `configured=true` and `connected=true`
- Capture accepts URL and pasted-text requests only after OpenViking accepts them, skips exact duplicates, and records no local source on provider failure
- Satoshi Crypto registration reports two persistent `ready` proof jobs, rejects missing or invalid service credentials, keeps one canonical source on replay, and remains available after dashboard and ForkedBrain restarts
- `GET /api/studio/status` reports `connected=true`, exactly the six supported draft formats, and the `mark` and `creator_reference` writing lenses
- Studio generation is exercised only in the disposable release canary: require a non-empty Hermes draft, the selected writing lens in the immediate and stored responses, at least one resolvable canonical citation, revision `0`, an appended revision `1`, and an unchanged production draft count
- `GET /api/quiz/status` reports `connected=true`; Quiz generation and grading are exercised only in the disposable release canary and must return exactly three evidence-linked questions, one complete feedback record per answer, and no production quiz write
- database `PRAGMA integrity_check` is `ok` and `PRAGMA foreign_key_check` returns no rows

Capture uses OpenViking's native URL/text acquisition path and Hermes's native
media skill for YouTube transcripts. YouTube is accepted only after a non-empty
transcript is stored and an exact native readback succeeds. Exact duplicates may
repair a stale capture and refresh the existing FTS projection. Private or
loopback targets are rejected. X and Instagram links are not claimed as captured;
the current interface asks for pasted source text instead. Do not add a custom
scraper, queue, vector database, or memory service around it. OpenViking's
approved VLM and embedding providers are funded and available. Before a release
that changes ingestion behavior, use a disposable fixture and require native
acceptance, search/read recall, and cleanup. If a
provider failure materialises a remote target, the application removes that
exact remote-only resource or returns `memory_processing`; it must never promote
the source to the local database while memory is incomplete.

Studio uses the existing native Hermes agent path and the existing Crypto
database. The application may select and serialize bounded corpus evidence, but
must not add a second agent, model provider, vector store, or reasoning engine.
The Mark lens loads `crypto-intelligence` and `humanized-content`. The Creator
Reference lens loads `creator-reference` and `humanized-content`, affects only
expression, and must return a clear unavailable state until manually supplied
reference material is present. Both use the same OpenViking memory.
Generated content is accepted only after canonical event/source citations
resolve locally. Invalid or missing citations must fail without creating a
draft. Revision `0` is the Hermes generation and browser edits append revisions;
they never replace the original. Edits to newly generated drafts must retain at
least one resolvable canonical citation and must reject invented citations
without creating a partial revision. Migrated legacy drafts retain their
existing edit contract. Run live generation acceptance only against a disposable
canary database because a successful request intentionally creates a draft.

Daily Intelligence uses Hermes's native full-agent session and native web tool.
The configured search backend is the key-free DDGS provider. It adds no service,
scraper, provider key, database, or reasoning layer. After recreating the Hermes
container, restore the native optional dependency and verify the backend:

```bash
hermes tools post-setup ddgs
hermes config set web.backend ddgs
hermes config get web.backend
```

The dashboard requests no more than five focused searches per review, stores
only the accepted bounded JSON briefing in the existing `generation_meta`
table, and retains the previous accepted briefing if validation fails. Scheduled
work runs at most once per 24 hours. A failed scheduled attempt also backs off
for 24 hours, so a transient failure cannot create a paid retry loop. Manual
refresh is limited to once every ten minutes per authenticated user and IP.
Hermes researches and recommends only; it does not publish, message, modify
accounts, or perform an external action from this workflow.

### Restart and rollback

Before restart, record the database SHA-256 and brief counts. Restart only `crypto-dashboard`, wait for healthy, and require the same checksum and counts.

The pre-route Cloudflare tunnel configuration is retained at:

```text
/srv/mark-v2/operator-backups/20260803T154358Z-cloudflared-crypto-route/config.yml
```

To remove public routing without changing the application, restore that file to `/etc/cloudflared/config.yml`, validate it, and restart `cloudflared`. To roll back the application, first preserve the current database, point `dashboard/deploy/docker-compose.production.yml` to `mark-crypto-dashboard:20260806T052651Z`, and recreate only `crypto-dashboard`. Restore `/srv/mark-v2/crypto-dashboard/backups/pre-20260807T152605Z/crypto-intelligence.db` only if a data rollback is also required. The clean accepted-state backup is `/srv/mark-v2/crypto-dashboard/backups/post-20260807T152605Z/`. The 2026-08-07 promotion used the old default Compose project identity, which consumed the renamed predecessor, so do not expect a stopped rollback container for this one release. The corrected promotion script assigns each future release a unique Compose project and will retain its renamed predecessor. Do not alter Hermes, OpenViking, ForkedBrain, Cloudflare, or the legacy `intel.forkedbrain.fyi` service.

# Cloudflare domain change gate

`intel.forkedbrain.fyi` is the live legacy Crypto Intelligence endpoint on the old VPS. Treat its DNS record, `crypto-intel` tunnel, public-hostname route, and connector as protected production state.

Do not create, edit, move, or delete any Cloudflare DNS record, tunnel, route, Access policy, or zone setting until Darshan has received the exact proposed plan, affected hostnames, verification steps, and rollback procedure and has explicitly approved execution.

The implemented V2 approach is isolation by hostname and tunnel: tunnel `mark-personal-ai-v2` serves `brain.forkedbrain.fyi`, `manage.forkedbrain.fyi`, and Coolify support hostname `manage-realtime.forkedbrain.fyi` while leaving `intel.forkedbrain.fyi` unchanged. OpenViking remains internal with no public DNS hostname. A later Crypto Intelligence cutover requires its own migration and acceptance plan.

## V2 Cloudflare verification

On the new VPS:

```bash
systemctl is-enabled cloudflared
systemctl is-active cloudflared
cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
ss -lnt | grep -E '127.0.0.1:(6001|6002|8000|9119|20241)'
```

From an external machine:

```bash
curl -I https://brain.forkedbrain.fyi/
curl -I https://manage.forkedbrain.fyi/
curl -I https://manage-realtime.forkedbrain.fyi/ready
curl -I https://intel.forkedbrain.fyi/
```

Expected results are: `brain` redirects to its Hermes login; unauthenticated requests to both management hostnames redirect to `misty-recipe-1c46.cloudflareaccess.com`; `intel` remains HTTP 200. After entering the one-time PIN sent to either approved email, Coolify's own login remains the second authentication layer. Direct access to `http://159.195.16.212:8000` must time out.

Cloudflare Access application `529f193c-2aad-4acf-af00-05ad556b58d0` contains the four public destinations `crypto.forkedbrain.fyi`, `forkedbrain.fyi`, `manage.forkedbrain.fyi`, and `manage-realtime.forkedbrain.fyi`. Exclusive policy `a5166e47-b9a3-4c51-82c2-977e0eacb171` allows only Mark's and Darshan's exact emails and expires Access sessions after 12 hours. Do not add `Everyone`, an email-domain wildcard, or a bypass policy. Any future policy mutation remains subject to the Cloudflare domain change gate.

For the approved Crypto Intelligence release, use `dashboard/deploy/activate-crypto-hostname.sh` only after creating a fresh short-lived token scoped to `Account > Access: Apps and Policies > Edit`. Supply the token through standard input from the owner-only credential tree, never as a command argument. The script accepts only the documented three-destination state or the already-completed four-destination state, preserves the exact two-email policy, captures both API and tunnel rollback material before mutation, adds `crypto.forkedbrain.fyi`, validates the tunnel, and requires the Cloudflare Access login redirect plus regression checks for every existing hostname. It rolls back both layers on any failed check. Revoke the temporary token and remove its local file immediately after acceptance.

The persistent Coolify loopback-binding and realtime-environment override is `/data/coolify/source/docker-compose.custom.yml`. It sets `PUSHER_HOST=manage-realtime.forkedbrain.fyi` and `PUSHER_PORT=443` without duplicating the secret `.env` file. Always validate it with the base and production Compose files before applying an upgrade. The tunnel-specific credential is recoverable from the owner-only client credential tree; never transfer the account-wide `~/.cloudflared/cert.pem` to the server.
