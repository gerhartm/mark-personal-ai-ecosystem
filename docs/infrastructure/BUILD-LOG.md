# Netcup V2 Infrastructure Build Log

## Scope

This log covers the initial provisioning and security baseline for Mark's Personal AI Ecosystem V2 server on 2026-07-31. It ends at the deliberate pause before creating the initial Coolify administrator.

No secret values are included.

## 1. Hosting provisioned

The client-owned netcup account contains the following server:

| Item | Value |
|---|---|
| Product | RS 2000 G12 |
| Site | Manassas, United States |
| CPU | 8 AMD64 cores |
| RAM | 16 GB advertised; 15 GiB visible to the OS |
| Disk | 512 GiB virtual disk; 503 GiB root filesystem |
| Public IPv4 | `159.195.16.212` |
| Public IPv6 | Present; value intentionally omitted from this summary |
| Provider hostname | `v2202607389872491325.supersrv.de` |

The provider hostname and server identifier were intentionally left unchanged.

## 2. Operating system installed

The preinstalled Debian image was replaced using the netcup Server Control Panel.

Selected image and options:

- Image: **Ubuntu 24.04.4 UEFI amd64**
- Installation method: **Minimal**
- Partitioning: **one large operating-system partition using all available disk space**
- Hostname: provider default retained
- Locale: `en_US.UTF-8`
- Installer timezone: `Europe/Berlin`
- Additional user: not created
- Custom installer script: none
- Installation notification email: enabled

The installer erased the new server's empty default disk as expected. After installation, the server was changed from `Europe/Berlin` to `UTC`.

## 3. Initial access established

A dedicated Ed25519 key pair was generated on the development Mac:

- Private key: `<CLIENT_ROOT>/.secrets/credentials/new-vps/ssh/mark_netcup_v2`
- Public key: `<CLIENT_ROOT>/.secrets/credentials/new-vps/ssh/mark_netcup_v2.pub`
- Fingerprint: `SHA256:/Yjy3IfjFbrGFhNxqMv6T1xX0hiQ1k+lKbIrb4R2Wrs`
- Comment: `mark-netcup-v2-2026-07-31`

File permissions:

- Private key: `0600`
- Public key: `0644`
- SSH config: `0600`

The public key was appended to `/root/.ssh/authorized_keys` during the initial password-authenticated SSH session. Key-based access was then independently verified from a new SSH connection before password authentication was disabled.

A local alias was added to `/Users/02darsh/.ssh/config`:

```sshconfig
Host mark-netcup-v2
    HostName 159.195.16.212
    User root
    IdentityFile "<CLIENT_ROOT>/.secrets/credentials/new-vps/ssh/mark_netcup_v2"
    IdentitiesOnly yes
```

The one-time netcup root password was not copied into the project, documentation, shared memory, or source control. The client retains provider-level recovery through the netcup Server Control Panel.

## 4. Fresh-server audit

Before hardening, the following state was observed:

- Ubuntu 24.04.4 LTS, kernel `6.8.0-136-generic`, AMD64.
- Eight CPU cores and approximately 15 GiB usable memory.
- Approximately 503 GiB root filesystem.
- No swap.
- No failed systemd units.
- Only SSH and local DNS listeners were present.
- SSH root login and password authentication were enabled.
- SSH public-key authentication was enabled.
- X11 and agent forwarding were enabled.
- UFW was installed but inactive.
- The operating system reported no pending package upgrades.

## 5. Base packages and updates

The following commands were run as root:

```bash
apt-get update
apt-get -y full-upgrade
apt-get install -y ca-certificates curl git jq ufw unattended-upgrades
```

Result:

- No package upgrades were pending.
- Required packages were already current or were marked explicitly installed.
- No failed systemd units were introduced.

## 6. Time configuration

The host timezone was standardized:

```bash
timedatectl set-timezone UTC
```

Verified result: `Timezone=UTC`.

## 7. Swap and memory-pressure configuration

An 8 GiB swap file was created for resilience during image builds, ingestion spikes, and memory pressure:

```bash
fallocate -l 8G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

The following persistent entry was added to `/etc/fstab`:

```text
/swapfile none swap sw 0 0
```

The file `/etc/sysctl.d/99-mark-v2.conf` was created with:

```text
vm.swappiness=10
vm.vfs_cache_pressure=50
```

Verified result:

- Swap total: 8.0 GiB
- Swap in use at capture: 0 B
- `vm.swappiness = 10`
- `vm.vfs_cache_pressure = 50`

Rollback:

```bash
swapoff /swapfile
sed -i '\|^/swapfile\s|d' /etc/fstab
rm /swapfile
rm /etc/sysctl.d/99-mark-v2.conf
sysctl --system
```

Rollback is not currently recommended.

## 8. SSH hardening

The file `/etc/ssh/sshd_config.d/99-mark-v2-hardening.conf` was created with:

```text
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
AllowAgentForwarding no
AllowTcpForwarding yes
```

Validation and activation:

```bash
sshd -t
systemctl reload ssh
```

A fresh connection using the dedicated key succeeded after the reload.

Effective verified settings:

- SSH port: `22`
- Root login: key only
- Password authentication: disabled
- Keyboard-interactive authentication: disabled
- Public-key authentication: enabled
- X11 forwarding: disabled
- Agent forwarding: disabled
- TCP forwarding: enabled
- Maximum authentication attempts: `3`

Recovery if the local key is unavailable:

1. Use netcup SCP → **Screen** for provider console access.
2. Restore or add an authorized public key under `/root/.ssh/authorized_keys`.
3. Validate with `sshd -t` before reloading SSH.

Do not re-enable password authentication merely to share access. Add a distinct public key for each operator instead.

## 9. Automatic maintenance

The file `/etc/apt/apt.conf.d/20auto-upgrades` contains:

```text
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
```

The SSD trim timer was enabled:

```bash
systemctl enable --now fstrim.timer
```

Verified result: `fstrim.timer` is enabled.

## 10. Host firewall

UFW defaults:

```text
Incoming: deny
Outgoing: allow
```

Rules:

| Port | Protocol | Action | Purpose |
|---|---|---|---|
| 22 | TCP | rate limited | SSH |
| 80 | TCP | allow | HTTP and certificate issuance |
| 443 | TCP | allow | HTTPS |
| 8000 | TCP | allow temporarily | direct Coolify setup |
| 6001 | TCP | allow temporarily | Coolify realtime |
| 6002 | TCP | allow temporarily | Coolify terminal |

Equivalent IPv6 rules are active.

Important limitation: Docker-published ports can bypass ordinary UFW filtering. A netcup provider firewall policy is therefore still required before production. The temporary Coolify ports must be closed at the provider firewall after a domain and HTTPS endpoint are working.

## 11. Coolify installed

The current official installer was downloaded from:

```text
https://cdn.coollabs.io/coolify/install.sh
```

Local server path:

```text
/root/coolify-install.sh
```

Installer SHA-256 at execution:

```text
58132d98fe956d1a16df378fd22250153b6fbc08a84e044d80da3324450a0ca3
```

Execution:

```bash
bash /root/coolify-install.sh 2>&1 | tee /root/coolify-install.log
```

Installation window:

- Started: 2026-07-31 09:22:29 UTC
- Completed: 2026-07-31 09:23:27 UTC

Installed versions:

| Component | Version or image |
|---|---|
| Coolify | `4.1.2` |
| Docker Engine | `29.7.0` |
| Docker Compose | `v5.3.1` |
| Coolify helper | `1.0.14` |
| Coolify realtime | `1.0.16` |
| PostgreSQL | `15-alpine` |
| Redis | `7-alpine` |
| Traefik | `v3.6` |
| Sentinel | `0.0.21` |

Coolify paths:

- Source/configuration: `/data/coolify/source/`
- Proxy configuration: `/data/coolify/proxy/`
- Environment file: `/data/coolify/source/.env`
- Installation log: `/data/coolify/source/installation-20260731-092229.log`
- Upgrade log: `/data/coolify/source/upgrade-2026-07-31-09-22-48.log`
- Wrapper log: `/root/coolify-install.log`

The `.env` file contains secrets generated by the installer. It was not displayed, copied into documentation, or exported.

Initial validation before pausing:

- All Coolify containers were running and healthy.
- The public endpoint returned an HTTP redirect to the initial login/root-user setup flow.
- No failed systemd units were present.
- Root filesystem usage was approximately 14 GiB of 503 GiB.

## 12. Coolify deliberately paused

The initial root administrator was **not** created. The user explicitly deferred that action and required full documentation first.

To avoid exposing an unclaimed public administrator-registration page, the Coolify stacks were stopped without deleting containers, volumes, configuration, database state, or secrets.

Commands used:

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

Verified result:

- Running Docker containers: `0`
- Port `8000` is unreachable publicly.
- Only SSH and local DNS are listening.
- All Coolify containers remain present in an exited state.

This is a reversible operational pause, not an uninstall.

## 13. Explicitly not completed at the pause checkpoint

At the 09:30 UTC pause checkpoint, the following actions had not occurred. Later sections supersede items completed afterward:

- No Coolify root administrator created.
- No Coolify administrator password generated or stored.
- No custom domain or HTTPS endpoint configured.
- No netcup provider firewall policy configured.
- No netcup server snapshot created.
- No off-server backup of Coolify's environment/configuration created.
- No OpenViking deployment.
- No Hermes deployment.
- No Codex CLI deployment.
- No virtual desktop deployment.
- No client API keys, OAuth sessions, Telegram tokens, or credentials migrated.
- No old-VPS content or databases migrated.
- No production acceptance testing performed.

These boundaries are intentional and define the exact resume point.

## 14. Documentation mirrored and verified

The complete non-secret infrastructure documentation was copied to:

```text
/root/mark-v2-docs/
```

The local project remains the source of truth. SHA-256 hashes for all five Markdown files were compared between the local and server copies and matched.

No passwords, private keys, API credentials, OAuth tokens, cookies, environment-file contents, or recovery codes are present in either copy.

## 15. Credential audit and environment permission correction

A value-free credential audit confirmed:

- The Ubuntu root password exists but is not stored by Codex or in this project.
- Two root authorized SSH keys exist: Darshan's dedicated operator key and Coolify's generated localhost-management key.
- Coolify's application, database, Redis, and realtime secrets are set.
- Coolify's root-administrator bootstrap fields are empty.
- No Hermes, OpenViking, Telegram, AI-provider, or old-VPS credential has been placed on the new server.

The official installer left `/data/coolify/source/.env` at mode `0644`. Because it contains generated secrets, it was changed to:

```text
0600 root:root
```

`docker compose config -q` succeeded afterward, proving that the stopped stack remains resumable with the restricted permission. The full value-free inventory and credential actions are in `CREDENTIAL-REGISTER.md`.

## 16. Coolify resumed and root administrator created

At 2026-07-31 10:34–10:42 UTC, Darshan authorized the existing Coolify stack to be resumed and the initial administrator to be created under Mark's ownership.

The documented Compose resume procedure started the existing source stack, proxy stack, and sentinel container without deleting volumes or database state. Because the Compose configuration tracks the current Coolify image, startup pulled a newer image and advanced Coolify from `4.1.2` to `4.2.0`. The running image digest is:

```text
coollabsio/coolify@sha256:b8aea35f4113e54c38be3e88f842e09856aebcf92bd3e264b06c567c99ed4921
```

The administrator was created through Coolify's own `RootUserSeeder`, the same validated application path used by Coolify's documented environment-variable bootstrap. The account uses Mark's approved owner email. The temporary plaintext password is stored only in the ignored owner-only V2 credential master and was not persisted in Coolify's server-side `.env`; PostgreSQL retains the application password hash.

Verification proved:

- the root user has database ID `0` and the approved email;
- the stored password hash matches the generated temporary credential;
- the root user belongs to team ID `0` with role `owner`;
- instance registration is disabled;
- `/register` redirects to `/login`;
- all six Coolify containers are healthy;
- no systemd unit is failed.

An interactive login was deliberately not attempted over the raw public HTTP address because that would transmit the password without TLS. It remains an acceptance check for the domain-and-HTTPS checkpoint.

## 17. Hermes release and deployment frozen

The first central-brain service was deployed through Coolify as an internal-only user-defined service.

| Item | Frozen value |
|---|---|
| Coolify project | `Mark Personal AI Ecosystem` |
| Project UUID | `wldhdj3wjm2zacaf3317u0w4` |
| Environment | `production` |
| Environment UUID | `9sd4ykxw1k8bsmzfzbr8lgoj` |
| Service | `Hermes Central Brain` |
| Service UUID | `27am3wgv7vkohkenprml4s3p` |
| Hermes release | `v0.19.1` / `v2026.7.30` |
| Linux AMD64 image digest | `sha256:5316c2c2534c49f5e1b1691e1a2115f1230d900033c3b35d1c8fc2e47352b26d` |
| Persistent volume | `27am3wgv7vkohkenprml4s3p_hermes-data:/opt/data` |
| Dashboard | `127.0.0.1:9119`, SSH tunnel only |
| API port | `8642` not published |
| Resource limits | 2 vCPU, 4 GiB memory, 1 GiB reservation |

Dashboard basic-auth credentials were created under Mark's approved owner email and stored only in the ignored owner-only credential master plus Coolify's encrypted runtime variables. The service has no domain or Traefik route.

The first API service-description attempt was rejected by Coolify validation because it contained a semicolon. No project service object was created by that request. A later streaming upload stalled before creating a service and was interrupted after database inspection confirmed the project had no service. A mode-`0600` staged request file was then used successfully and removed during cleanup.

## 18. Hermes configuration and persistence acceptance

The official container reported:

```text
Hermes Agent v0.19.1 (2026.7.30) · upstream cc4cab2f
```

The initial configuration was backed up inside the persistent volume at:

```text
/opt/data/config.yaml.pre-migrate-20260731T1138Z
```

`hermes config migrate` advanced the configuration schema from raw version `0` to current version `33`. The following unattended-loop controls were explicitly enabled:

```text
tool_loop_guardrails.hard_stop_enabled=true
tool_loop_guardrails.hard_stop_after.exact_failure=5
tool_loop_guardrails.hard_stop_after.idempotent_no_progress=5
```

The config and pre-migration backup are owned by the Hermes service user and restricted to mode `0600`. The migration emitted non-blocking warnings for unavailable Teams and Google Chat toolsets referenced by upstream channel definitions. Neither channel is enabled.

The first persistence-test command attempted to use `su-exec`, which is not installed in the official image. It did not restart the container or alter application state beyond the already-applied config permissions. The probe was recreated as root, assigned to the Hermes user, and the test continued.

A deliberate container restart then proved:

- the service returned under gateway supervision;
- the persistent-volume probe survived and was removed afterward;
- configuration version `33`, its `0600` permissions, and hard-stop settings survived;
- the authenticated dashboard session remained valid because its signing secret persisted;
- only server-loopback TCP `9119` returned after restart;
- the 2-vCPU and 4-GiB limits remained active.

Because this acceptance test used a direct Docker restart, `hermes gateway status` retained a recent diagnostic saying that the recorded pre-restart process was gone. The current supervised gateway and authenticated dashboard were verified healthy after the restart.

## 19. Temporary Coolify API access removed

Coolify's API was enabled only for the internal service bootstrap. After deployment and acceptance:

- the temporary `codex-hermes-bootstrap` token was revoked;
- the Coolify database reported zero matching bootstrap tokens;
- API access was disabled again;
- staged request, response, token, cookie, and test-probe artifacts were removed;
- no API token was copied into the project credential master because it was intentionally temporary.

## 20. Current application boundary

At this checkpoint, Hermes is deployed and internally reachable, but it has no model-provider credential. OpenViking, Telegram, Crypto-specific workflows, and selected legacy data are not deployed. This boundary is intentional: the next provider choice must be approved and recorded before its secret enters Coolify, and OpenViking will be added only through Hermes' official provider path.

## 21. Hermes documentation mirror refreshed

The redacted infrastructure record and frozen Hermes deployment definition were scanned for the exact generated dashboard password, the session-signing secret, and common private-key/API-key patterns. No match was present. The non-secret files were then streamed to the server recovery mirror under:

```text
/root/mark-v2-docs/docs/infrastructure/
/root/mark-v2-docs/deploy/hermes/
```

SHA-256 manifests for all mirrored files were compared with the authoritative local copies. The server lacked `rsync`, so the documented mirror used a `tar` stream over the existing key-authenticated SSH connection; no package was installed and no unrelated remote file was deleted.

## 22. OpenAI Platform provider connected

Darshan clarified that Mark has no ChatGPT account and authorized use of the preserved OpenAI Platform API key. The waiting Codex device-code process was cancelled before authorization; `openai-codex` remained logged out and stored no OAuth credential.

The normalized owner-only credential source was chosen instead of a transcript or archive copy. Canonical environment copies matched, and a non-generative `GET /v1/models` request returned HTTP 200 with GPT-5.6 Sol, Terra, and Luna visible.

Hermes' native credential manager added one entry:

```text
provider: openai-api
label: mark-openai-api
storage: /opt/data/auth.json
permissions: 0600, Hermes service user
```

The key was passed through secret stdin. It did not enter Compose, Coolify environment variables, command arguments, logs, ordinary documentation, or Obsidian. Hermes' native file is permission-protected but not encrypted at rest, so all off-server backups containing it must be encrypted.

The provider configuration was backed up to `/opt/data/config.yaml.pre-openai-api-20260731T1225Z`, then set to:

```text
model.provider=openai-api
model.default=gpt-5.6-sol
model.base_url=https://api.openai.com/v1
```

One exact-response smoke test succeeded on the first attempt with one API call, 14,414 input tokens, 12 output tokens, and the expected response. The large baseline input shows that full Hermes agent context should not be used blindly for high-volume background ingestion; later routing should use Terra/Luna or a lean worker only after measured testing.

A deliberate container restart proved that the credential, provider, model, base URL, owner-only permissions, gateway, dashboard, and loopback-only boundary persist. Temporary usage/output files were removed. The legacy-origin key should be rotated before production cutover.

## 23. Private OpenViking service initialized

The waiting OpenViking container was initialized using the frozen official `v0.4.11` image and its native configuration only. The service uses local AGFS/vector storage, API-key tenancy, AES-GCM file encryption, Argon2id API-key hashing, OpenAI `text-embedding-3-small` at 1536 dimensions, and `gpt-5.4` for VLM work. Its optional bot remains disabled.

One Mark-owned account and a dedicated Hermes user/agent identity were created. The service publishes no port, hostname, reverse-proxy label, or Cloudflare route. Configuration and encryption key files are mode `0600`; OpenViking credentials never entered Compose, Coolify's service environment, container environment, ordinary documentation, or chat output.

## 24. Hermes native memory provider accepted

Hermes was configured through its supported `memory.provider=openviking` path and receives only the tenant-bound Hermes key through its mode-`0600` profile environment. Hermes source, prompts, tools, command, and native behavior were not patched. Its running command remains `gateway run`.

Acceptance used Hermes's real OpenViking provider class to remember a unique non-sensitive marker, find it semantically, and read it exactly. The same record was recovered after independent OpenViking and Hermes restarts. Both containers returned with restart count zero and the provider remained installed/available. The acceptance marker was then deleted and confirmed unavailable.

## 25. Backup, restore, credential escrow, and access closeout

OpenViking was briefly stopped for a consistent volume archive. The archive was checksum-verified, restored into a disposable volume, and started through the same pinned image with no published port. Restored configuration/authentication, semantic search, and exact read all passed. The disposable container and volume were removed; the retained acceptance backup is mode `0600` under `/root/mark-v2-backups/20260731T175000Z-openviking-acceptance/`.

The root key, Hermes tenant key, encryption master key, and private configuration were transferred without printing values to the owner-only local V2 credential tree. Secret directories are mode `0700`, secret files are mode `0600`, and an exact-value scan found no OpenViking secret in ordinary project/source/deliverable files.

The temporary Coolify deployment token was revoked, API access was disabled, server staging secrets and test scripts were removed, and the production OpenViking service remained private and healthy. No Cloudflare or legacy service object changed.

## 26. Thin Crypto provenance layer accepted

The legacy Crypto export was audited without modification. Its canonical SQLite snapshot contains 66 events that map to 47 unique source identities, so the planned migration contains 113 semantic resources. The old OpenClaw vector database is empty and is not a migration source.

The custom layer is limited to deterministic URL/file/text/legacy-label identities, source and event envelopes, replay checks, and non-secret receipts. Hermes still owns reasoning, acquisition, tools, Telegram, and orchestration; OpenViking still owns resource processing, storage, and retrieval.

Live synthetic acceptance through Hermes's native OpenViking provider proved public-URL, document, transcript, and linked-event ingestion plus exact search/read retrieval. Testing also proved two native boundaries that the thin layer must handle:

- OpenViking removes Markdown front matter, so the accepted envelope keeps provenance in a visible fenced block inside the body.
- A native replay may reprocess an existing target, so the deterministic identity guard must skip before calling the provider.

All thirteen provenance/receipt unit tests passed. The isolated fixture namespace, acceptance-only session, and exact staging paths were removed. No legacy client content has been imported.

## 27. Production migration bundle and replay-safe executor prepared

The canonical database was converted locally into 47 source packets and 66 linked event packets. All 18 transcript references resolved: JSON timing payloads were reduced to transcript/content fields, DOCX text was read from OpenXML, the PDF used local `pdftotext`, and plain text remained plain text. Original files were not modified; each retains its owner-only archive reference and SHA-256 checksum.

An independent verifier proved 113 unique targets, exact canonical event IDs, complete event-to-source linkage, matching byte counts and checksums, and zero failures. The final semantic packet content is approximately 1.03 MB. Common secret-pattern and active old-path scans returned no findings.

The import runner validates every packet again, defaults to a write-free plan, requires an exact apply confirmation, uses Hermes's native OpenViking provider, checks each deterministic target before submission, writes a durable receipt after every result, and stops on the first failure. A fake-provider simulation proved one create pass followed by a replay pass with zero additional resources. Seventeen tests pass in total.

The client-content bundle remains only in the ignored local `.work` tree. It has not been copied to the VPS or imported into OpenViking. Import remains gated on Darshan's review of the 47-source/66-event reconciliation.

## 28. Complete legacy Crypto handoff prepared

Darshan approved importing all meaningful Crypto Intelligence data and asked Codex to prepare the system through the dashboard-design handoff while Claude Code owns the dashboard UI.

The preserved export was re-audited across the canonical SQLite snapshot, current event JSON, conversation archives, transcript directory, and binary archive. The complete semantic plan contains:

- 47 canonical source resources;
- 66 canonical linked event resources;
- one theme resource;
- 41 content-draft resources;
- 15 quiz-session resources preserving 107 questions and 23 answers;
- 16 pinned-summary resources;
- 14 additional unlinked transcript resources.

This produces 131 source/artifact packets and 66 event packets, or 197 unique targets. All 32 transcript files were text-extracted. Tool calls/results, credentials, cookies, caches, logs, duplicate backups, and binary media remain outside semantic memory.

A normalized SQLite handoff was built with exact source/event IDs and relational tables for event facets, theme links, drafts, quiz history, pin summaries, sanitized conversations, and media inventory. It contains 13 sanitized conversation sessions and 614 user/assistant messages. The database passes `PRAGMA integrity_check`, has zero foreign-key violations, and matches all manifest row counts.

An independent dashboard verifier validates the database checksum, integrity, foreign keys, row counts, manifest totals, safe paths, byte counts, and optional media checksums. Eighteen local migration tests pass. The verifier confirmed all 89 transcript/media files totaling 1,758,729,074 bytes on both the development Mac and VPS.

Private server artifacts are frozen at:

```text
/srv/mark-v2/crypto-dashboard-handoff/v1/
/srv/mark-v2/crypto-legacy-media/v1/
```

Both directories are mode `0700`; artifact files are owner-only. No asset is publicly served. The raw export and credentials were not copied into the dashboard bundle.

## 29. Complete semantic import halted on billing and rolled back cleanly

Before the first client-memory write, the production OpenViking volume was archived and checksum-verified at `/root/mark-v2-backups/20260803T050000Z-pre-complete-crypto-import/`.

The first streamed staging copy was rejected because macOS added 208 AppleDouble sidecars. A clean upload then verified exactly 199 packet/manifest files, zero sidecars, and three importer code files. The obsolete dirty server/container stages and failed local generated bundles were removed or moved to recoverable Trash.

The first live resource exposed OpenViking's collision-safe generated filename behavior. The executor had predicted the raw child filename and was interrupted after one source rather than accepting a false result. It was corrected to use body-visible deterministic schema/source/event identity through Hermes's native search/read tools and to retain the provider's canonical URI. A generated-filename replay simulation and transient-search retry test are included in the 18 passing tests.

The corrected attempt recorded one skip and 18 creates, then stopped on a failed twentieth record when the configured OpenAI Platform account returned `credit_balance_exhausted`. Native logs showed no data-integrity fault: the VLM/embedding provider had no credits. No additional records were submitted after diagnosis.

The attempt receipts were preserved locally and in owner-only server staging. The partial production volume was restored from the pre-import archive using the frozen OpenViking image. Its checksum passed immediately before restore. Final OpenViking state is connected and healthy with zero pending, running, or error tasks and an empty Hermes resource root.

The resume-ready clean staging remains at `/root/mark-v2-imports/20260803T053000Z-complete-crypto-clean/`. Complete semantic import, replay, retrieval/citation acceptance, and the post-import backup are gated only on funded model access. No Hermes/OpenViking source, Cloudflare object, DNS record, tunnel, legacy service, credential, Telegram configuration, or dashboard UI changed.

## 30. Claude dashboard visual direction pinned

Darshan approved a premium dark liquid-glass fintech intelligence direction with smooth ambient motion, layered translucent surfaces, precise data hierarchy, and restrained cyan-blue accents.

Claude Code may use Three.js for a small number of meaningful focal components, such as an ambient intelligence field or relationship explorer. The primary research experience remains accessible HTML, CSS, SVG, or Canvas. Three.js must be lazy-loaded, bounded by a motion and performance budget, paused when inactive, compatible with reduced-motion preferences, and backed by a non-3D fallback. No information or action may depend on 3D.

The design proposal must identify each planned 3D component, its product purpose, loading boundary, and fallback before UI implementation begins. This documentation-only update did not modify runtime services, production data, domains, or the legacy dashboard.
