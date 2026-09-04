# Infrastructure Operations Ledger

This is an append-only operational record. Newest entries go at the bottom. Never rewrite a completed historical entry; add a corrective entry instead.

## Entry template

```markdown
## YYYY-MM-DD HH:MM UTC — Short action name

- Operator:
- Status: pending | completed | rolled back | failed
- Purpose:
- Scope:
- Before state:
- Actions and commands:
- Files/services/ports/data affected:
- Verification:
- Rollback:
- Follow-up:
- Secrets handling: no secret values recorded
```

## 2026-07-31 09:14–09:19 UTC — Ubuntu provisioning and secure SSH bootstrap

- Operator: Darshan with Codex-assisted verification
- Status: completed
- Purpose: replace the empty provider image and establish recoverable key-based administration.
- Scope: netcup RS 2000 G12 operating system and SSH access.
- Before state: new server with default Debian installation.
- Actions and commands: installed Ubuntu 24.04.4 UEFI AMD64 Minimal from netcup SCP; retained provider hostname; generated a dedicated Ed25519 key; appended the public key to root's authorized keys; verified a second key-based connection.
- Files/services/ports/data affected: primary disk reimaged; `/root/.ssh/authorized_keys`; local `~/.ssh/mark_netcup_v2`, `.pub`, and `~/.ssh/config`; SSH port 22.
- Verification: Ubuntu login succeeded; dedicated key connection succeeded.
- Rollback: provider console or reimage; key can be removed from `authorized_keys` only after another working recovery key exists.
- Follow-up: none for bootstrap.
- Secrets handling: root password and private key values were not recorded.

## 2026-07-31 09:19–09:22 UTC — Base hardening

- Operator: Codex under Darshan's authorization
- Status: completed
- Purpose: establish a secure, repeatable host baseline before installing applications.
- Scope: OS updates, UTC, swap, SSH, automatic security updates, trim timer, and UFW.
- Before state: no swap; password SSH enabled; X11 and agent forwarding enabled; UFW inactive.
- Actions and commands: updated apt metadata; confirmed no pending upgrades; created 8 GiB swap; set UTC; added sysctl settings; disabled SSH password, keyboard-interactive, X11, and agent forwarding; limited authentication attempts; enabled unattended upgrades, fstrim, and UFW rules.
- Files/services/ports/data affected: `/swapfile`, `/etc/fstab`, `/etc/sysctl.d/99-mark-v2.conf`, `/etc/ssh/sshd_config.d/99-mark-v2-hardening.conf`, `/etc/apt/apt.conf.d/20auto-upgrades`, SSH service, UFW.
- Verification: fresh key login succeeded after SSH reload; timezone UTC; swap active; UFW active; no failed systemd units.
- Rollback: documented in `BUILD-LOG.md` and `RUNBOOK.md`.
- Follow-up: add netcup provider firewall before production.
- Secrets handling: no secret values recorded.

## 2026-07-31 09:22–09:23 UTC — Coolify installation

- Operator: Codex under Darshan's authorization
- Status: completed, then intentionally paused
- Purpose: establish the self-hosted deployment control plane.
- Scope: Docker Engine, Docker Compose, Coolify 4.1.2 and supporting containers.
- Before state: fresh secured Ubuntu host with no Docker.
- Actions and commands: downloaded the official Coolify installer; recorded its SHA-256; ran the installer; validated container health and the HTTP setup redirect.
- Files/services/ports/data affected: Docker packages and daemon; `/data/coolify/`; `/root/coolify-install.sh`; installer logs; TCP 80, 443, 8000, 6001, and 6002 while running.
- Verification: all Coolify containers healthy; HTTP redirected to root-user setup; no failed systemd units.
- Rollback: pause commands in `RUNBOOK.md`; uninstall was not performed.
- Follow-up: create initial root administrator only after ownership and credential storage are confirmed.
- Secrets handling: generated Coolify `.env` values were not displayed or exported.

## 2026-07-31 09:27–09:30 UTC — Secure pause before administrator creation

- Operator: Codex following Darshan's instruction
- Status: completed
- Purpose: prevent public exposure of an unclaimed Coolify registration page while documentation is prepared.
- Scope: Coolify source stack, proxy stack, and sentinel container.
- Before state: Coolify registration page publicly reachable on TCP 8000; no root administrator existed.
- Actions and commands: stopped both Docker Compose stacks and the standalone sentinel container without deleting containers, volumes, configuration, databases, or environment files.
- Files/services/ports/data affected: runtime state only; no persistent data removed.
- Verification: zero running Docker containers; public TCP 8000 unreachable; only SSH and local DNS listeners remain.
- Rollback: resume commands in `RUNBOOK.md`.
- Follow-up: obtain explicit approval before creating the initial administrator.
- Secrets handling: no administrator password was generated or stored.

## 2026-07-31 09:30–09:37 UTC — Infrastructure documentation and recovery mirror

- Operator: Codex following Darshan's documentation requirement
- Status: completed
- Purpose: ensure every completed change, verification, rollback, limitation, and pending action is recoverable without relying on chat history.
- Scope: local infrastructure documentation and a non-secret server-side mirror.
- Before state: server configuration and logs existed, but there was no unified build log or recovery runbook.
- Actions and commands: created the infrastructure README, build log, operations runbook, append-only operations ledger, and redacted state snapshot; scanned the files for secret-like patterns; validated stopped Compose definitions; copied the documentation to `/root/mark-v2-docs/`; compared SHA-256 hashes between local and remote copies.
- Files/services/ports/data affected: local `docs/infrastructure/` and remote `/root/mark-v2-docs/`; no runtime services or client data changed.
- Verification: all documentation files are non-empty; secret-pattern scan returned no findings; all five local/remote Markdown hashes matched.
- Rollback: the mirror can be regenerated from the authoritative local copy; historical ledger entries should not be deleted.
- Follow-up: append an entry for every future infrastructure change and refresh the verified mirror.
- Secrets handling: only non-secret operational metadata was documented.

## 2026-07-31 09:43 UTC — Credential audit and Coolify environment permission hardening

- Operator: Codex following Darshan's credential-accounting request
- Status: completed
- Purpose: identify every credential class created during provisioning without exposing values, and reduce read access to Coolify's generated secret environment.
- Scope: netcup ownership credentials, Ubuntu root password status, operator and Coolify SSH keys, Coolify internal environment variables, and credentials not yet created or migrated.
- Before state: credential classes were described across the build log, but no unified register existed; `/data/coolify/source/.env` had mode `0644`.
- Actions and commands: created `CREDENTIAL-REGISTER.md`; audited only credential names, fingerprints, ownership, permissions, and set/empty state; changed only `/data/coolify/source/.env` to mode `0600`; validated the stopped Compose definition; refreshed the server-side documentation mirror.
- Files/services/ports/data affected: local and mirrored documentation plus file permissions on `/data/coolify/source/.env`; no secret values, running services, ports, or client data will change.
- Verification: environment mode is `0600 root:root`; Compose configuration validates; both expected authorized-key fingerprints match; Coolify administrator fields remain empty; zero containers are running; documentation secret-pattern scan is clean; local and mirrored documentation hashes match.
- Rollback: restore mode `0644` only if a verified runtime requirement demands it; no such requirement is expected for root-managed Compose.
- Follow-up: Mark should rotate the netcup panel password, enable 2FA, store or rotate the root recovery password, and approve a secure off-server Coolify-secret backup before production.
- Secrets handling: no credential values will be read into output or documentation.

## 2026-07-31 10:00–10:13 UTC — Client-folder consolidation and credential custody

- Operator: Codex following Darshan's explicit restructure approval
- Status: completed
- Purpose: make the Mark Gerhart client folder the single local source of truth and preserve both old- and new-VPS credentials in owner-only storage.
- Scope: local project files, external Mark audit/source files, Codex attachments, SSH keypairs, Coolify secret backup, documentation paths, and reversible quarantine.
- Before state: project artifacts were divided between `GERHART`, `PDF's`, `_source`, LVLUP working directories, Codex attachments, and `~/.ssh`; only the old VPS had a raw master credential record.
- Actions and commands: captured pre-move hashes; reverified all 1,396 legacy-export checksums; created the canonical numbered folder structure; relocated authoritative source, deliverable, evidence, tools, and credential material; copied app-managed conversation/transcript attachments; moved duplicate/generated content into dated quarantine; relocated both Mark SSH keypairs; updated the netcup SSH alias; securely copied Coolify's internal environment into the new-VPS credential directory; created the V2 master credential record; updated tool and documentation paths.
- Files/services/ports/data affected: local Mark client folder, local `~/.ssh/config`, Mark-specific SSH key files, and a read-only copy operation from `/data/coolify/source/.env`; no server application, port, container, database, or client dataset was changed.
- Verification: netcup key-only SSH succeeded from the relocated key; zero containers remain running; both credential masters are mode `0600`; the final deliverables retain their pre-move hashes; the legacy export checksum manifest passes from its new parent location.
- Rollback: authoritative relocations are documented in `docs/migration/RESTRUCTURE-EXECUTION-LOG.md`; generated and duplicate material remains under `_quarantine/2026-07-31/`; pre-move hashes are retained in private migration storage.
- Follow-up: create the Coolify administrator under Mark's ownership, complete missing provider/recovery entries, and delete quarantine only after explicit approval.
- Secrets handling: raw values exist only under the client folder's ignored `.secrets/` tree; no raw value was printed or added to normal documentation.

## 2026-07-31 10:34 UTC — Coolify administrator bootstrap

- Operator: Codex under Darshan's explicit authorization
- Status: in progress
- Purpose: resume the verified Coolify installation and establish the first client-owned administrator.
- Scope: existing Coolify containers, initial administrator record, V2 master credential record, and login verification.
- Before state: Coolify is installed with persistent state intact but all containers are stopped; no administrator exists; public setup page is offline.
- Authorized owner identity: Mark-controlled account using `gerhartmark@gmail.com`.
- Planned actions: resume the existing Coolify source, proxy, and sentinel containers; generate a unique temporary administrator password; create the administrator; verify login in a fresh session; store the credential only in the ignored owner-only master credential file; notify Darshan for later rotation.
- Files/services/ports/data affected: Docker runtime state, Coolify database administrator record, `.secrets/credentials/new-vps/ALL-CREDENTIALS.txt`, and the non-secret infrastructure documentation mirror.
- Rollback: if bootstrap fails before account creation, stop the containers using the documented pause procedure; if an unexpected administrator exists, stop without attempting a reset.
- Secrets handling: the generated password must remain in the private credential record and the authorized project conversation; it must not enter Git, ordinary documentation, shell history, or server logs.

## 2026-07-31 10:42 UTC — Coolify administrator bootstrap completed

- Operator: Codex under Darshan's explicit authorization
- Status: completed
- Purpose: close the initial Coolify ownership and registration-security checkpoint.
- Scope: existing Coolify runtime, root administrator, root-team ownership, registration state, private credential record, and redacted documentation.
- Before state: all Coolify containers stopped; no administrator; registration bootstrap route unclaimed.
- Actions and commands: resumed the existing Compose source and proxy stacks and sentinel container; observed the configured image refresh; generated a unique temporary credential; stored it in the ignored mode-`0600` V2 credential master; invoked Coolify's validated `RootUserSeeder`; verified application/database state and HTTP redirects without disclosing the credential.
- Files/services/ports/data affected: Coolify image advanced from `4.1.2` to `4.2.0`; six Coolify containers running; one root user and root-team membership created in Coolify PostgreSQL; instance registration disabled; private credential master updated.
- Verification: approved email present; password hash matches; team ID `0` role is `owner`; registration disabled; `/register` redirects to `/login`; all six containers healthy; zero failed systemd units.
- Rollback/recovery: runtime can be safely paused with the documented Compose stop procedure; do not delete the root user as a routine rollback. Use Coolify's official root password/email commands for credential recovery.
- Follow-up: configure a Mark-controlled domain and HTTPS, verify interactive login over TLS, rotate the temporary administrator password, add the netcup provider firewall, and close temporary direct ports.
- Secrets handling: plaintext password exists only in the private credential master and the authorized project conversation; it was not persisted in Coolify's `.env`, ordinary documentation, Git, or logs.

## 2026-07-31 10:44 UTC — Post-bootstrap documentation mirror verified

- Operator: Codex under Darshan's documentation requirement
- Status: completed
- Purpose: preserve the administrator-bootstrap record independently on the server without copying secrets.
- Scope: seven non-secret Markdown files under the local infrastructure directory and `/root/mark-v2-docs/`.
- Actions and commands: scanned the active non-secret tree for the generated password and common private-key/API-key patterns; copied the updated infrastructure documents and new redacted state snapshot to the server mirror; calculated SHA-256 hashes locally and remotely.
- Verification: secret scan passed; the owner-only credential master remains mode `0600`; all seven local and mirrored Markdown hashes match exactly.
- Rollback/recovery: the remote mirror may be regenerated from the authoritative local project copy at any time.
- Follow-up: refresh and reverify the mirror after the domain, HTTPS, firewall, or application-deployment checkpoints.
- Secrets handling: no raw password, private key, API key, token, cookie, or `.env` content exists in the mirrored documentation.

## 2026-07-31 11:00 UTC — Domain hardening parked; Milestone 2 opened

- Operator: Codex under Darshan's explicit direction
- Status: completed decision checkpoint
- Purpose: continue useful implementation while Mark selects the Personal AI Ecosystem domain.
- Parked work: Coolify domain, HTTPS, interactive login over TLS, temporary-password rotation, netcup provider firewall, and closure of public TCP `8000`, `6001`, and `6002`.
- Interim access rule: use the SSH tunnel for Coolify; do not submit credentials to the raw public HTTP endpoint; do not expose a new public application endpoint.
- Active scope: internally stage and validate one Hermes central brain, then connect the official self-hosted OpenViking memory provider with no duplicated Hermes capability.
- Verification boundary: the parked controls remain required before production/public acceptance even if internal application staging succeeds.
- Secrets handling: no credential value changed or moved during this decision checkpoint.

## 2026-07-31 11:08 UTC — Hermes v0.19.1 internal deployment preparation

- Operator: Codex under Darshan's instruction to continue to Milestone 2
- Status: pending
- Purpose: freeze and stage the first Hermes central-brain deployment without exposing a new public endpoint.
- Scope: official Hermes Docker image, one Coolify user-defined service, one persistent data volume, loopback-only dashboard access, runtime dashboard credentials, resource limits, and rollback documentation.
- Before state: Coolify 4.2.0 and its six platform containers are healthy; approximately 14 GiB RAM and 468 GiB disk are available; no Hermes or OpenViking container, data, credential, or public endpoint exists on the new VPS.
- Planned actions: pin Hermes release `v0.19.1` using official image tag `v2026.7.30` and its Linux AMD64 digest; create the Coolify project/service; generate unique dashboard credentials into approved secret stores; deploy internally; enable unattended loop-guard hard stops; verify image identity, runtime health, authentication, loopback-only listeners, restart persistence, and logs.
- Files/services/ports/data affected: local `02-Project-Workspace/deploy/hermes/`; Coolify project and service metadata; one Hermes container; one persistent `/opt/data` volume; server-loopback TCP `9119`; private V2 credential master. TCP `8642` and all public application routes remain closed.
- Rollback: stop the Hermes service without deleting its volume; remove the service only after preserving or intentionally discarding `/opt/data`; never start two gateways against the same volume.
- Follow-up: connect an approved model provider, then deploy and connect OpenViking separately only after the Hermes-native baseline passes.
- Secrets handling: dashboard password and session secret will be generated directly into approved private storage and will not enter normal documentation, Git, command output, or Obsidian memory.

## 2026-07-31 11:16 UTC — Temporary Coolify API bootstrap authorization

- Operator: Codex under Darshan's continuing Milestone 2 authorization
- Status: pending
- Purpose: use Coolify's official API to create and deploy the Hermes service while the HTTPS dashboard login remains parked.
- Scope: one seven-day, team-scoped Coolify access token with `read`, `write`, and `deploy` permissions; temporary API enablement; project, environment, service, and runtime-environment creation.
- Before state: Coolify API access is disabled; no API token, project, environment, or Hermes service exists.
- Planned actions: create the least-privilege token inside Coolify without printing it; store it temporarily on the server with mode `0600`; enable the API; make loopback API calls only; deploy and verify Hermes; revoke the token, delete the temporary token file, and disable the API again.
- Files/services/ports/data affected: Coolify token and project metadata; Coolify API state; no additional public listener because API calls target `127.0.0.1:8000`.
- Rollback: revoke the temporary token and disable API access; delete an empty or failed project/service only after confirming no persistent data is attached.
- Secrets handling: the temporary token remains server-local and is destroyed after use; it is not copied into the project credential master because it is intentionally non-recoverable and short-lived.

## 2026-07-31 11:18–11:35 UTC — Hermes service created and deployed

- Operator: Codex under Darshan's continuing Milestone 2 authorization
- Status: completed
- Purpose: establish the first private Hermes central-brain baseline on the new VPS.
- Scope: Coolify project/environment/service metadata, official Hermes image, dashboard authentication, persistent volume, resource envelope, and loopback exposure.
- Before state: no Hermes project, service, container, volume, credential, or application listener existed.
- Actions and commands: created Coolify project `Mark Personal AI Ecosystem` and production environment; generated owner credentials into the private V2 master; created the user-defined `Hermes Central Brain` service; set encrypted environment variables; deployed the frozen Compose definition.
- API recovery detail: the first service-description request was rejected because Coolify disallowed a semicolon and created no object; a later upload pipe stalled before object creation and was interrupted only after database verification; the successful retry used a mode-`0600` staged request file.
- Files/services/ports/data affected: project UUID `wldhdj3wjm2zacaf3317u0w4`; environment UUID `9sd4ykxw1k8bsmzfzbr8lgoj`; service UUID `27am3wgv7vkohkenprml4s3p`; container `hermes-27am3wgv7vkohkenprml4s3p`; volume `27am3wgv7vkohkenprml4s3p_hermes-data`; server-loopback TCP `9119`; private credential master.
- Verification: Hermes reported version `0.19.1`; running Linux AMD64 image matched `sha256:5316c2c2534c49f5e1b1691e1a2115f1230d900033c3b35d1c8fc2e47352b26d`; limits were 2 vCPU and 4 GiB; unauthenticated dashboard redirected to login; valid credential login and `/api/auth/me` succeeded; the public address could not reach `9119`; TCP `8642` was not listening.
- Rollback/recovery: stop the service in Coolify without deleting the named volume; preserve `/opt/data` before any service deletion or image rollback; never run two gateways against the same volume.
- Follow-up: connect an approved model provider, then deploy OpenViking separately.
- Secrets handling: raw dashboard password and signing secret exist only in approved private stores and were never added to normal documentation or source.

## 2026-07-31 11:35–11:42 UTC — Hermes migration and restart acceptance

- Operator: Codex under Darshan's documentation and verification requirement
- Status: completed
- Purpose: make the provider-free Hermes baseline safe for unattended operation and prove persistence.
- Before state: Hermes running with the official default configuration at raw schema version `0`.
- Actions and commands: created `/opt/data/config.yaml.pre-migrate-20260731T1138Z`; enabled exact-failure and idempotent-no-progress hard stops at five repetitions; ran `hermes config migrate`; restricted config files to `0600`; wrote a non-secret persistence probe; restarted the container; repeated gateway, config, listener, authentication, volume, and resource checks; removed the probe.
- Recovery detail: the first probe command referenced unavailable `su-exec`, so no restart occurred; the probe was recreated with root ownership adjustment and the acceptance sequence was repeated successfully.
- Files/services/ports/data affected: `/opt/data/config.yaml`, its pre-migration backup, the transient removed probe, Hermes container process, and the existing authenticated dashboard session.
- Verification: schema version `33` passed `hermes config check`; gateway returned under supervision; config, permissions, hard-stop values, volume data, and authenticated session survived; only loopback `9119` listened; resource limits remained active.
- Known diagnostic: the direct Docker restart left a recent-history warning that the recorded pre-restart process was gone; the current gateway and dashboard were independently verified healthy.
- Rollback/recovery: restore the pre-migration config only if the current release rejects version `33`; preserve a copy first and use Coolify to restart once, then rerun all acceptance checks.
- Secrets handling: no secret value was added to command output or documentation.

## 2026-07-31 11:42 UTC — Coolify API bootstrap cleanup

- Operator: Codex under Darshan's security requirement
- Status: completed
- Purpose: remove the temporary automation path immediately after successful deployment.
- Scope: Coolify API enablement, temporary bootstrap token, staged payloads/responses/cookies, and acceptance probe.
- Actions and commands: revoked the `codex-hermes-bootstrap` token; disabled the Coolify API; removed explicit temporary server/container files; removed the persistence probe after verification.
- Verification: Coolify reported API disabled and zero matching bootstrap tokens; the Hermes service continued running; no targeted bootstrap artifact remained.
- Rollback/recovery: create a newly scoped, short-lived token only for a separately documented future automation task; never restore the revoked token.
- Follow-up: refresh the non-secret server documentation mirror and retain normal UI/tunnel administration.
- Secrets handling: no temporary token or cookie was retained in any credential file.

## 2026-07-31 11:46 UTC — Hermes documentation and recovery mirror finalized

- Operator: Codex under Darshan's documentation requirement
- Status: completed
- Purpose: make the completed Hermes baseline reproducible without copying any credential value.
- Scope: local infrastructure documents, frozen Hermes Compose/README, redacted state snapshot, and `/root/mark-v2-docs/` on the new VPS.
- Actions and commands: updated the runbook, credential register, build log, operations ledger, deployment record, and redacted snapshot; validated Compose using dummy values; scanned the non-secret tree for exact generated secrets and common credential patterns; streamed files over key-authenticated SSH using `tar` because the server has no `rsync`; compared local and remote SHA-256 manifests.
- Files/services/ports/data affected: non-secret Markdown/YAML files only; no application container, credential, listener, or client data changed.
- Verification: exact password/signing-secret scan returned no match; generic secret scan returned no match; all local and mirrored file hashes matched; master credential and operator key remained mode `0600`.
- Rollback/recovery: the server mirror is non-authoritative and may be regenerated from the local client folder; application recovery follows `RUNBOOK.md` and the persistent `/opt/data` volume.
- Follow-up: select the approved model-provider authentication method, then prepare the separate OpenViking service.
- Secrets handling: the mirror contains no raw password, token, API key, signing secret, private key, cookie, or environment file.

## 2026-07-31 12:16 UTC — Mark-owned OpenAI Codex OAuth connection

- Operator: Codex under Darshan's instruction to continue with the next smaller build step
- Status: pending user authorization
- Purpose: connect the provider-free Hermes baseline to Mark's eligible ChatGPT/Codex subscription without adding Codex CLI, an API key, or a redundant model proxy.
- Scope: Hermes-native `openai-codex` provider, one Mark-owned OAuth credential in the persistent Hermes credential pool, model selection, and a minimal non-destructive inference smoke test.
- Before state: `hermes auth status openai-codex` reports logged out; no model-provider credential is stored; Hermes gateway and dashboard are healthy.
- Planned actions: start Hermes' native OpenAI device-code flow; have Mark authorize through OpenAI's browser page; confirm the credential is stored under `/opt/data`; select an eligible Codex model; run one short response test; restart and confirm credential/provider persistence without printing tokens.
- Files/services/ports/data affected: the existing Hermes persistent volume and provider configuration only; no new container, public listener, API key, Telegram integration, or legacy data.
- Rollback/recovery: `hermes auth remove openai-codex 1` or `hermes auth logout openai-codex`, followed by provider-status verification; do not delete the Hermes volume.
- Secrets handling: OAuth access and refresh tokens must remain only inside Hermes' persistent credential store and must never enter documentation, chat, logs, or the client credential text file.

## 2026-07-31 12:20 UTC — Provider path changed from OAuth to OpenAI API key

- Operator: Codex under Darshan's explicit correction that Mark has no ChatGPT account and the preserved API key should be used
- Status: in progress
- Purpose: use the already-approved Mark-owned OpenAI Platform credential instead of an unavailable ChatGPT subscription login.
- Before state: the OpenAI device-code flow was waiting for authorization; no OAuth credential had been stored.
- Actions and checks: cancelled the device-code process with Ctrl+C; verified `openai-codex` remains logged out; selected the normalized old-VPS `OPENAI_API_KEY` source rather than transcript/archive copies; confirmed the canonical environment copies match; validated the key with `GET /v1/models`, which returned HTTP 200; confirmed the account lists GPT-5.6 Sol, Terra, and Luna.
- Planned continuation: add one `openai-api` credential to Hermes' native credential pool using secret stdin; set the initial model by role; run a minimal paid inference smoke test; verify persistence after restart without exposing the key.
- Files/services/ports/data affected: Hermes persistent credential/config storage only; no new service, public listener, OAuth token, or copied raw credential file.
- Cost boundary: the model-list validation was non-generative; the following smoke test will make one minimal API request and may incur a small normal OpenAI API charge.
- Rollback/recovery: remove the new `openai-api` pool entry and restore the provider-free config; the preserved old-VPS credential source remains unchanged.
- Secrets handling: the API key will be read from the owner-only normalized credential file and passed over stdin; it must not appear in arguments, process lists, output, documentation, or Obsidian.

## 2026-07-31 12:30 UTC — OpenAI API provider connection completed

- Operator: Codex under Darshan's explicit API-key authorization
- Status: completed
- Purpose: give Hermes a verified primary reasoning model using its native provider path and the approved existing credential.
- Actions and commands: added one `openai-api` pool entry through secret stdin; backed up the previous config; selected `openai-api`, `gpt-5.6-sol`, and the official OpenAI base URL; ran config validation; performed one exact-response inference; removed temporary usage/output files; restarted the container; repeated provider, model, permission, gateway, dashboard, listener, and host checks.
- Files/services/ports/data affected: `/opt/data/auth.json` mode `0600`; `/opt/data/config.yaml`; `/opt/data/config.yaml.pre-openai-api-20260731T1225Z`; existing Hermes container process. No new container, public listener, Compose secret, Coolify environment value, Telegram credential, or legacy dataset.
- Verification: OpenAI model listing returned HTTP 200; GPT-5.6 Sol/Terra/Luna were listed; Hermes returned exactly `HERMES_OPENAI_SMOKE_OK` through `gpt-5.6-sol`; one API credential is active; restart preserved credential/config; dashboard returned its login redirect on `127.0.0.1:9119`; TCP `8642` remained closed; zero systemd units failed.
- Cost/efficiency observation: the smoke request used 14,414 input and 12 output tokens because the full Hermes baseline context was loaded; do not use Sol indiscriminately for high-volume ingestion without role-based measurement and routing.
- Rollback/recovery: remove the `mark-openai-api` credential, restore `/opt/data/config.yaml.pre-openai-api-20260731T1225Z`, restart once, and verify the provider-free baseline. Rotate the migrated key before production cutover.
- Secrets handling: raw key remains confined to approved owner-only credential sources and Hermes' `0600` auth store; it is absent from output, docs, Compose, environment, and mirror files.

## 2026-07-31 12:33 UTC — OpenAI provider documentation mirror verified

- Operator: Codex under Darshan's documentation requirement
- Status: completed
- Purpose: preserve the redacted provider configuration, validation, rollback, and rotation record on the VPS.
- Actions and checks: scanned the updated non-secret tree for the exact OpenAI key, dashboard password, signing secret, and common key patterns; confirmed the key is absent from the container definition and recent logs; validated Compose with dummy values; streamed the updated docs/deployment files to `/root/mark-v2-docs/`; compared SHA-256 manifests.
- Verification: all secret scans passed; the new-VPS master remained mode `0600`; all local and remote non-secret file hashes matched.
- Rollback/recovery: regenerate the non-authoritative server mirror from the local client folder; provider rollback remains documented separately.
- Secrets handling: no raw credential was copied to the documentation mirror.

## 2026-07-31 13:28 UTC — Darshan Cloudflare member access bootstrap

- Operator: Codex under Darshan's instruction to connect his invited Cloudflare member account.
- Status: pending browser authorization
- Purpose: replace operational dependence on the preserved legacy-VPS account certificate with an auditable login belonging to Darshan's invited Cloudflare member identity.
- Scope: Darshan's local workstation only; Cloudflare account membership, `forkedbrain.fyi`, DNS records, tunnels, and the new VPS remain unchanged.
- Before state: Darshan reports that Mark granted him complete Cloudflare account access; no local `cloudflared` account certificate or Wrangler OAuth configuration existed.
- Actions and commands: attempted a read-only dashboard verification, which the Codex in-app browser blocked because its admin-enforced security policy could not be verified; installed official Homebrew `cloudflared` version `2026.7.3`; started `cloudflared tunnel login` and opened Cloudflare's one-time authorization page.
- Files/services/ports/data affected: Homebrew installation under `/opt/homebrew/Cellar/cloudflared/2026.7.3`; no Cloudflare object, DNS record, tunnel route, local project file, server service, or public listener changed.
- Verification: `cloudflared` installation completed; authorization remains incomplete until Darshan selects `forkedbrain.fyi` and approves the browser prompt, after which the issued account certificate must be validated without displaying its contents.
- Rollback/recovery: cancel the pending login process; after authorization, revoke the related Cloudflare Tunnel API token from Darshan's Cloudflare profile and securely delete the local certificate if workstation management is no longer required.
- Follow-up: complete browser authorization, verify account/zone/tunnel visibility read-only, register only the credential class and fingerprint/permissions, then plan the V2 hostname and tunnel without altering the legacy route.
- Secrets handling: the one-time authorization URL and any eventual certificate value are excluded from project documentation and chat output.

## 2026-07-31 14:35 UTC — Darshan Cloudflare member access verified

- Operator: Codex under Darshan's authorization.
- Status: completed
- Purpose: confirm that Darshan's own invited identity can manage Mark's Cloudflare tunnels without reusing the legacy VPS certificate.
- Actions and commands: completed Cloudflare's one-time browser authorization for `forkedbrain.fyi`; restricted the local account certificate to mode `0600`; queried the tunnel inventory read-only; recorded only the certificate file fingerprint and location in approved credential records.
- Files/services/ports/data affected: `~/.cloudflared/cert.pem`, the private V2 credential master, and redacted infrastructure documentation. No Cloudflare DNS record, tunnel route, zone setting, old-VPS connector, new-VPS service, or public listener changed.
- Verification: `cloudflared` `2026.7.3` authenticated successfully; the account returned active tunnel `crypto-intel` with UUID `68e4f425-54d3-475b-8773-cdea15f98f9c`; the certificate file is owned by Darshan and mode `0600`.
- Rollback/recovery: revoke the Cloudflare Tunnel API token issued to Darshan from his Cloudflare profile, then securely delete `~/.cloudflared/cert.pem`; this does not delete the tunnel or its routes.
- Follow-up: choose the V2 public hostname, create a separate V2 tunnel/route, verify TLS and authentication, then retire the legacy route only after acceptance.
- Secrets handling: the raw certificate and authorization URL were not copied into documentation, chat, the client folder, or the VPS.

## 2026-07-31 14:40 UTC — Legacy hostname protection and V2 domain plan

- Operator: Codex following Darshan's explicit domain-change gate.
- Status: plan only; no Cloudflare mutation authorized
- Purpose: continue V2 infrastructure work without affecting the live Crypto Intelligence system on the old VPS.
- Protected production state: `intel.forkedbrain.fyi`, the existing `crypto-intel` tunnel, its DNS/public-hostname route, and its old-VPS connector.
- Proposed isolated V2 state: a separate new-VPS tunnel; `brain.forkedbrain.fyi` for the authenticated Hermes interface; `manage.forkedbrain.fyi` for Coolify behind Cloudflare Access; OpenViking reachable only on the internal service network with no public hostname.
- Verification boundary: inspect conflicts before creation; verify each new hostname and Access boundary externally; confirm `intel.forkedbrain.fyi` remains healthy before and after every V2 change.
- Rollback: remove only the newly created V2 hostname records and V2 tunnel; the protected legacy record and tunnel must remain untouched.
- Follow-up: present the exact execution plan to Darshan and wait for explicit approval before making any Cloudflare change.
- Secrets handling: no credential or authorization material changed.

## 2026-07-31 14:52–14:58 UTC — Isolated V2 Cloudflare tunnel and approved hostnames

- Operator: Codex following Darshan's explicit approval of the presented hostname plan.
- Status: completed
- Purpose: publish the new Hermes and Coolify interfaces without affecting the live Crypto Intelligence hostname.
- Before state: `intel.forkedbrain.fyi` returned HTTP 200 through `crypto-intel`; `brain.forkedbrain.fyi` and `manage.forkedbrain.fyi` returned NXDOMAIN; no Cloudflare service or tunnel credential existed on the new VPS.
- Actions and commands: created locally managed tunnel `mark-personal-ai-v2`; generated a tunnel-specific credential directly into owner-only storage; installed signed `cloudflared` `2026.7.3` on Ubuntu Noble; transferred only the tunnel-specific credential; validated ordered ingress rules; installed and started the systemd service; created CNAME tunnel routes for only `brain` and `manage`.
- Files/services/ports/data affected: local ignored tunnel credential; `/etc/cloudflared/config.yml`; `/etc/cloudflared/<V2-tunnel-UUID>.json`; signed apt repository metadata; `cloudflared.service`; two new Cloudflare DNS routes.
- Verification: service enabled and active; four QUIC connections registered; public HTTPS for `brain` and `manage` returned their respective authentication redirects; `intel` remained HTTP 200; both old and V2 tunnels remained connected.
- Rollback/recovery: stop the V2 service first; remove only the two V2 DNS routes and V2 tunnel if explicitly authorized; never edit the legacy hostname or tunnel during rollback.
- Follow-up: configure Cloudflare Access for `manage`; obtain separate approval before adding the Coolify realtime support hostname.
- Secrets handling: the account certificate stayed workstation-only; the tunnel credential is mode `0600` locally and on the VPS and was never printed or copied into ordinary documentation.

## 2026-07-31 14:58–15:05 UTC — Coolify direct-port isolation and merge recovery

- Operator: Codex under the approved tunnel hardening scope.
- Status: completed after one recovered validation failure
- Purpose: prevent Docker's published ports from bypassing UFW now that Cloudflare Tunnel provides the administrative path.
- Before state: UFW allow rules for `8000`, `6001`, and `6002` were removed, but external connection tests still succeeded because Docker's forwarding rules bypassed the host firewall.
- Actions and commands: created Coolify's persistent official `docker-compose.custom.yml`; the first ordinary Compose merge appended loopback mappings and Docker rejected the duplicate bind before either replacement container started; updated the override to use Compose `!override`; validated the exact merged port objects; recreated only Coolify and realtime containers; rechecked health, listeners, direct access, and tunnel URLs.
- Files/services/ports/data affected: `/data/coolify/source/docker-compose.custom.yml`; Coolify and realtime container runtime instances; no database, volume, user, Hermes container, Cloudflare route, or client data changed.
- Verification: Coolify and realtime returned healthy; mappings are exclusively `127.0.0.1:8000`, `127.0.0.1:6001`, and `127.0.0.1:6002`; Hermes remains on `127.0.0.1:9119`; direct public-IP port `8000` timed out; `brain` and `manage` continued returning HTTPS authentication redirects; `intel` remained HTTP 200.
- Rollback/recovery: keep the custom file because Coolify upgrades preserve it; to roll back, restore the prior public mappings only after another protected path is verified and explicitly authorized.
- Follow-up: do not consider `manage` production-hardened until Cloudflare Access is configured; do not add the realtime hostname without approval.
- Secrets handling: no credential value changed or entered logs or documentation.

## 2026-07-31 15:10 UTC — Cloudflare V2 documentation mirror verified

- Operator: Codex under Darshan's documentation requirement.
- Status: completed
- Purpose: preserve the tunnel, DNS, port-isolation, recovery, and pending-boundary record independently on the new VPS.
- Actions and checks: updated the private credential master by reference only; created frozen Cloudflare and Coolify deployment files; updated the redacted register, runbook, current-state README, operations ledger, and acceptance snapshot; scanned the ordinary documentation tree for common raw-secret patterns; copied only non-secret documentation/configuration to `/root/mark-v2-docs/`; compared normalized local/server SHA-256 manifests.
- Verification: ten selected authoritative files matched exactly; the tunnel credential copies separately matched exactly and remained mode `0600`; no raw account certificate, tunnel credential, API key, password, token, or environment file entered the documentation mirror.
- Rollback/recovery: regenerate the non-authoritative server mirror from the local client folder; infrastructure rollback follows the V2 tunnel and custom-Compose procedures above.
- Secrets handling: only credential paths, scopes, UUIDs, modes, and SHA-256 file fingerprints were documented.

## 2026-07-31 15:20–15:28 UTC — Coolify realtime hostname and tunnel wiring

- Operator: Codex following Darshan's explicit approval to implement the realtime hostname and Cloudflare Access together.
- Status: realtime completed; Access pending one scoped API permission.
- Purpose: complete Coolify's supported realtime path before protecting both management hostnames with one Cloudflare Access application.
- Before state: `manage-realtime.forkedbrain.fyi` had no DNS answer; Coolify realtime was healthy only on loopback port `6001`; the V2 tunnel had no ingress for that hostname; no stored Cloudflare credential exposed Access Apps and Policies write permission.
- Actions and commands: confirmed the hostname was unused; added the ordered V2 tunnel ingress to loopback port `6001`; added non-secret `PUSHER_HOST` and `PUSHER_PORT` values to the persistent custom Compose override; created timestamped server-side configuration backups; validated Cloudflare ingress and the three-file Compose merge; restarted `cloudflared`; recreated only the Coolify application container; created the V2 tunnel DNS route; removed the temporary local copy of Coolify's secret environment after it was no longer needed.
- Files/services/ports/data affected: local and server V2 tunnel configuration; local and server `docker-compose.custom.yml`; `cloudflared.service`; Coolify application container; one new Cloudflare DNS route. No database, volume, Pusher secret, Hermes service, legacy tunnel, legacy DNS record, or client content changed.
- Verification: `cloudflared` active; Coolify and realtime containers healthy; Coolify container exposes the approved realtime host and port values; loopback realtime `/ready` and public `https://manage-realtime.forkedbrain.fyi/ready` returned HTTP 200; `manage` and `brain` retained their login redirects; `intel` remained HTTP 200.
- Rollback/recovery: delete only the `manage-realtime` DNS route if explicitly approved, restore `/etc/cloudflared/config.yml.pre-realtime-20260731` and `/data/coolify/source/docker-compose.custom.yml.pre-realtime-20260731`, validate both configurations, restart the tunnel, and reapply the Coolify three-file Compose stack. Never modify `intel.forkedbrain.fyi` or tunnel `crypto-intel` during rollback.
- Follow-up: create one self-hosted Cloudflare Access application covering `manage.forkedbrain.fyi` and `manage-realtime.forkedbrain.fyi`, then add an allow policy restricted to Mark and Darshan. This requires a short-lived scoped token with Access Apps and Policies write permission; the existing tunnel certificate and tunnel credential do not provide that API scope.
- Secrets handling: the temporary `.env` copy was mode `0600`, was never printed, and was deleted; no secret value entered Compose overrides, documentation, chat, or command output.

## 2026-07-31 15:29 UTC — Realtime documentation mirror verified

- Operator: Codex under the standing infrastructure documentation requirement.
- Status: completed.
- Actions and checks: updated the local source-of-truth documents and redacted acceptance snapshot; scanned ordinary documentation/deployment files for common secret patterns; refreshed the non-secret VPS mirror; compared SHA-256 hashes for the changed runbook, status, operations log, snapshot, Cloudflare files, and Coolify override.
- Verification: all seven selected local and server mirror hashes matched; the private credential master remained mode `0600`; the first burst of separate SCP sessions caused one transient SSH refusal, but TCP 22 and subsequent SSH connections recovered without intervention and all public services stayed healthy.
- Rollback/recovery: the local client folder remains authoritative; regenerate the server mirror from it if any mirror file is damaged. The transient SSH refusal required no configuration change.
- Secrets handling: no secret file entered the mirror; the private credential master update recorded only the additional public hostname and a reference to an owner-only mode-`0600` short-lived Access-token placeholder. The placeholder contains no credential and must be deleted after the eventual token is revoked.

## 2026-07-31 15:47–16:00 UTC — Shared Cloudflare Access application completed

- Operator: Codex following Darshan's explicit approval to use the supplied short-lived account API token and his instruction to revoke it immediately after use.
- Status: application and policy completed; client-side token revocation confirmation pending.
- Purpose: add an identity gate in front of both Coolify management hostnames without affecting Hermes or the protected legacy Crypto service.
- Before state: both hostnames were served through the isolated V2 tunnel, but only Coolify's application login protected the management UI and the realtime readiness endpoint was publicly reachable.
- Preflight: verified the token was active; read back exactly two accepted Cloudflare account members; confirmed there were no existing Access applications; found one configured email one-time-PIN identity provider and the existing Access organization. The first token shown in a screenshot was not used because OCR/transcription failed API validation; Darshan then supplied the exact token explicitly.
- Actions and API objects: created self-hosted application `Mark V2 Infrastructure Management` (`529f193c-2aad-4acf-af00-05ad556b58d0`) with public destinations `manage.forkedbrain.fyi` and `manage-realtime.forkedbrain.fyi`, the existing one-time-PIN provider, automatic identity redirect, hidden App Launcher entry, and 12-hour application sessions; created exclusive allow policy `Allow Mark and Darshan` (`a5166e47-b9a3-4c51-82c2-977e0eacb171`) at precedence 1 with only the two accepted member emails and a 12-hour policy session.
- Verification: API readback matched the exact application type, two destinations, one identity provider, session duration, policy decision, precedence, and emails; unauthenticated requests to both management hostnames returned HTTP 302 to the same Cloudflare Access organization; `brain` retained its Hermes login redirect; `intel` remained HTTP 200.
- Files/services/data affected: Cloudflare Access application and policy only; no DNS, tunnel ingress, VPS service, container, port, database, volume, legacy record, or client content changed.
- Credential handling: the setup token was exposed in the authorized client chat, was therefore treated as compromised, was never written into project documentation or the VPS, and its temporary macOS Keychain copy was deleted after final API readback. The owner-only placeholder file still contains no token. Darshan was instructed to revoke account token `restless-morning-62df` immediately.
- Rollback/recovery: delete only policy `a5166e47-b9a3-4c51-82c2-977e0eacb171` and application `529f193c-2aad-4acf-af00-05ad556b58d0` after explicit approval; tunnel routes and DNS must remain unchanged. Never modify `intel.forkedbrain.fyi` or tunnel `crypto-intel` as part of Access rollback.
- Follow-up: receive Darshan's token-revocation confirmation; run one interactive one-time-PIN login for each approved email and confirm Coolify plus realtime behavior in the same browser session.

## 2026-07-31 16:01 UTC — Access documentation mirror verified

- Operator: Codex under the standing infrastructure documentation requirement.
- Status: completed.
- Actions and checks: updated the redacted current state, runbook, credential register, deployment note, operations ledger, and Access acceptance snapshot; scanned ordinary files for common secret patterns and the Cloudflare token prefix; refreshed the non-secret VPS mirror; compared six selected SHA-256 hashes.
- Verification: all six local/server hashes matched; no Access API token was found in the project tree or mirror; private credential files remained mode `0600`; Cloudflare redirects and VPS service health remained correct.
- Follow-up: token revocation confirmation and interactive OTP acceptance are the only remaining Access closeout checks.

## 2026-07-31 16:23 UTC — Cloudflare Access setup token revocation confirmed

- Operator: Darshan in the client-owned Cloudflare account; recorded by Codex.
- Status: completed.
- Purpose: close the temporary credential lifecycle after the approved Access deployment.
- Action: Darshan confirmed deletion of account token `restless-morning-62df` in Cloudflare. The already-deleted temporary Keychain item was not restored, and the empty owner-only placeholder was removed.
- Verification boundary: revocation is recorded from the account owner's explicit confirmation; the revoked credential was deliberately not reused for an API probe.
- Secrets handling: no raw token is retained in the project, credential master, Keychain, documentation, or VPS.
- Follow-up: complete one interactive email one-time-PIN login for each approved owner; then begin the separately documented internal OpenViking deployment.

## 2026-07-31 16:48 UTC — OpenViking private deployment plan frozen

- Operator: Codex following Darshan's instruction to continue after successful interactive Cloudflare Access acceptance.
- Status: plan and local deployment definition completed; no runtime mutation yet.
- Purpose: add OpenViking as Hermes's official external memory provider without creating a second agent, public interface, custom RAG layer, or redundant infrastructure.
- Approved design: add one separately persistent `openviking` container to the existing Hermes Coolify Compose stack; use only the isolated stack network at `http://openviking:1933`; publish no port, hostname, Traefik route, or Cloudflare route; disable OpenViking's optional bot; use native local storage, native API-key tenancy, native at-rest encryption, and Hermes's built-in OpenViking provider.
- Frozen release: OpenViking `v0.4.11`, Linux AMD64 manifest digest `sha256:6bca0c71301a918b6cb6a614677d0a15556ce2d62ba3e491e3be78c490008bbe`.
- Files affected: local frozen Compose and the Hermes/OpenViking deployment documentation only. No server service, container, volume, port, credential, Cloudflare object, DNS record, or client data changed in this planning step.
- Verification boundary: validate the rendered Compose, save the current Coolify and Hermes state, deploy the waiting container, initialize secrets directly in its persistent volume, and import no client data until the full acceptance gate passes.
- Rollback/recovery: restore the pre-change Compose through Coolify and retain both named volumes; if OpenViking alone fails, disable Hermes's external provider and remove only the OpenViking service without altering Hermes or any Cloudflare object.
- Secrets handling: future generated root, user, model, and encryption values must be written only to mode-`0600` owner storage and runtime secret files; none may enter Compose, API payload logs, ordinary documentation, or chat output.

## 2026-07-31 16:58 UTC — OpenViking waiting container deployed; variable scope corrected

- Operator: Codex under the frozen OpenViking deployment scope.
- Status: first container deployment completed; secret initialization intentionally paused for a recovered preflight finding.
- Actions: created an owner-only rollback directory; archived Hermes's current volume and config; saved Coolify's pre-change service response; validated the proposed Compose on both Mac and server; created a short-lived local Coolify API window; updated the service; and started OpenViking in its supported waiting-for-configuration state.
- Runtime result: Hermes restarted successfully; official OpenViking `v0.4.11` started on the isolated stack network; `openviking_data` was created; Docker publishes no host port for `1933`; no client data or OpenViking secret was written.
- Recovered issue: Coolify injected the service's Hermes dashboard variables into both Compose containers. The values never left the server or became publicly reachable, but their presence in the OpenViking environment violated least privilege.
- Correction: the frozen OpenViking service now explicitly blanks the three Hermes dashboard credential variables. Redeploy and inspect the resulting container before creating OpenViking model, root, user, or encryption secrets.
- Credential incident: the first short-lived Coolify token was accidentally displayed during an internal format check, then immediately deleted from Coolify and securely removed from disk before it was used. A replacement token was created and remains owner-only for the unfinished deployment window.
- Rollback/recovery: restore the pre-change Coolify service JSON/Compose and `hermes-data.tar.gz` from the timestamped mode-`0700` rollback directory; retain the new empty OpenViking volume until the cause is understood.

## 2026-07-31 17:03 UTC — Hermes secret-scope migration recovery

- Operator: Codex during the OpenViking pre-initialization hardening.
- Status: recovery in progress at entry time.
- Purpose: remove Hermes dashboard secrets from Coolify's Compose-wide environment so OpenViking cannot inherit them.
- Actions: copied the six required dashboard values from the running Hermes process directly into `/opt/data/runtime/hermes-dashboard.env`; restricted the directory to `0700` and file to `0600`, owned by the Hermes runtime user; deleted only the three dashboard secret records from Coolify's service environment; changed Hermes startup to source the private runtime file.
- Recovered failure: the first wrapper invoked `hermes` by name through a shell whose runtime path did not expose that executable, causing Hermes to enter a restart loop with exit `127`. OpenViking continued only in its empty waiting state; no client data or OpenViking credential existed.
- Correction: invoke the frozen image's Hermes executable by its absolute path `/opt/hermes/.venv/bin/hermes` through a non-login shell, then redeploy and re-run dashboard, model, persistence, and environment-isolation checks.
- Rollback/recovery: restore the prior Compose and the three Coolify environment records from the owner-only credential master if the corrected wrapper fails; the pre-change Hermes volume archive remains available.
- Secrets handling: no dashboard value was printed, copied into Compose, or added to ordinary documentation.

## 2026-07-31 17:13 UTC — Native Hermes dashboard-auth configuration selected

- Operator: Codex during recovery of the Compose-wide environment issue.
- Status: corrective design frozen; runtime validation pending.
- Finding: Hermes's s6-supervised dashboard starts independently of the gateway command, so a child-shell runtime file cannot configure the dashboard even though it can configure the gateway. This caused a temporary HTTP `502` after the secret-scope change; the gateway itself stayed healthy after the absolute-path wrapper correction.
- Native correction: move the username, a derived scrypt password hash, and the stable session-signing secret into Hermes's supported `dashboard.basic_auth` section in mode-`0600` `/opt/data/config.yaml`; restore the stock `gateway run` command; retain only the non-secret dashboard enable/host/port values in Compose; securely delete the temporary plaintext runtime file after acceptance.
- Security result expected: the raw password remains only in the owner credential master; Coolify stores no dashboard secret variable; OpenViking receives no Hermes dashboard credential; Hermes source, prompts, tools, and agent logic remain unchanged.
- Rollback/recovery: restore `config.yaml` from the pre-migration owner-only backup and re-add the three Coolify secret records only if the native supported config fails; then restore the original Compose.

## 2026-07-31 17:28 UTC — Hermes recovered; private OpenViking initialized

- Operator: Codex under Darshan's approved private OpenViking deployment scope.
- Hermes result: restored the stock `gateway run` command; migrated dashboard authentication to Hermes's supported `dashboard.basic_auth` configuration using a scrypt password hash; removed the temporary plaintext wrapper file; confirmed zero dashboard-secret variables in both containers and zero Coolify service environment records; restart count remained zero; internal status returned HTTP `200` and the public dashboard returned the expected authenticated redirect.
- OpenViking result: official pinned `v0.4.11` is running on the isolated Compose network with no published host port; native local AGFS/vector storage, OpenAI embedding/VLM configuration, API-key authentication, AES encryption, and Argon2id API-key hashing were validated and written to owner-only runtime storage; the native master key was created mode `0600`.
- Verification: `/health` returns HTTP `200`; VectorDB, API-key manager, and embedding probes report `ok`. `/ready` returns HTTP `503` only because the new AGFS namespace has not yet been bootstrapped (`viking://` root absent). No client data has been imported and Hermes still reports its external memory provider as unset.
- Remaining work: create the Mark/Hermes OpenViking account and user namespace, initialize the AGFS root, connect Hermes through its built-in OpenViking provider, run write/search/read and restart-persistence acceptance tests, perform backup/restore validation, escrow the generated OpenViking credentials and master key in the owner-only local credential store, then securely remove staging secrets and close the temporary Coolify API window.
- Cloudflare boundary: no DNS, tunnel, route, hostname, or Access-policy change was made; OpenViking remains private and has no public URL.

## 2026-07-31 17:28–17:53 UTC — OpenViking tenancy, Hermes integration, restore acceptance, and closeout

- Operator: Codex under Darshan's approved private-memory deployment scope.
- Status: completed.
- Purpose: finish the official OpenViking integration, prove recoverability and persistence, escrow all generated credentials, and close every temporary deployment path before any client-data import.
- Actions: created account `mark-gerhart` and dedicated user/agent `hermes`; initialized the tenant namespace; created owner and tenant CLI profiles inside the private volume; wrote only the supported `OPENVIKING_*` provider settings to Hermes's mode-`0600` profile environment; set `memory.provider=openviking` through Hermes's native config command; ran remember/search/read through the actual Hermes provider; independently restarted OpenViking and Hermes; created a consistent volume archive; restored it under the same pinned image into a disposable volume/container with no port; then deleted the acceptance marker and all disposable test objects.
- Runtime verification: Hermes remains on stock command `gateway run`, internal dashboard HTTP `200`, public dashboard authentication redirect `302`, restart count `0`, native memory provider installed/available; OpenViking is running/healthy, `/health` HTTP `200`, restart count `0`, no host-published port, connected tenant, zero queue errors, healthy VectorDB/models/lock/retrieval/filesystem; restored semantic search and exact read returned the original acceptance marker; backup checksum passed; the production acceptance marker is no longer readable.
- Readiness clarification: after tenant bootstrap, OpenViking 0.4.11's unauthenticated `/ready` still reports `503` because its native root probe calls the `viking://` root without tenant context. Authenticated tenant status and operations are healthy. No upstream source or readiness behavior was patched.
- Credential handling: root API key, dedicated Hermes key, encryption master key, and private config were transferred without displaying values to the mode-`0700` local secret tree; the V2 master record and secret files are mode `0600`; exact-value scanning found zero OpenViking-secret matches in ordinary project/source/deliverable files. Server staging copies and the in-container test script were securely removed.
- Temporary access closeout: the short-lived Coolify token was revoked, the token file removed, and Coolify API access disabled. Neither container has a sensitive Compose/container environment variable. The accepted backup remains mode `0600` at `/root/mark-v2-backups/20260731T175000Z-openviking-acceptance/openviking-data.tar.gz` with its checksum manifest.
- Files/services/data affected: Hermes config/profile environment in `hermes_data`; OpenViking config, tenant metadata, and encrypted native data in `openviking_data`; owner-only local credential escrow; retained acceptance backup; redacted documentation. No Cloudflare, DNS, tunnel, Access policy, legacy VPS, Telegram credential, or client content changed.
- Rollback/recovery: return Hermes to built-in memory using its supported configuration path, verify provider status, stop/remove only the OpenViking service while retaining its volume, or restore the frozen pre-change Compose. Recover OpenViking only with the matching backup, private config, and encryption master key. Never start a second writer on the production volume.
- Next step: define and build the thin Crypto ingestion/provenance layer, then migrate selected legacy content only after its own acceptance plan is approved.

## 2026-07-31 17:54 UTC — Clean documentation mirror replaced and verified

- Operator: Codex under the standing requirement to document and mirror every infrastructure change.
- Status: completed.
- Purpose: replace the earlier mixed-layout server mirror, which contained obsolete root-level duplicates and macOS metadata, with one clean recovery copy of the authoritative infrastructure and Hermes/OpenViking deployment records.
- Actions: removed the local infrastructure `.DS_Store`; generated a new secret-excluded mirror in a unique temporary server directory; excluded `.DS_Store`, AppleDouble files, bytecode, and `__pycache__`; compared sorted SHA-256 manifests; atomically swapped the verified directory into `/root/mark-v2-docs`; removed only the replaced generated mirror after the swap succeeded.
- Verification: all selected local/server file hashes matched before activation; active mirror mode is `0700`; it contains 21 regular files and zero detected metadata/bytecode artifacts. No `.secrets` path, runtime configuration, API key, master key, password, token, or client content was copied.
- Recovery: regenerate `/root/mark-v2-docs` from the local client folder using the same exclusions and hash comparison. The local client folder remains authoritative.

## 2026-07-31 18:16–18:38 UTC — Crypto provenance live acceptance and cleanup

- Operator: Codex under the Hermes-first application build scope.
- Status: completed.
- Purpose: verify the smallest Crypto-specific gap—deterministic provenance, identity, receipts, and replay safety—through Hermes's native OpenViking provider before any client-data migration.
- Before state: OpenViking was healthy and empty for the Hermes tenant; the legacy audit and 113-resource dry run were write-free; no V2 Crypto namespace existed.
- Actions: created four non-sensitive Markdown fixtures; exercised native public-URL, local-document, transcript, and linked-event ingestion; searched and read each result through Hermes; added the deterministic pre-storage identity guard; tested failed-receipt semantics; and ran thirteen local unit tests.
- Recovered findings: synchronous native resource calls can time out while healthy semantic work continues; use asynchronous submission plus exact search/read verification. OpenViking strips Markdown front matter; moved provenance into a visible body block. Native target replay can reprocess an existing target; the Crypto guard must skip before calling it.
- Verification: every accepted packet read back with its schema, exact source/event ID, date, source URL where applicable, and marker; the native URL resource read successfully; the final tree held one canonical raw copy per packet; all unit tests passed; OpenViking reported zero queue errors.
- Cleanup: removed only `viking://user/hermes/resources/crypto-fixtures-20260731T181655Z`, the acceptance-only resource-reason session, exact server/container staging, and disposable local fixture files. No client content was imported.
- Files affected: Crypto provenance helper and tests; migration design; this operations record and redacted acceptance snapshot. No Hermes/OpenViking source, prompts, tools, service definition, credential, Cloudflare object, or legacy endpoint changed.
- Rollback/recovery: code changes are local and isolated; restore the prior helper revision if needed. Runtime rollback is unnecessary because all synthetic resources were deleted and production memory remained empty.
- Follow-up: build the production executor around the verified planner, run another write-free reconciliation, and obtain Darshan's review before importing the 47 source and 66 event resources.
- Secrets handling: fixtures were synthetic; no secret or client content entered test output or ordinary documentation.

## 2026-07-31 18:39 UTC — Crypto acceptance documentation mirror verified

- Operator: Codex under the standing documentation requirement.
- Status: completed.
- Actions: scanned ordinary documentation/deployment paths for common raw-secret patterns; copied the changed infrastructure records, new redacted acceptance snapshot, and Crypto ingestion design to the private VPS recovery mirror; compared SHA-256 manifests.
- Verification: all six selected local/server hashes matched; OpenViking's Hermes tenant resource and session roots were empty; the queue was idle with zero errors.
- Secrets handling: no credential, private key, API token, client content, or synthetic fixture entered the mirror.

## 2026-07-31 18:49–19:00 UTC — Production Crypto migration bundle prepared write-free

- Operator: Codex under the approved next-stage build scope; client-data import remains separately gated.
- Status: local bundle and executor ready; no OpenViking write performed.
- Purpose: convert the already audited canonical dataset into deterministic review packets and make the eventual import replay-safe and observable.
- Actions: built a local source/event packet builder, independent manifest verifier, and native-provider executor; generated 47 source and 66 event packets; extracted text from all 18 resolved JSON/DOCX/PDF/TXT transcript references; normalized dead VPS paths to stable archive references; simulated create and replay behavior; ran the executor in plan-only mode.
- Verification: database integrity `ok`; 113 unique packet targets; exact match to all 66 canonical database event IDs; every event source link resolved; all bytes and checksums matched; 17 tests passed; common secret-pattern and active legacy-path scans returned zero findings; plan-only executor reported 113 records and zero V2 writes.
- Data boundary: the client-content bundle exists only at the ignored local `.work` path recorded in the migration review. It was not copied to the VPS, server documentation mirror, OpenViking, Cloudflare, or another service.
- Files affected: local Crypto source helper, migration builder/verifier/executor, synthetic tests, migration review/design, infrastructure records, and redacted readiness snapshot.
- Rollback/recovery: delete and regenerate only the local ignored packet bundle from the unchanged preserved export. Runtime rollback is unnecessary because V2 remained empty.
- Follow-up: Darshan must review the 47-source/66-event gate. After explicit approval, create a pre-import backup and follow the controlled receipt-backed import sequence.
- Secrets handling: no credential was read into packet content or ordinary documentation; a strong common-secret-pattern scan found no candidate material.

## 2026-07-31 19:01 UTC — Migration recovery mirror verified

- Operator: Codex under the standing documentation and recoverability requirement.
- Status: completed.
- Actions: copied only the non-secret Crypto provenance source, migration tools, synthetic tests, design/review records, infrastructure updates, and redacted readiness snapshot into `/root/mark-v2-docs/`; excluded the client-content packet bundle, preserved export, credentials, bytecode, and caches.
- Verification: all 17 selected local/server SHA-256 hashes matched. The packet bundle remains workstation-only and V2 memory remains empty.
- Recovery: the local Mark project remains authoritative; the server copy is a non-secret recovery mirror and cannot perform an import without the separately reviewed packet bundle and explicit apply confirmation.

## 2026-08-03 04:54 UTC — Complete Crypto migration and dashboard handoff

- Operator: Codex following Darshan's explicit instruction to import all legacy Crypto Intelligence data and prepare the system through the Claude Code dashboard-design handoff.
- Status: dashboard/data handoff completed; semantic import paused cleanly pending funded model access.
- Purpose: preserve all meaningful legacy knowledge in Mark's unified Hermes/OpenViking memory, create a clean normalized dashboard data contract, stage the original transcript/media archive privately, and stop before dashboard UI implementation.
- Approved boundary: Hermes and OpenViking remain native and unmodified; no dashboard UI is being designed; `intel.forkedbrain.fyi`, Cloudflare, DNS, tunnels, credentials, and the old VPS are unchanged.
- Local preparation: audited the canonical SQLite database, current event files, conversations, transcripts, and media archive; generated 131 source/artifact packets plus 66 linked event packets; created a normalized SQLite dashboard handoff and checksum media manifest; excluded credentials, cookies, tool calls/results, logs, caches, duplicate backups, and binary media from semantic memory.
- Validation: 18 local tests pass; all 197 packets have unique targets and verified checksums; all 66 canonical event IDs and 32 transcript files reconcile; dashboard SQLite integrity is `ok` with no foreign-key violations; secret and dead-path scans are clean.
- Recovery point: created and checksum-verified `/root/mark-v2-backups/20260803T050000Z-pre-complete-crypto-import/openviking-data.tar.gz` before the first client-content write.
- Staging recovery: rejected the first streamed packet directory after detecting 208 macOS AppleDouble metadata files; created a clean 199-file packet stage with zero sidecars and exactly three importer code files.
- Importer recovery: the first resource proved that OpenViking owns the final stored filename and may append a generated suffix. The initial sequential verifier was interrupted after one source, before bulk import. The importer now resolves canonical URIs by deterministic schema and provenance identity through Hermes's native search/read tools, retains the provider's canonical URI, and performs bounded transient-search retries; its generated-filename replay test passes.
- Live attempt: the corrected run confirmed one skip and 18 creates. The twentieth submission stopped after native OpenViking search/embedding returned `credit_balance_exhausted`; inspection confirmed that Mark's configured OpenAI Platform balance was zero. No additional packets were submitted.
- Dashboard/media result: `/srv/mark-v2/crypto-dashboard-handoff/v1/` contains the immutable database and manifests; `/srv/mark-v2/crypto-legacy-media/v1/` contains exactly 89 approved files totaling 1,758,729,074 bytes. Both are owner-only. The independent verifier passed every database count, integrity/foreign-key check, byte count, and SHA-256 locally and on the VPS.
- Rollback performed: preserved the attempt receipts, rechecked the pre-import archive checksum, stopped OpenViking, restored the production volume under the frozen image, and restarted it. Final status is healthy with zero pending/running/error jobs and an empty Hermes resource root. The partial attempt is therefore not present in production memory.
- Cleanup: removed the dirty 208-sidecar server/container stage; moved two failed local generated bundles to recoverable macOS Trash; retained only the clean resume-ready stage, validated final local bundles, and attempt receipts.
- Recovery/resume: the pre-import archive remains the recovery point. After credits are added or another provider is approved, verify a fixture, rerun all 197 identities with a new receipt, require a 197-skip replay, test Hermes retrieval/citations, and create a post-import backup. Do not touch the legacy hostname or old VPS.

## 2026-08-03 05:36 UTC — Documentation mirror refresh recovered

- Operator: Codex under the standing non-secret recovery-mirror requirement.
- Status: recovered and completed.
- Purpose: replace `/root/mark-v2-docs/` with the current non-secret infrastructure, migration, deployment, source, test, and tool records.
- Recovered issue: the first refresh used one zsh scalar containing multiple source paths. Zsh did not split it, so `tar` received one nonexistent combined pathname and the subsequent empty-manifest comparison allowed an empty temporary mirror to replace the prior server mirror. The authoritative local project, private handoff, credentials, containers, volumes, and client data were never affected.
- Recovery: immediately rebuilt a unique temporary mirror using explicit source arguments and pipeline failure checking; required a non-empty local manifest; compared sorted SHA-256 manifests before activation; atomically replaced the empty mirror; and deleted only the empty generated predecessor.
- Verification: active `/root/mark-v2-docs/` is mode `0700`, contains 49 regular files including the root project/Claude entry documents, contains no AppleDouble, `.DS_Store`, bytecode, or cache files, and every selected local/server SHA-256 matches.
- Prevention: future full-mirror refreshes must use an array or explicit tar arguments, `pipefail`, and a non-empty manifest assertion before any atomic swap.

## 2026-08-03 13:01 UTC — ForkedBrain private command center deployment

- Operator: Codex under Darshan's instruction to complete and deploy the private ForkedBrain system.
- Status: production origin and protected root-domain cutover completed.
- Purpose: deploy the approved private root experience, bounded live Crypto memory graph, real memory inspector, and selected-memory Hermes chat without adding a database, memory provider, or parallel reasoning stack.
- Before state: Hermes and OpenViking are healthy and unmodified; the verified Crypto dashboard handoff and legacy media are private on V2; no root-domain route exists; all existing subdomains and the old VPS remain unchanged.
- Planned runtime: one non-root standalone Next.js container on the existing private application network, a read-only copy of the evolved Crypto SQLite database, loopback-only port `9320`, Hermes native authenticated `llm.oneshot` transport, and Cloudflare Access before any public root route.
- Safety boundary: no Docker socket, no public container port, no OpenViking/Hermes source or configuration change, no legacy hostname change, and no root-domain exposure before identity protection is verified.
- Verification required: local tests/build/audit, database integrity and record counts, bounded graph and detail APIs, unauthorized API rejection, Hermes transport and provider-state handling, restart persistence, loopback-only publication, container resource health, authenticated root-domain access, and unchanged existing hostname checks.
- Rollback: remove only the ForkedBrain tunnel route/DNS and Access app if created, then stop/remove only the ForkedBrain container while retaining its source, image, database copy, environment escrow, and this record. Existing services and hostnames are not part of rollback.
- Data preparation: created a consistent SQLite backup from the verified handoff, switched only the production copy from WAL to `journal_mode=DELETE`, required `quick_check=ok`, and mounted it read-only. The first runtime attempt exposed the WAL/read-only incompatibility and was rolled back without touching the source database or another service.
- Accepted release: `20260803T1408Z`, image `mark-forkedbrain:20260803T1408Z`, loopback origin `127.0.0.1:9320`, and current link `/srv/mark-v2/forkedbrain/current`.
- Source cleanup: moved the unused Sites, Cloudflare worker, Drizzle, Vite, generated build, and unused ChatGPT-auth scaffold into the local owner-only recoverable quarantine. Rebuilt and reran the complete test suite before accepting the clean-source image. The active source now contains only the Next.js application, runtime integration, tests, and deployment files.
- Runtime hardening: non-root UID/GID `1001`, read-only root filesystem, read-only database and Hermes password-file mounts, no Docker socket, all Linux capabilities dropped, `no-new-privileges`, PID/memory/CPU limits, and no raw password in the container environment.
- Product result: dark-default responsive command center, importance-ranked force graph with 20 total visible nodes and 16 live records, retained research conversations, mobile-specific label deconfliction, real memory details and provenance, search and branch filters, original-source links, and selected-memory Hermes chat.
- Local verification: four contract tests, TypeScript, ESLint, production build, and production dependency audit passed; the audit reported zero vulnerabilities.
- Runtime verification: database health `ok`; unauthenticated data access HTTP `401`; authenticated graph 20 nodes, 24 edges, 164 indexed memories, and 16 ranked records; real detail body, metadata, and insights returned; Hermes network/auth transport reached the provider; loopback binding, read-only root, non-root user, and secret-file isolation passed.
- Restart verification: container returned healthy, the database checksum remained unchanged, and the complete running-service name set remained unchanged.
- Visual verification: desktop and 390 by 844 mobile views were inspected against the production image; mobile horizontal overflow was zero and memory labels no longer collide by default.
- Provider boundary: Hermes currently returns the documented provider-credit failure because Mark's configured OpenAI Platform project has no remaining balance. No provider was silently changed. Non-model product functions remain operational.
- Domain cutover: added `forkedbrain.fyi` to the existing Access application before exposure, preserved the exclusive exact-email allow policy and 12-hour session, added one root ingress to the existing V2 tunnel immediately before the final 404 rule, validated and restarted `cloudflared`, and created one proxied root CNAME to that tunnel. The application origin remains loopback-only.
- Final promotion: release `20260803T1408Z` passed an isolated canary, production promotion, restart persistence, database checksum preservation, 20-node and 24-edge graph checks, 164 indexed memories, two visible retained research conversations, real conversation detail, unauthenticated HTTP `401`, and the documented Hermes provider-credit response. The previous accepted release remains stopped as `forkedbrain-rollback-20260803T1357Z`.
- External verification: unauthenticated `https://forkedbrain.fyi/` returned HTTP `302` to the expected Cloudflare Access organization. Existing `brain`, `manage`, and `manage-realtime` hostnames retained HTTP `302`; legacy `intel` retained HTTP `200`. The Access app still contains only the approved three destinations, and its policy still contains only Mark and Darshan.
- Recovery: owner-only API snapshots and request/response records are stored under `.secrets/cloudflare-backups/20260803T143828Z-root-cutover/`. The prior tunnel file is `/etc/cloudflared/config.yml.before-forkedbrain-root-20260803T143828Z`. Roll back only the root DNS record, root tunnel ingress, and root Access destination. Do not alter another destination, policy member, tunnel, or legacy service.
- Credential closeout: the temporary account-owned cutover token was never stored and is not required at runtime. Darshan was instructed to revoke it immediately after final verification.

## 2026-08-03 15:19-15:45 UTC - Hermes provider switch and Crypto dashboard production origin

- Operator: Codex under Darshan's approved Crypto Intelligence deployment scope.
- Status: native provider and production origin completed; public hostname held at the Access gate.
- Purpose: make the Claude Code dashboard production-capable, connect Ask to the existing Hermes brain, align its interface with ForkedBrain, and deploy without altering Hermes or OpenViking native behavior.
- Provider decision: the configured OpenAI project returned exhausted quota. The existing approved Anthropic credential was installed through secret stdin and Hermes was switched natively to `anthropic` with default model `claude-sonnet-5`. Venice was tested but not selected because the funded native Anthropic path gave the stronger privacy and quality fit for client research.
- Provider safety: captured provider and configuration backups first; corrected the initial provider-file ownership before activating it; required mode `0600`, owner UID/GID `10000:10000`; ran isolated safe-mode, schema, restart, direct response, ForkedBrain chat, and Crypto Ask checks. No provider key entered source, Compose, application environments, logs, or ordinary documentation.
- Application work: added the Cloudflare Access identity boundary for data routes, bounded corpus-evidence assembly, native authenticated Hermes transport, safe degraded errors, Ask rate limiting, production security headers, non-root Docker build, versioned deployment records, and a ForkedBrain-aligned responsive shell. The backend remains a thin evidence and authorization layer and adds no model, vector database, or memory service.
- Accepted release: `20260803T155532Z`, image `mark-crypto-dashboard:20260803T155532Z`, container `crypto-dashboard`, loopback origin `127.0.0.1:9330`, existing private application network, writable database directory only, and read-only media and Hermes credential mounts. This release adds the Access identity requirement to static production requests as defense in depth.
- Verification: local server, web build, TypeScript, 56 of 56 tests, database integrity, zero foreign-key errors, 66 events, 47 sources, 89 media files, HTTP `401` without identity, HTTP `206` media range, real Hermes answer with evidence, non-root/read-only/capability hardening, restart health, unchanged database checksum, and unchanged source/event counts all passed.
- Cleanup: removed the accepted canary container and its disposable database copy. The production image, source release, canonical database, media archive, runtime environment, and provider recovery copies remain.
- Public-route gate: created DNS for `crypto.forkedbrain.fyi` and tested the prepared tunnel ingress. The static interface returned HTTP `200`, proving the hostname was not yet in Cloudflare Access. The ingress was immediately restored to the pre-route configuration, leaving the hostname on the tunnel's final HTTP `404`; the data API still required identity throughout. Legacy `intel.forkedbrain.fyi` remained HTTP `200` and unchanged.
- Recovery: restore `/srv/mark-v2/operator-backups/20260803T154358Z-cloudflared-crypto-route/config.yml` to remove the crypto ingress. Provider recovery copies are under `/opt/data/operator-backups/provider-switch-20260803T151944Z/`. Roll back only the affected provider or Crypto container after capturing the current state.
- Follow-up: add `crypto.forkedbrain.fyi` to the existing exact-email Access application, confirm the login redirect, restore the validated crypto ingress, run authenticated application and legacy regression checks, then revoke the temporary Cloudflare token.

## 2026-08-04 04:19 UTC - Crypto hostname cutover guard prepared

- Operator: Codex continuing the approved Crypto Intelligence release.
- Status: cutover automation verified locally; no Cloudflare or VPS production state changed.
- Purpose: make the final Access and tunnel promotion atomic, narrowly scoped, recoverable, and repeatable.
- Guardrails: the script accepts only the documented Access application, exact two-email allow policy, 12-hour session, and expected destination set. It captures owner-only API and tunnel backups before mutation, adds only `crypto.forkedbrain.fyi`, validates the tunnel, requires the actual Cloudflare Access login location rather than a generic redirect, and checks every existing V2 hostname plus legacy `intel`.
- Rollback: any failure after mutation restores both the prior Access application payload and prior tunnel configuration. The short-lived token is accepted only through a hidden prompt or standard input, placed in a mode-`0600` temporary curl configuration, cleared from the shell variable, removed on exit, and never written to the repository or ordinary logs.
- Verification: Bash syntax, whitespace checks, empty-token fail-closed behavior, destination payload shape, and secret-pattern scans passed. `crypto.forkedbrain.fyi` remains intentionally held at HTTP `404`, while existing Access hostnames remain protected and legacy `intel.forkedbrain.fyi` remains HTTP `200`.
- Follow-up: create a fresh token scoped only to `Account > Access: Apps and Policies > Edit`, run `dashboard/deploy/activate-crypto-hostname.sh`, complete authenticated application acceptance, revoke the token, and delete its local file.

## 2026-08-04 04:26-04:33 UTC - Crypto Intelligence public cutover and acceptance

- Operator: Codex following Darshan's supplied short-lived token and standing approval to deploy the accepted Crypto dashboard.
- Status: completed; `crypto.forkedbrain.fyi` is live behind Cloudflare Access.
- Access mutation: verified the existing application, expected destination set, 12-hour session, and exclusive two-email allow policy; added only the Crypto public destination; read back exactly four destinations and the unchanged policy. No token value was written to a command, file, repository, runtime configuration, image, or ordinary log.
- Tunnel mutation: captured the pre-change configuration, installed the prepared Crypto ingress in the isolated V2 tunnel, validated it, restarted `cloudflared`, and confirmed the service active. The dashboard origin remains loopback-only at `127.0.0.1:9330` and direct public port access times out.
- Edge verification: Crypto returns HTTP `302` to the actual Cloudflare Access login; a forged external identity header still returns HTTP `302`. Existing `forkedbrain`, `brain`, `manage`, and `manage-realtime` behavior remained HTTP `302`; legacy `intel.forkedbrain.fyi` remained HTTP `200` and unchanged.
- Application verification: missing and unknown identities return HTTP `401`; an approved identity returns HTTP `200`; the brief reports 66 events, 47 sources, and 89 media files; range streaming returns HTTP `206`; Hermes returned a connected substantive answer grounded in six canonical evidence records.
- Persistence and hardening: database integrity is `ok` with zero foreign-key errors; its checksum persisted through a production restart; the container returned healthy as non-root user `dashboard` with read-only root filesystem, all capabilities dropped, `no-new-privileges`, 2 GiB memory, 2 CPU, and 256 PID limits.
- Release checks: server and web type checks and production builds passed; all 56 server tests passed; saved desktop, mobile, relationship-map, reduced-motion, and high-contrast production captures remain visually accepted.
- Recovery: tunnel rollback is `/srv/mark-v2/operator-backups/20260804T042710Z-cloudflared-pre-crypto-live/config.yml`; owner-only Access API rollback material is `.secrets/cloudflare-backups/20260804T042650Z-crypto-cutover/`; application and database rollback points remain unchanged.
- Follow-up: Darshan must revoke the short-lived Cloudflare token immediately and confirm one interactive OTP login. Runtime operation does not depend on the token.

## 2026-08-04 05:46 UTC - Crypto cutover credential and owner-login closeout

- Operator: Codex following Darshan's confirmation.
- Status: completed.
- Human acceptance: Darshan confirmed that the Cloudflare one-time-PIN login succeeds and the Crypto Intelligence dashboard loads at `crypto.forkedbrain.fyi`.
- Credential verification: the account token verification endpoint now reports the short-lived cutover token revoked or invalid. No local token file, temporary header file, runtime credential, repository value, or server copy exists.
- Final regression: the public Crypto hostname still redirects unauthenticated users to Cloudflare Access, the dashboard container and tunnel service remain healthy, and legacy `intel.forkedbrain.fyi` remains HTTP `200`.
- Recovery mirror: refreshed the changed non-secret acceptance records, verified their hashes, identified and removed exactly seven generated macOS AppleDouble sidecars from prior tar transfers, and confirmed the clean mirror contains 171 regular files with no `._*`, `.DS_Store`, or `__MACOSX` artifacts.
- Recovery and future changes: retain the recorded Access and tunnel rollback material. Any future Cloudflare mutation requires a new narrowly scoped short-lived token and the standing domain-change approval gate.

## 2026-08-04 06:52 UTC - Phase 3 authenticated source capture release

- Operator: Codex continuing the approved Personal AI Ecosystem build.
- Status: completed and promoted at 07:11 UTC.
- Purpose: add a focused URL and pasted-text capture workflow to Crypto Intelligence using the existing application database and Hermes tenant in native OpenViking memory.
- Architecture boundary: the browser calls only the authenticated dashboard backend. The backend establishes deterministic source identity, submits the source through OpenViking's native resource API, and records the local source and receipt only after memory accepts it. Hermes remains the reasoning brain. No scraper, queue, vector database, memory provider, or agent is being added.
- Runtime change: mounted the existing tenant-scoped OpenViking credential from `/srv/mark-v2/secrets/crypto-dashboard-openviking-key` as a read-only file; added only the private service URL and non-secret tenant identifiers; deployed through the existing disposable-database canary and versioned promotion scripts. No raw OpenViking or model-provider key exists in the container environment, image, source, logs, or repository.
- Implementation: added URL and pasted-text capture, stable source IDs, exact duplicate skipping, processing/created/skipped/failed receipts, native service status, public error sanitization, and local registration only after OpenViking accepts the resource. The interface includes desktop and mobile Capture states and recent receipts.
- Recovered native edge case: OpenViking can materialise the requested target before its embedding step fails. The first canary exposed this under the existing exhausted-credit condition. The implementation now removes an exact remote-only target before retry, attempts exact cleanup after native failure, and returns `memory_processing` when a provider lock prevents safe cleanup. A remote-only target can never be promoted as a ready local source. Both disposable canary resources were removed and exact stat checks returned not found.
- Verification: all 65 server tests passed, including URL, text, normalization, duplicate, provider-failure, partial-write cleanup, and locked-resource safety; server and web type checks and production builds passed; desktop and mobile captures were visually inspected; the canary reported memory configured and connected; database integrity remained `ok` with zero foreign-key violations; counts remained 66 events, 47 sources, and 89 media files; Ask remained connected to Hermes; the legacy hostname remained HTTP `200`; and the new public hostname remained behind the Access redirect.
- Dependency review: the server production tree reports zero known vulnerabilities. The web tree reports `GHSA-qwww-vcr4-c8h2` against React Router 7.18.2; the upstream advisory states that only unstable React Server Components APIs are affected. This dashboard is a client-only `BrowserRouter` application and has no React Router server actions or RSC path, so the affected code is not reachable. Keep the exact version pinned and upgrade once the upstream patched release is available from npm.
- Promotion: accepted release `20260804T071121Z`, image `mark-crypto-dashboard:20260804T071121Z`, loopback origin `127.0.0.1:9330`, stopped rollback container `crypto-dashboard-rollback-20260804T065421Z`, and pre-promotion database backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260804T071121Z/crypto-intelligence.db`. Production remained non-root with a read-only root filesystem, all capabilities dropped, `no-new-privileges`, and its existing CPU, memory, and PID limits.
- Known external gate: the configured OpenAI embedding project still reports `credit_balance_exhausted`. No provider was changed. Capture is deployed and fails safely, but a production source and the 197-record semantic migration must wait for funded native embedding access and a passing disposable recall fixture.
- Rollback: restore the pre-promotion database backup and recreate prior image `mark-crypto-dashboard:20260804T065421Z` with its prior environment and mounts; remove only the dashboard OpenViking secret mount and environment entries if retiring Capture. Retain Hermes, OpenViking, Cloudflare, legacy content, and the legacy hostname unchanged.
- Recovery mirror: refreshed 21 changed non-secret source, test, deployment, migration, and operations files under `/root/mark-v2-docs/`; every local/server SHA-256 matched and no AppleDouble, `.DS_Store`, or `__MACOSX` artifact was present.

## 2026-08-04 07:53 UTC - Hermes-powered Studio release

- Operator: Codex continuing the approved Personal AI Ecosystem build.
- Status: completed and promoted at 08:01 UTC.
- Purpose: complete the next Crypto Intelligence workflow by letting Mark generate speaking preparation, X threads, LinkedIn posts, and period briefs through the existing Hermes brain, then edit them through append-only draft revisions.
- Architecture boundary: reuse Hermes's existing authenticated `llm.oneshot` transport and the existing unified Crypto database. The application selects a bounded set of existing corpus records, gives them to Hermes with an output contract, verifies every returned canonical citation before saving, and records edits as new revisions. No new agent, model provider, database, vector store, memory service, or Hermes/OpenViking patch is introduced.
- Planned release: image `mark-crypto-dashboard:20260804T075332Z`; isolated canary on a disposable database copy; one real Hermes draft plus citation and revision acceptance; guarded promotion to the existing loopback origin; no Cloudflare, DNS, tunnel, Access, legacy hostname, Hermes, OpenViking, or provider mutation.
- Verification plan: server and web type checks/builds; all automated tests; desktop and mobile visual review; authenticated and unauthenticated boundaries; actual Hermes generation with at least one resolvable event/source citation; invalid-citation rejection without partial persistence; append-only revision history; database integrity and foreign keys; restart persistence; existing Ask, Capture status, media range, counts, public Access redirect, and legacy endpoint regression.
- Rollback plan: retain the previous image and stopped production container, create a pre-promotion SQLite backup, and restore both if any production check fails. Canary data is disposable and must be removed after acceptance. No generated canary draft may enter the production database.
- Implementation: added a Studio composer for the five preserved draft formats, bounded corpus evidence packaging, format-specific Hermes instructions, strict event/source citation resolution, atomic draft/revision-0 persistence, append-only browser edits, resolved evidence links, live availability states, rate limiting, and safe provider errors. Existing 41 legacy drafts remain readable and editable.
- Automated and visual verification: 72 server checks passed, including an isolated mock-Hermes end-to-end generation/revision test; server and web type checks and production builds passed; server production dependencies report zero known vulnerabilities; wide and 390-pixel composer, draft, and edit states were visually inspected. The existing React Router RSC-only advisory remains inapplicable to this client-only BrowserRouter build, as recorded in the prior release.
- Canary acceptance: the disposable copy began with 41 drafts, generated one real Hermes speaking brief with resolvable canonical citations, appended revision 1, retained revision 0, maintained one current FTS draft entry, passed database integrity with zero foreign-key rows, and ended with 42 drafts. The production database remained at 41 throughout. The canary container and copy were removed during promotion.
- Transfer recovery: the first release transfer was rejected before image build because macOS AppleDouble sidecars were detected. Only the failed new release directory was removed. The retransmission suppressed and excluded sidecars, its scan returned clean, and the image then built successfully. Production was untouched during recovery.
- Promotion: accepted release `20260804T075332Z`, image `mark-crypto-dashboard:20260804T075332Z`, loopback origin `127.0.0.1:9330`, stopped rollback container `crypto-dashboard-rollback-20260804T071121Z`, and pre-promotion backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260804T075332Z/crypto-intelligence.db`.
- Production acceptance: unauthenticated origin requests return `401`; authenticated static requests return `200`; counts remain 66 events, 47 sources, 89 media files, and 41 drafts; Ask is connected and answered through Hermes; Studio reports connected with five formats; Capture/OpenViking reports connected; media range returns `206`; the database checksum survived restart; the container remains non-root and read-only with all capabilities dropped, `no-new-privileges`, 2 GiB memory, 2 CPU, and 256 PID limits. Public Crypto remains an Access `302`; legacy `intel.forkedbrain.fyi` remains HTTP `200`.
- Runtime isolation: no Cloudflare, DNS, tunnel, Access policy, legacy service, Hermes, OpenViking, model-provider, or credential change occurred. No canary content entered production.
- Rollback: restore the pre-promotion backup, remove only the current dashboard container, rename `crypto-dashboard-rollback-20260804T071121Z` back to `crypto-dashboard`, restore its restart policy, and start it. Retain all other services and hostnames unchanged.
- Recovery mirror: refreshed the 15 changed non-secret application, test, deployment, and operations files under `/root/mark-v2-docs/`; every local/server SHA-256 matched and the full mirror contains no AppleDouble, `.DS_Store`, or `__MACOSX` artifact.

## 2026-08-05 04:41 UTC - Complete Crypto semantic-memory import

- Operator: Codex continuing Darshan's approved Option 1 completion sequence.
- Status: pending; the funded run stopped safely after 26 records were created when record 27 timed out. Resume only after reconciling that identity.
- Purpose: resume the clean, staged 197-record Crypto semantic-memory migration now that Mark's configured OpenAI embedding project can spend successfully.
- Funding verification: one direct `text-embedding-3-small` request returned HTTP `200`, a 1536-dimension vector, and two billed input tokens. No Mark content was submitted in this check.
- Planned sequence: capture the clean OpenViking baseline; verify the checksum-protected pre-import backup and all staged packets; run and remove one non-sensitive native fixture; import 131 source/artifact packets plus 66 event packets with a new exclusive receipt; require an idle zero-error queue; reconcile all identities; replay and require 197 skips with zero creates; test representative exact reads and Hermes retrieval; then create, checksum, and disposable-restore-test a post-import backup.
- Safety boundary: do not change Cloudflare, DNS, tunnels, public hostnames, Telegram, dashboard code, Hermes/OpenViking source, provider selection, credentials, or the legacy VPS. Stop on any genuine queue, identity, checksum, or retrieval failure and restore only OpenViking from the verified pre-import backup if rollback is required.

## 2026-08-05 06:29 UTC - Add Mari to the shared Cloudflare Access policy

- Operator: Codex following Darshan's explicit approval and scoped token delivery.
- Status: completed at 06:37 UTC.
- Purpose: add `marimarbasong@gmail.com` to the existing exact-email allow policy shared by the private root command center, Crypto Intelligence dashboard, and Coolify management endpoints.
- Planned guardrails: verify the short-lived token; read and validate the existing application, four approved destinations, policy ID, current exact-email rules, and 12-hour session; capture owner-only before-state rollback material; append only Mari's exact email; read back the policy and application; require every protected hostname to retain its Cloudflare Access redirect; then have Darshan revoke the temporary token.
- Safety boundary: do not add `Everyone`, an email-domain wildcard, a bypass, another application, hostname, DNS record, tunnel route, identity provider, or session-duration change. `brain.forkedbrain.fyi` retains its separate Hermes authentication and is not converted by this policy update.
- Change: appended only `marimarbasong@gmail.com` to policy `a5166e47-b9a3-4c51-82c2-977e0eacb171`. The existing exact-email entries, `allow` decision, empty exclude/require rules, non-reusable scope, precedence, four application destinations, and 12-hour session remained unchanged.
- Verification: the API read-back returned exactly the three approved email identities. Unauthenticated requests to `forkedbrain.fyi`, `crypto.forkedbrain.fyi`, `manage.forkedbrain.fyi`, and `manage-realtime.forkedbrain.fyi` each returned HTTP `302` to Cloudflare Access after the change.
- Recovery: owner-only before/after API state, rollback payload, update response, and edge results are stored under `.secrets/cloudflare-backups/20260805T063706Z-mari-access/` with mode `0600` inside a mode-`0700` directory.
- Follow-up: revoke the supplied short-lived Cloudflare token, then have Mari request an OTP using the exact approved email. This policy does not create a Hermes account for `brain.forkedbrain.fyi`.

## 2026-08-05 06:56 UTC - OpenAI credit-burn root-cause audit

- Operator: Codex following Darshan's request for a read-only cost investigation.
- Status: completed; no provider, model, credential, application, Cloudflare, or server configuration was changed.
- Root cause: OpenViking's native configuration uses `gpt-5.4` as its VLM/content-processing model. Resource ingestion therefore performed expensive GPT-5.4 parsing and synthesis in addition to the intended `text-embedding-3-small` vector creation.
- Measured OpenViking lifetime usage: 972,051 GPT-5.4 input tokens, 542,249 GPT-5.4 output tokens, and 339,215 embedding input tokens. At OpenAI's current standard short-context prices, this is approximately $10.57: about $10.56 from GPT-5.4 and less than one cent from embeddings.
- Measured 2026-08-05 usage: 852,688 GPT-5.4 input tokens, 458,552 GPT-5.4 output tokens, and 284,942 embedding input tokens, approximately $9.02 at the same rates.
- Interpretation: the small 197-record corpus and its embeddings did not consume the credits. The unusually large GPT-5.4 output volume generated by OpenViking's ingestion pipeline did. The local audit does not support a full $15 of OpenViking spend; the OpenAI Usage dashboard remains authoritative for any remaining account-level or project-level difference.
- Safety state: the migration remains stopped after 26 created records and the record-27 timeout. Do not resume the import or add credits for it until the native VLM is moved to an approved economical model, a single-record canary has a measured cost ceiling, and project budget alerts/limits are in place.

## 2026-08-05 07:06 UTC - OpenAI model and migration-cost remediation proposal

- Operator: Codex following Darshan's request for current official model research and a costed recovery path.
- Status: proposal only; no live model, provider, OpenViking, Hermes, credential, data, or server change was made.
- Standing constraint: do not use GPT-5.4 again for this project.
- Recommended native split: retain `text-embedding-3-small`; use `gpt-5.6-luna` with minimal reasoning for OpenViking's high-volume ingestion/extraction; use `gpt-5.6-terra` as the balanced OpenAI workhorse if Hermes is later moved to OpenAI; reserve `gpt-5.6-sol` at high/xhigh for explicit difficult agent/research escalations rather than routine ingestion.
- Rationale: OpenAI positions Luna for efficient high-volume work, Terra for balanced intelligence/cost, and Sol for frontier work. All support OpenViking's required Chat Completions endpoint, text/image input, structured output, and large context. OpenViking natively accepts an OpenAI model string in `vlm.model`, so the ingestion fix is configuration-only and requires no source patch.
- Cost projection from the measured 26-record run: a clean 197-record re-import with the same token volume would cost approximately $5.50 on Luna standard, $54.66 on Terra standard, or $136.58 on Sol standard, including roughly $0.04 for embeddings. Completing only the remaining 171 records on Luna would project to about $4.78. GPT-5.6 may use fewer tokens, but these estimates deliberately use the observed workload as the planning baseline.
- Proposed safety gate: remove or roll back only the 26 deterministic migration resources, change only OpenViking's native VLM model, run representative small and large one-record canaries, reconcile memory quality and measured tokens, then import in bounded batches with a hard project spend ceiling. A clean all-197 rerun is preferred because its projected Luna premium over keeping the first 26 is only about $0.73 and avoids mixed-model memory.

## 2026-08-05 07:15 UTC - OpenAI dashboard billing reconciliation

- Operator: Codex reviewing the client-supplied OpenAI Usage screenshots; read-only, with no live change.
- Dashboard evidence: total spend for the displayed July 21-August 5 range is $14.65; August spend is $13.09 of a $15 limit. The dashboard reports 505,950 `text-embedding-3-small` input tokens over the full range and 284,944 on August 5.
- Embedding cost: at $0.02 per million input tokens, the full displayed embedding usage cost approximately $0.0101 and the August 5 portion approximately $0.0057. Existing vectors stored in OpenViking's local vector database do not incur a monthly OpenAI storage charge.
- Reconciliation: effectively all displayed spend came from Responses/Chat Completions rather than embeddings. The dashboard confirms 716 Responses/Chat Completions requests and about 1.403 million input tokens. The gap between the earlier OpenViking-local estimate and the account dashboard represents model activity outside the subset captured by OpenViking's local token audit; the OpenAI dashboard is authoritative for the account total.
- Recurring-cost implication: there is no fixed monthly embedding requirement. Future charges occur only when new/query text is embedded or a generation model is called. The projected clean 197-record migration contains only about $0.04 of embedding work; the remaining projected migration cost is Luna-powered native processing.

## 2026-08-04 09:09 UTC - Portable full-VPS recovery capture

- Operator: Codex following Darshan's explicit request for a locally retained, non-encrypted, deployable full-server backup.
- Status: aborted before capture; superseded by the data-free portable deployment kit below.
- Purpose: preserve the complete used V2 server state in an owner-only portable recovery bundle without creating a wasteful 512 GB raw image of unused disk space.
- Planned scope: Ubuntu root, boot and EFI contents; numeric ownership, permissions, ACLs and extended attributes; Docker/Coolify images, containers and volumes; application data and credentials; system/package/firewall/network/container inventories; recovery-friendly logical exports where supported; SHA-256 manifest; and a plain-English restore README installed both in the bundle and at `/root/VPS-RECOVERY-README.md` before capture.
- Exclusions: virtual runtime filesystems, temporary mount points, `/tmp`, the recreatable swapfile, and the new on-server staging directory. No persistent application or client data is excluded.
- Consistency plan: record pre-state, create logical exports, briefly stop Docker, capture the filesystem while all containers are stopped, restart Docker immediately, require every production container and endpoint to recover, then transfer and verify the archive locally. SSH, UFW and the host remain available; public applications may be briefly unavailable during the capture.
- Security boundary: the bundle is intentionally unencrypted but contains credentials and private client data. Store it only under the owner-only Mark `.secrets/backups/new-vps/` tree with directory mode `0700` and file mode `0600`; exclude it from Git, server documentation mirrors, cloud sync, chat and ordinary logs.
- Rollback: if capture fails, remove only the incomplete staging/bundle, restart Docker if necessary and verify the unchanged live server. The operation does not alter application databases, Hermes/OpenViking configuration, Cloudflare, DNS, tunnels, Access policies or the legacy VPS.
- Outcome: the requirement was clarified before any service pause or archive creation. The incomplete remote staging directory and draft recovery README were removed; the incomplete local draft was moved to Trash. Docker was never stopped, no full-data archive was produced, and the Crypto and ForkedBrain production containers remained healthy.

## 2026-08-04 09:15 UTC - Portable V2 deployment kit

- Operator: Codex following Darshan's clarified requirement.
- Status: completed locally; no production mutation.
- Purpose: package the complete V2 software architecture and reproducible host/deployment instructions so it can be installed on another compatible VPS without copying Mark's private data.
- Included scope: Ubuntu host requirements and bootstrap, Docker/Coolify management layer, pinned Hermes and OpenViking services, ForkedBrain and Crypto application source/build definitions, environment templates, health verification, component manifest and recovery README.
- Excluded scope: client databases, memories, media, credentials, API keys, Cloudflare tokens, SSH host/operator keys, provider-specific server identity and generated build/dependency directories. Those remain separate owner-controlled inputs.
- Safety boundary: no live VPS, Cloudflare, DNS, tunnel, Access, legacy service, Hermes, OpenViking, provider or credential mutation is required to build this package.
- Implementation: added a provider-independent standard Compose stack, digest-pinned Hermes and OpenViking releases, source builds for ForkedBrain and Crypto Intelligence, fresh-state bind mounts, staged platform/application deployment, host bootstrap, guarded SSH hardening, immediate Coolify loopback binding, runtime-input checks, health/security verification, a value-free tunnel template and a Git-archive bundle builder.
- Recovery behavior: the platform can be rebuilt without Coolify's internal database, while Coolify remains available as the management layer. The application stage fails closed until separate owner-controlled database and secret files exist. No private input is copied into the source bundle.
- Verification: every shell script passes Bash syntax; the complete Compose model renders with four services; Hermes and OpenViking digests match the accepted AMD64 images; OpenViking publishes no host port; Hermes, ForkedBrain and Crypto publish only loopback origins; secret and client-identifier scans are clean; `git diff --check` passes; ForkedBrain tests, production build and lint pass; the Crypto web type/build pass; and all 72 Crypto server tests plus type/build pass against an isolated current server and disposable database.
- Build-environment note: Docker Desktop was not running locally, so a duplicate local image build was not executed. No Dockerfile or application source failed. Both Dockerfiles are the same accepted sources currently running in production, and their language-level production builds passed in this verification.
- Live-system isolation: Docker was never stopped and no live service, data, credential, Cloudflare object or host configuration changed. A read-only version inventory confirmed the current production services remained healthy before packaging.

## 2026-08-04 08:10 UTC - Studio transactional hardening follow-up

- Operator: Codex completing the Studio release acceptance review.
- Status: completed and promoted at 08:13 UTC.
- Purpose: keep generation and revision audit records inside the same SQLite transaction as their corresponding draft writes, and require every edit to a newly generated Studio draft to retain only resolvable canonical citations. Migrated legacy drafts remain editable under their existing contract.
- Architecture boundary: validation and persistence only. Hermes remains the sole generation and reasoning engine; no agent, model, memory, search, database, provider, credential, Cloudflare, DNS, tunnel, Access, or legacy-service change is planned.
- Planned release: image `mark-crypto-dashboard:20260804T081020Z`, isolated real-Hermes canary on a disposable database copy, guarded promotion to the existing loopback origin, restart/security verification, and unchanged production counts.
- Pre-deployment verification: all 72 server tests pass, including valid edit persistence and invalid edit rejection without a partial revision; server and web type checks and production builds pass; `git diff --check` is clean.
- Rollback plan: retain release `20260804T075332Z` as the stopped predecessor and take a new pre-promotion SQLite backup. Restore both together if any production acceptance check fails. No canary draft may enter production.
- Canary acceptance: a disposable database copy generated a real Hermes speaking brief with resolvable canonical citations, appended a citation-preserving revision, retained revision `0`, and passed the existing identity, counts, memory, Ask, and Studio checks. The canary and its database copy were removed during promotion.
- Promotion: accepted release `20260804T081020Z`, image `mark-crypto-dashboard:20260804T081020Z`, stopped predecessor `crypto-dashboard-rollback-20260804T075332Z`, and pre-promotion backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260804T081020Z/crypto-intelligence.db`.
- Production acceptance: the database checksum persisted through restart; production remained at 41 drafts; Studio reports connected; the container is healthy as non-root user `dashboard` with a read-only root filesystem, all capabilities dropped, `no-new-privileges`, 2 GiB memory, and 256 PID limit. Public Crypto remains an Access `302`; legacy `intel.forkedbrain.fyi` remains HTTP `200`.
- Runtime isolation: no Cloudflare, DNS, tunnel, Access policy, legacy service, Hermes, OpenViking, provider, credential, or schema change occurred. No canary content entered production.
- Rollback: restore the new pre-promotion backup, remove only the current dashboard container, rename `crypto-dashboard-rollback-20260804T075332Z` back to `crypto-dashboard`, restore its restart policy, and start it. Retain every other service and hostname unchanged.
- Recovery mirror: refreshed the 15 changed non-secret application, test, deployment, and operations files under `/root/mark-v2-docs/`; every local/server SHA-256 matched and the full mirror contains no AppleDouble, `.DS_Store`, or `__MACOSX` artifact.

## 2026-08-05 08:08-11:35 UTC - Clean Luna Crypto semantic import accepted

- Operator: Codex continuing Darshan's approved Option 1 completion sequence under the explicit $10 new-credit ceiling.
- Status: completed and accepted; 197 of 197 deterministic Crypto identities are live in native OpenViking memory.
- Cost correction: removed only the partial GPT-5.4 migration branch after restoring the verified clean baseline, changed only OpenViking's native VLM configuration to `gpt-5.6-luna`, retained `text-embedding-3-small`, disabled reasoning, limited retries to one, and used native VLM concurrency four. Hermes stayed on its existing provider. No Hermes or OpenViking source was patched.
- Recovery before mutation: created and verified `/root/mark-v2-backups/20260805T080836Z-pre-luna-cost-control/`; preserved the pre-concurrency configuration at `/app/.openviking/ov.conf.pre-concurrency-4-20260805T104320Z`; synchronized the current restricted config to the owner-only local secret escrow by checksum without printing it.
- Importer hardening: replaced semantic identity lookup with native deterministic target `stat`. A target is accepted only when it is an unlocked non-empty directory. This made interruption/replay safe and removed model spend from identity checks. Targeted regression tests pass 4 of 4 and `git diff --check` passes.
- Import result: exact reconciliation found 131 of 131 source/artifact targets and 66 of 66 event targets, with zero missing, locked, or error results. Queue completion ended at zero pending, zero running, and zero errors. One record that completed while the importer was being stopped was detected and skipped on resume rather than duplicated.
- Replay proof: the independent acceptance receipt contains 197 records, 197 skips, zero creates, zero failures, and 197 unique target URIs.
- Read and intelligence acceptance: six representative recursive deep reads preserved the exact source/event provenance IDs. A raw unconstrained Hermes memory answer retrieved the correct event but produced an unverified source hash, confirming that model text must not be trusted as authorization or identity. The existing production Crypto Ask boundary then returned through Hermes with eight canonical evidence records and four citations; all four resolved to returned evidence.
- Model usage: the clean import's combined pre/post-restart OpenViking observers estimate approximately $3.46 at the approved standard Luna and embedding prices. The embedding portion is only cents; the OpenAI billing dashboard remains authoritative.
- Accepted backup: briefly stopped only OpenViking after its queue was idle, created `/root/mark-v2-backups/20260805T112800Z-post-complete-crypto-import/openviking-data.tar.gz`, set it mode `0600`, and verified `SHA256SUMS`. The archive is 34,801,436 bytes.
- Restore drill: restored the archive into a uniquely named disposable volume under the same digest-pinned OpenViking image with no host port, required the restored container to become healthy, and verified an exact imported target stat. The first verifier attempt expected unwrapped JSON and failed locally without affecting data; the corrected verifier consumed the CLI's `result` wrapper and passed. Both disposable attempts were cleaned up. Production returned healthy and private with the correct Luna/vector models available.
- Private evidence retention: copied the final manifest and 21 receipts into `.secrets/migration-manifests/crypto-v2-20260805-complete/`, mode `0700` directory and `0600` files, with a local SHA-256 manifest. No client packet content or credential entered Git or ordinary documentation.
- Regression boundary: Hermes, OpenViking, ForkedBrain, Crypto Dashboard, and the V2 tunnel are healthy; public Crypto remains behind Cloudflare Access; legacy `intel.forkedbrain.fyi` remains HTTP `200`. No Cloudflare, DNS, tunnel, Access, dashboard code, Telegram, legacy-service, or client-credential change occurred.
- Rollback/recovery: use the accepted post-import archive for current-state recovery. To remove the entire accepted import only under explicit approval, stop OpenViking and restore the verified pre-Luna baseline. Never run two writers against the production volume and never use semantic search as an identity check.

## 2026-08-05 12:38-12:44 UTC - Crypto Intelligence workflow polish

- Operator: Codex implementing Darshan's approved Crypto dashboard polish.
- Status: completed and promoted as release `20260805T123859Z`.
- Product scope: promoted Ask from a command shortcut to a first-class grounded workflow; converted the preserved Recall archive into a live evidence-linked Quiz with bounded generation and single-pass grading; added task-first Studio launchers for X, LinkedIn, review briefs, and Speaking Preparation; added the four primary workflows to the Brief; and tightened the responsive mobile hierarchy.
- Architecture boundary: Hermes remains the only reasoning and generation layer, OpenViking remains the only semantic-memory provider, and the existing SQLite database remains the only structured product store. No new database, vector store, agent runtime, provider, scraper, Cloudflare object, DNS record, tunnel route, Access policy, or legacy-service change was made.
- Cost control: a new quiz uses one bounded Hermes call for generation and one bounded call to grade the complete answer set. The real-Hermes acceptance ran only on a disposable database copy; no canary quiz, Studio draft, or answer entered production.
- Pre-deployment verification: all 74 server tests passed; server and web type checks and production builds passed; `git diff --check` and deployment-script syntax checks passed; desktop and 390-pixel mobile captures were visually inspected.
- Canary acceptance: identity rejection/acceptance, 66/47/89 corpus counts, native memory status, grounded Ask, cited Studio generation and revision, and a three-question evidence-linked Quiz with complete grading feedback all passed. The canary database was disposable and removed after promotion.
- Promotion: active image `mark-crypto-dashboard:20260805T123859Z`; stopped predecessor `crypto-dashboard-rollback-20260804T081020Z`; pre-promotion database backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260805T123859Z/crypto-intelligence.db`.
- Production acceptance: container healthy and loopback-only as non-root user `dashboard`, read-only root filesystem, all capabilities dropped, `no-new-privileges`, unchanged 66 events, 47 sources, 89 media records, 41 drafts, and 15 preserved quiz sessions. SQLite integrity is `ok` with zero foreign-key violations. Ask, Studio, Quiz, memory status, and private byte-range media are connected. Public Crypto remains behind Access, plain HTTP redirects to HTTPS, and legacy `intel.forkedbrain.fyi` remains HTTP `200`.
- Rollback: restore the new pre-promotion database backup, remove only the active dashboard container, rename `crypto-dashboard-rollback-20260804T081020Z` back to `crypto-dashboard`, restore its restart policy, and start it. Do not alter Hermes, OpenViking, ForkedBrain, Cloudflare, or the legacy service.

## 2026-08-05 14:20-14:52 UTC - Hermes daily intelligence command center

- Operator: Codex completing Darshan's approved world-class Crypto Intelligence iteration.
- Status: completed and promoted as release `20260805T143933Z`.
- Product scope: rebuilt the Brief as a decision-oriented command center with Today's briefing, Needs Attention, sourced What Changed, suggested actions, watchlists, strongest stored signals, continue-working history, system activity, and direct launchers for Ask, Quiz, X and LinkedIn creation, Speaking Preparation, and Library. Existing workflow screens accept the command center's focused handoff without duplicating state.
- Architecture boundary: Hermes remains the only reasoning and agent layer, OpenViking remains the only semantic memory, and the existing SQLite file remains the only structured application database. The accepted briefing is stored in the existing `generation_meta` table. No new database, vector store, memory provider, scraper service, queue, agent runtime, model provider, credential, Cloudflare object, DNS record, tunnel route, Access policy, or legacy-service change was made.
- Native research capability: installed Hermes's official optional DDGS web backend with `hermes tools post-setup ddgs` and selected it with `hermes config set web.backend ddgs`. A direct native web-search canary returned results. The backend is key-free and runs inside the existing Hermes container; the runbook records the one post-setup command required after a container recreation.
- Cost controls: each review permits at most five focused searches and eight sources, uses low reasoning, runs on a 24-hour cadence, is manually limited to once per ten minutes per authenticated user and IP, and keeps the last accepted brief on any error. Both successful and failed scheduled attempts back off for 24 hours, preventing a retry spend loop. The accepted production review's Hermes session was estimated at about $0.15; the provider dashboard remains authoritative.
- Canary recovery: the initial disposable canary exposed that Hermes can preface valid fenced JSON with one sentence. Production was untouched. The response boundary now extracts and validates the first complete JSON object, strips unsupported dash characters, requires at least one real HTTP or HTTPS source, bounds every list and field, and preserves the previous brief on rejection. A regression test reproduces the exact wrapped-output shape.
- Verification: all 77 server tests, 18 Python migration and provenance tests, server type/build, web production build, Bash syntax checks, and `git diff --check` passed. Real Chrome captures covered all dashboard screens at 1440 and 390 pixels plus reduced-motion and high-contrast variants. The final isolated canary passed identity rejection and acceptance, 66/47/89 corpus counts, a real sourced daily briefing, native memory, grounded Ask, cited and revised Studio generation, and evidence-linked Quiz generation and grading. Canary data was disposable and removed during promotion.
- Production acceptance: generated and persisted the first live briefing, restarted only `crypto-dashboard`, and verified the exact briefing ID and database checksum survived. The database reports `integrity=ok`, zero foreign-key violations, and 66 events. The container is healthy, loopback-only, non-root user `dashboard`, read-only root filesystem, all capabilities dropped, and `no-new-privileges`. Public Crypto remains an Access `302`, plain HTTP redirects with `301`, and legacy `intel.forkedbrain.fyi` remains HTTP `200`.
- Promotion: active image `mark-crypto-dashboard:20260805T143933Z`; stopped predecessor `crypto-dashboard-rollback-20260805T123859Z`; pre-promotion backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260805T143933Z/crypto-intelligence.db`.
- Rollback: restore that pre-promotion database backup, remove only the active dashboard container, rename `crypto-dashboard-rollback-20260805T123859Z` back to `crypto-dashboard`, restore its restart policy, and start it. Do not alter Hermes, OpenViking, ForkedBrain, Cloudflare, or the legacy service.

## 2026-08-05 14:53 UTC - Command-center recovery record finalized

- Operator: Codex completing the non-secret handoff for release `20260805T143933Z`.
- Scope: current infrastructure index, redacted release snapshot, application source, tests, deployment definitions, and supporting non-secret project documentation.
- Safety check: scanned the selected local source and documentation for common API-token and private-key patterns before transfer; credentials, client databases, media, generated builds, dependency trees, screenshots, and secret directories were excluded.
- Recovery mirror: refreshed the selected non-secret tree under `/root/mark-v2-docs/` using the existing key-authenticated SSH path. Every selected local/server SHA-256 matched. The local project remains authoritative.
- Runtime impact: none. No container, database, model, memory, provider, Cloudflare object, hostname, tunnel, Access policy, or legacy service changed during documentation closeout.

## 2026-08-05 15:28-15:47 UTC - Navigation correction deployed

- Operator: Codex implementing Darshan's approved navigation correction.
- Status: completed and promoted as release `20260805T152846Z` for ForkedBrain and Crypto Intelligence.
- Product scope: changed ForkedBrain's Crypto branch and primary action from the legacy Intel hostname to `https://crypto.forkedbrain.fyi/`; made both the Memory Graph logo and Back control return to the main brain overview; made the Crypto Intelligence logo return to its dashboard home route.
- Architecture boundary: navigation only. No database, client content, Hermes, OpenViking, provider, model, memory, Cloudflare object, DNS record, tunnel route, Access policy, credential, or legacy service changed.
- Verification: ForkedBrain tests, lint, and build passed; Crypto type checking and build passed; real Chromium navigation passed at desktop and mobile widths against local builds, isolated production-image canaries, and the promoted production containers. Both production containers are healthy and retain their non-root, read-only, capability-dropped, loopback-only security boundary.
- Public regression: ForkedBrain and Crypto Intelligence return the expected Cloudflare Access redirects, Crypto HTTP redirects to HTTPS, and legacy `intel.forkedbrain.fyi` remains HTTP `200` and unchanged.
- Recovery: ForkedBrain predecessor `forkedbrain-rollback-20260803T1408Z`; Crypto predecessor `crypto-dashboard-rollback-20260805T143933Z`; Crypto pre-promotion backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260805T152846Z/crypto-intelligence.db`.

## 2026-08-06 04:44-05:35 UTC - Native context skills and Studio writing lenses deployed

- Operator: Codex implementing Darshan's approved unified-context design.
- Status: completed and promoted as Crypto Intelligence release `20260806T052651Z`.
- Hermes: installed and validated the local `crypto-intelligence`, `creator-reference`, and `humanized-content` skills in the existing persistent Hermes skill directory. The unmodified Hermes runtime and the single OpenViking memory remain authoritative.
- Product: added Mark and Creator Reference writing lenses inside Content Studio. Creator Reference is not a top-level product branch. It changes expression only, keeps facts grounded in verified Crypto evidence, and returns a clear unavailable state until manually supplied creator material exists.
- Telegram: prepared a dormant native private-topic configuration for General, Crypto Intelligence, and Creator Reference. Activation remains gated on BotFather topic enablement and confirmation that the selected token has no competing poller. No live Telegram configuration or token changed.
- Verification: all 80 server tests passed; server and web type checks and production builds passed; desktop and mobile Studio checks passed; all three skills report enabled. The disposable canary passed identity, corpus, sourced intelligence, memory, Ask, Studio lens persistence, citations, append-only revision, and Quiz checks.
- Production: container is healthy, loopback-only, non-root, read-only, capability-dropped, and protected by Cloudflare Access. The previous release is retained as `crypto-dashboard-rollback-20260805T152846Z`.
- Recovery: pre-promotion database backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260806T052651Z/crypto-intelligence.db`; retained predecessor image `mark-crypto-dashboard:20260805T152846Z`.

## 2026-08-06 07:23-07:42 UTC - Satoshi Telegram topics activated and contextualized

- Operator: Codex following Darshan's approved Telegram activation and context-readiness request.
- Status: active for the temporary implementation tester; Mark owner handoff remains pending his Telegram numeric ID.
- Safety: created a pre-activation SQLite-consistent Hermes state backup plus configuration and environment copies, then a second pre-context backup containing the live config and all Mark skills. Both remain outside Git. The bot token, allowed-user ID, and generated topic IDs remain only in owner-controlled runtime and credential storage.
- Gateway: connected the Mark-owned Satoshi bot through Hermes' native Telegram polling adapter with a closed allowlist and root-DM bypass disabled. The restart-stable gateway registered its command menu and persisted three private topics: General, Crypto Intelligence, and Creator Reference.
- Context: added `mark-general` for everyday assistant, planning, research, recall, and coordination. Tightened the existing Crypto Intelligence and Creator Reference skills with Satoshi identity, Mark's intended outcomes, shared-memory boundaries, source/date discipline, and safe creator attribution. `humanized-content` remains an invisible final writing pass rather than a separate topic.
- Architecture: all topics are isolated conversation sessions over the same Hermes brain and the same OpenViking memory. No Hermes or OpenViking source, model, provider, database, vector store, dashboard, Cloudflare object, DNS record, tunnel, Access policy, or legacy service was changed.
- Initial verification: BotFather capability discovery passed; Telegram polling connected without conflict or authentication errors; topic creation and restart persistence passed; a real Crypto Intelligence message auto-loaded `crypto-intelligence` and returned through Hermes. General and Creator Reference binding checks are queued as the final interactive acceptance because Telegram requires a real user message in each named topic.
- Owner handoff: after Mark starts the bot, add his numeric ID to the closed allowlist and an equivalent three-topic block, run the same acceptance checks from his account, then remove the temporary tester and their topic configuration.

## 2026-08-06 - Unified Satoshi conversation approved and prepared

- Operator: Codex following Darshan's approved simplification of Satoshi's Telegram experience.
- Status: single-chat router skill prepared and documented; live cutover remains pending the required BotFather Topics toggle.
- Product decision: replace the three visible private topics with one ordinary Satoshi conversation. Mark may explicitly label new material as Crypto Intelligence, Creator Reference, or General; obvious material is inferred; genuinely ambiguous ingestion receives one short clarification. Humanization is opt-in through ordinary language.
- Architecture: added one native `satoshi` skill that delegates to the existing specialist skills and OpenViking tools. The single Hermes brain, single OpenViking memory, model, databases, dashboard, and security boundaries remain unchanged. No router service, second bot, agent, store, or model was added.
- Safety gate: do not remove the live `dm_topics` configuration or enable root-DM processing until BotFather reports that Topics are disabled. The existing topic configuration remains the rollback state until the unified root chat passes real-message acceptance.
- Recovery material: `deploy/hermes/telegram-single-chat.example.yaml` records the value-free target configuration; live token, user ID, chat ID, and prior generated topic IDs remain outside Git.
- Interaction contract: routing is internal and invisible during ordinary use. Satoshi presents as one natural personal assistant, may use any installed native Hermes or approved Mark skill, consults unified memory when day-to-day context is relevant, verifies real tool access rather than assuming it, and asks for a branch only before genuinely ambiguous ingestion.

## 2026-08-06 - Satoshi identity customized

- Operator: Codex following Darshan's explicit instruction to make the assistant feel like a capable friend who understands Mark's day-to-day work.
- Identity: named the assistant Satoshi in the supported Hermes `SOUL.md` identity slot. The persona is warm, candid, context-aware, proactive without noise, honest about uncertainty, and able to use the full installed Hermes tool and skill set without exposing internal routing.
- Knowledge boundary: dynamic facts about Mark remain in the unified OpenViking memory and current conversation instead of being copied into a static persona file. Satoshi must search that memory when Mark's projects, preferences, people, routines, decisions, or commitments affect the answer.
- Safety: the identity requires real access verification, privacy and budget protection, source fidelity, and confirmation before destructive, public, financial, or externally consequential actions. No Hermes source, model, provider, database, or memory implementation was changed.

## 2026-08-06 08:44-08:52 UTC - Canonical Mark owner context accepted

- Operator: Codex following Darshan's explicit request that Satoshi understand Mark, his professional background, the Personal AI Ecosystem, Crypto Intelligence, and Creator Reference as one assistant context.
- Status: completed and verified in the existing native OpenViking memory.
- Data design: added one bounded private owner-context resource at `viking://user/hermes/resources/mark/core-profile/v1`. It contains confirmed or confidence-labelled professional background, Mark's intended assistant use, the single-brain architecture, the active Crypto Intelligence capabilities and accepted 197-record migration, Creator Reference boundaries, optional humanization, and correction rules.
- Privacy boundary: excluded speculative travel or lifestyle observations, invasive OSINT, credentials, private infrastructure paths, and unsupported claims about Dialectic ownership, mandate, or investment authority. The source document is mode `0600` under the owner-only client secret tree and is not tracked by Git or copied to the server documentation mirror.
- Replay safety: added a deterministic plan/apply importer using Hermes's existing native OpenViking provider. A live preflight found the target absent. The first post-write semantic verification ran before the final indexed child was searchable, so no retry write was attempted. Direct deterministic browse/read proved the resource complete; a replay returned `skipped_existing` and verified the same target with no duplicate.
- Assistant behavior: updated only the repository-owned `satoshi` skill so Mark-specific identity, career, goal, architecture, Crypto Intelligence, and Creator Reference questions retrieve the canonical owner context and preserve confidence labels. Hermes source, SOUL identity, model, provider, database, vector store, memory provider, Telegram config, Cloudflare, dashboards, and legacy services were not changed.
- End-to-end acceptance: one disposable Hermes one-shot loaded `satoshi`, searched and read the new resource, correctly summarized Mark's current role and focus, described the active assistant capabilities, and named the unconfirmed career details instead of inventing them. The test session and temporary usage file were deleted after verification.
- Runtime state: Hermes remained running with restart count zero. Temporary copies of the private context and helper scripts were removed from both the host and container.

## 2026-08-06 10:01-10:05 UTC - Satoshi authorized-collaborator identity behavior corrected

- Operator: Codex following Darshan's report of an incorrect Telegram response during implementation testing.
- Problem: Satoshi correctly refused a free-text identity switch from Darshan to Mark, but incorrectly described itself as a generic Hermes Agent, treated Mark's project context as a separate inaccessible user profile, and directed the authorized tester to another session.
- Correction: updated the repository-owned `SOUL.md`, `satoshi`, and `mark-general` instructions so the gateway allowlist remains the access boundary, authenticated sender identity remains accurate, and authorized staff or implementation operators may retrieve and test Mark's shared context without impersonating Mark.
- Safety: the correction does not let chat text override authenticated Telegram identity. First-person language continues to refer to the authenticated sender when known, while explicit questions about Mark use Mark's canonical owner context.
- Deployment: preserved a host-side rollback copy, deployed only the three instruction files, mirrored them to the server documentation tree, and restarted only the Hermes container. No Telegram token, allowlist, topic mapping, model, provider, OpenViking data, dashboard, Cloudflare configuration, or legacy service changed.
- Acceptance: a disposable live Hermes one-shot preloaded `satoshi` and correctly identified itself as Satoshi, confirmed Darshan's authorized tester access to Mark's context, rejected identity reassignment by chat claim, and retained Darshan as the sender. The disposable session and usage file were deleted; Hermes and the Telegram gateway remained healthy with no new errors.

## 2026-08-07 12:02-12:20 UTC - Bounded Mark owner simulation and Sol provider activated

- Operator: Codex following Darshan's explicit request to test the exact owner experience from his existing allowlisted Telegram account and to use Sol with high reasoning.
- Recovery first: preserved the prior Hermes config, repository-owned identity files, a redacted export of the four recent tester Telegram sessions, and a consistent SQLite state snapshot at `/root/mark-v2-backups/20260807T120931Z-mark-owner-simulation-sol/`.
- Identity behavior: added a single native channel-scoped prompt for the existing allowlisted implementation chat. In that chat only, Satoshi addresses the tester as Mark, resolves first-person language as Mark, consults Mark's canonical context, and exercises the same workflows intended for Mark. The numeric allowlist, bot token, memory tenancy, and other chats are unchanged.
- Provider: switched Hermes through its supported configuration path to native `openai-api`, default model `gpt-5.6-sol`, and reasoning effort `high`. No model key was added to source, Compose, application code, logs, or ordinary documentation.
- Cached state: the generic-Hermes and identity-refusal responses existed in four recent Telegram session histories. After backup, only those Telegram test sessions were deleted. OpenViking memory, the 197-record Crypto import, and non-Telegram sessions were untouched.
- Verification: live configuration readback returned the expected provider, model, reasoning, exactly one channel prompt, and the owner-simulation marker; deployed identity-file hashes matched the repository; Telegram session listing returned empty; Hermes and its s6-supervised gateway remained running.
- Behavioral acceptance: a disposable live Sol call loaded `satoshi`, identified itself as Satoshi, treated the tester as Mark, searched and read the canonical OpenViking owner profile, and returned a correct confidence-aware summary of Mark. The disposable acceptance and earlier canary sessions plus usage files were deleted afterward.
- Boundaries: no Hermes or OpenViking source modification, new agent, profile, database, vector store, provider service, dashboard change, Cloudflare mutation, DNS or tunnel change, or legacy-VPS action occurred.
- Rollback: stop only Hermes, restore the configuration, identity files, and state database from the recovery point, restart Hermes, and rerun provider plus Telegram acceptance. Do not restore OpenViking or dashboard data for this change.

## 2026-08-07 15:21-16:11 UTC - Final Option 1 reliability release accepted

- Operator: Codex completing Darshan's approved working-system handoff.
- Status: completed and promoted as Crypto Intelligence release `20260807T152605Z`.
- Architecture boundary: Hermes remains the only brain and agent runtime, OpenViking remains the only semantic memory, and the existing SQLite database remains the only structured application store. No second model service, vector store, scraper service, router service, or database was added.
- Recovery first: created and checksum-verified `/root/mark-v2-backups/20260807T152133Z-pre-final-option1/`, including pre-change Hermes configuration, environment, session state, Mark skills, dashboard environment and deployment material. Created a SQLite-consistent pre-promotion backup at `/srv/mark-v2/crypto-dashboard/backups/pre-20260807T152605Z/crypto-intelligence.db`.
- Grounding correction: Ask and Studio now load real source bodies from native OpenViking reads rather than relying on metadata-only summaries. Creator Reference uses the same native memory and performs one bounded retry if indexed material is still settling. Canonical citations remain mandatory before a draft can be stored.
- Capture correction: YouTube capture is accepted only after Hermes's native media skill returns a real transcript and an exact readback verifies the stored source. Duplicate captures can repair stale text and refresh the existing FTS projection. Loopback/private targets are rejected. Unsupported X and Instagram URLs return an honest request for pasted source text; no custom scraper or false-success path was added.
- Verification: all 61 server tests passed; server and web type checks and production builds passed; deployment-script syntax, `git diff --check`, and a raw-secret pattern scan passed. The isolated canary passed identity, 66/52/89 disposable counts, daily intelligence, native memory, source-grounded Ask, Studio generation/revision, Quiz generation/grading, private-URL rejection, unsupported-social handling, exact YouTube recall, Creator Reference, Satoshi persona, and humanization fidelity checks.
- Production acceptance: Mark and Mari identities return HTTP `200`; an unauthenticated origin request returns `401`; public ForkedBrain and Crypto return Cloudflare Access `302`; legacy Intel remains `200`. The live database reports `integrity_check=ok`, zero foreign-key violations, and final canonical counts of 66 events, 47 sources and 89 media files. The active container is healthy with restart count zero, user `dashboard`, read-only root filesystem, all capabilities dropped, `no-new-privileges`, and a loopback-only port.
- Data hygiene: after a verified backup, removed exactly five explicitly named QA capture fixtures and their related identity, receipt, sighting, FTS and audit records. Zero QA fixtures remain and no client source was removed. Created and checksum-verified the clean post-release database recovery point at `/srv/mark-v2/crypto-dashboard/backups/post-20260807T152605Z/`.
- Telegram: after BotFather reported Topics disabled, removed the obsolete live `dm_topics` block, set `ignore_root_dm: false`, and retained one native channel prompt for the approved owner-simulation tester. Satoshi now presents one continuous conversation and routes General, Crypto Intelligence, Creator Reference and opt-in humanization through existing native skills over the same memory. The gateway runs as Linux user `hermes`; a real Telegram Bot API delivery to the allowlisted tester succeeded.
- Provider: Hermes remains on native `openai-api`, model `gpt-5.6-sol`, with high reasoning. No provider key entered the repository, application image, ordinary documentation, or logs.
- Server security: effective SSH settings are key-only with password and keyboard-interactive authentication disabled; UFW is active; root password login over SSH is disabled. Client application services are loopback-only and hardened. OpenViking remains private on the isolated application network with no host port.
- Build note: the first image build encountered a transient native-module prebuild download failure while the slim build stage lacked a compiler. The Dockerfile now permits a build-only compiler fallback; the final runtime remains slim and non-root. Production was not affected. `rsync` was unavailable on the host, so the approved tar-stream transfer path was used.
- Dependency review: server production dependencies report zero known vulnerabilities. The web audit reports the upstream React Router RSC/server-action advisory, but this product is a Vite client-only SPA and does not enable or ship the affected RSC action path. A forced downgrade was rejected as a larger post-acceptance risk; track a normal upstream upgrade.
- Rollback correction: the promotion completed, but the old default Compose project identity adopted the renamed predecessor, so the reported stopped rollback container was not retained. The previous image `mark-crypto-dashboard:20260806T052651Z` and both verified database backups remain intact. `promote-release.sh` now assigns each future release a unique Compose project, preventing that reuse. To roll back this release, point the deployment definition to the previous image, recreate only `crypto-dashboard`, and restore the pre-release database only if schema/data rollback is required.
- Owner handoff: the build is complete. Mark must still start the bot and provide his Telegram numeric ID before the closed allowlist can be moved from the temporary tester to the owner; this is an account handoff, not remaining implementation.

## 2026-08-08 05:05-05:10 UTC - Satoshi Mark-owner allowlist handoff accepted

- Operator: Codex following Darshan's receipt of Mark's Telegram numeric user ID.
- Status: Mark is added to the existing closed Telegram allowlist and has a dedicated native owner channel prompt.
- Recovery first: created and checksum-verified `/root/mark-v2-backups/20260808T050500Z-pre-mark-telegram-handoff/` containing the pre-change Hermes config, environment, state database, gateway/channel state and session index. The directory is owner-only and the archive plus checksum manifest are mode `0600`.
- Runtime change: added Mark exactly once to `TELEGRAM_ALLOWED_USERS` and added one channel prompt that addresses the authenticated sender as Mark, loads the existing `satoshi` skill, consults canonical Mark context, and routes General, Crypto Intelligence, Creator Reference and opt-in humanization invisibly. The temporary tester remains allowlisted until Darshan completes owner acceptance; no numeric ID or credential is recorded here.
- Verification: configuration schema validation passed before restart; after restarting only Hermes, the gateway runs as Linux user `hermes`; the allowlist and channel-prompt counts are both two with no duplicates; `ignore_root_dm=false`; no `dm_topics` exist; Telegram `getMe` succeeds and confirms Topics disabled.
- Architecture boundary: authorization and native channel context only. No bot, token, skill, memory, model, provider, database, dashboard, Cloudflare, DNS, tunnel or legacy service changed.
- Next: Mark opens the existing Satoshi bot and sends `/start`, then completes owner-behavior, memory, Crypto, Creator Reference and humanization acceptance. Mari's Telegram numeric ID remains pending. After both owner/staff checks pass, Darshan may explicitly approve removal of the temporary tester.
- Rollback: stop only Hermes, restore the verified archive into `/opt/data` with the preserved ownership and modes, restart Hermes, and repeat config plus Telegram API checks. OpenViking and dashboard data are not involved.

## 2026-08-11 - Telegram source synchronization promotion opened

- Operator: Codex completing Darshan's approved pending synchronization task.
- Status: in progress; production mutation is gated on local tests, consistent database backup, canary acceptance, and rollback capture.
- Intended change: after Satoshi completes native OpenViking ingestion, submit a safe metadata-only reference to a persistent FIFO dashboard queue. The queue reads the completed source from OpenViking, idempotently registers it in the existing SQLite source/identity/FTS tables, and makes it visible in Library, Ask, Studio, Quiz, and ForkedBrain search.
- Architecture boundary: Hermes remains the only brain, OpenViking remains semantic memory, and `crypto-intelligence.db` remains the only structured application store. No second database, vector store, model service, router, or copy of source content is introduced.
- Safety boundary: the internal endpoint uses a generated file-backed bearer secret, complete transcripts never appear in model tool arguments, duplicate submissions reconcile to one canonical source, and failed work remains retryable across application restarts.

## 2026-08-11 13:22-14:10 UTC - Telegram source synchronization accepted

- Operator: Codex completing Darshan's approved pending synchronization task.
- Status: completed and promoted as Crypto Intelligence and ForkedBrain release `20260811T132229Z`.
- Recovery first: created the owner-only package `/srv/mark-v2/recovery/pre-telegram-sync-20260811T132229Z`, verified the SQLite backup checksum, preserved both previous application definitions and installed skill state, and retained `crypto-dashboard-rollback-20260807T152605Z` plus `forkedbrain-rollback-20260805T152846Z`.
- Implementation: added migration `006 telegram_source_sync`, a durable FIFO job table and worker, one private metadata-only service endpoint, and the small `sync_dashboard_source.py` helper used by Satoshi's existing Crypto skill after successful native ingestion. The worker reads complete retained content directly from the supplied OpenViking URI, then uses the existing source identity, sighting, receipt, audit, and unified FTS contracts.
- Architecture boundary: Hermes remains the only brain, OpenViking remains the only semantic memory, and the existing `crypto-intelligence.db` remains the only structured store. No second database, vector service, memory provider, scraper, model provider, or Hermes/OpenViking source patch was added. ForkedBrain reads the same live database directory in query-only mode.
- Security: generated a dedicated service credential, mounted it read only into only the dashboard and Hermes containers, and kept it out of model prompts, tool arguments, transcripts, container environments, images, Git, and documentation. Missing and invalid endpoint credentials both returned HTTP `401`.
- Local acceptance: dashboard server and web builds passed; all 84 dashboard tests passed; ForkedBrain build and all four tests passed; deployment-script syntax, Python compilation, and `git diff --check` passed. A 144,000-character source test proved that a distinctive term near the end of retained content is indexed and retrieved without truncation.
- Production proof: two existing Satoshi/OpenViking Crypto sources entered the live queue, both reached `ready` on attempt one, and both became searchable in the dashboard and ForkedBrain graph. Replaying one external identity returned the same canonical source, left the job count at two, left the source count at 49, and did not increment attempts.
- Persistence and integrity: after restarting both production applications, both were healthy and the same two jobs, dashboard results, and graph results remained available. SQLite quick check returned `ok`, foreign-key violations were zero, and migration `006` existed once.
- Public regression: protected Crypto and ForkedBrain endpoints continued redirecting unauthenticated users to Cloudflare Access, Crypto HTTP continued redirecting to HTTPS, and legacy `intel.forkedbrain.fyi` remained HTTP `200` and unchanged.
- Cost: synchronization acceptance used direct OpenViking reads and deterministic registration only; it made no paid model call.

## 2026-08-11 14:15 UTC - Telegram sync release checkpoint archived

- Operator: Codex closing the approved Satoshi synchronization task.
- Repository: committed the implementation, tests, deployment definitions, and client-safe documentation to the private `main` branch with no credentials or private content.
- Recovery mirror: replaced `/root/mark-v2-docs/` with a clean archive of the tracked repository, compared all 216 file hashes against the local checkpoint, found no AppleDouble or `.DS_Store` artifacts, and retained the prior generated mirror as a dated recovery copy.
- Runtime: no production container, database, memory record, provider, Cloudflare configuration, or legacy service changed during this archival step.

## 2026-09-02 07:32-08:43 UTC - Mark Lovable frontend release accepted

- Operator: Codex implementing Darshan's approved replacement of the Crypto Intelligence frontend with Mark's Lovable design direction.
- Status: completed and promoted as Crypto Intelligence release `20260902T073200Z`.
- Release source: branch `feature/lovable-frontend-integration`, initial implementation commit `781573b`.
- Product scope: make Topics the evidence-first home, add topic detail, rebuild Timeline around all stored years and real reference counts, rebuild Sources and source-scoped Ask, add searchable Ask history, add selected-source Prep and Studio workflows, add a generic Creator Reference workspace, and add revealable Quiz model answers.
- Data boundary: Lovable sample records, demo bots, generated counts, and seeded timeline content are excluded. The existing production database, source identities, OpenViking memory, Hermes brain, Telegram synchronization, and retained client content remain authoritative.
- Automated verification: web and server type checks passed, both production builds passed, all 86 server tests passed, production dependency audits reported zero vulnerabilities, `git diff --check` passed, and both deployment scripts passed shell syntax validation.
- Canary: isolated release `20260902T073200Z` passed identity rejection and acceptance, SQLite integrity, migrations `006` and `007`, Hermes, OpenViking, Studio, Quiz, media range serving, and internal sync authentication. It used the live 54-source database copy and made zero paid model calls.
- Browser acceptance: the exact production image passed desktop and mobile checks for 65 real Topics, Aave topic detail with 39 extracted claims, 12 historical years, 112 visible 2026 timeline rows, 42 unique events, 564 dated references, Timeline evidence links, 54 Sources, exact Transcript, Tweet, Blog post and Your notes filters, retained source text, source-scoped Ask, searchable Ask history, 30 Studio source choices, Creator Reference without demo creators, eight model-answer reveals, responsive navigation, no horizontal overflow, and zero page or console errors.
- Promotion: the live container is `mark-crypto-dashboard:20260902T073200Z` on `127.0.0.1:9330`. SQLite quick check returned `ok`, foreign-key violations were zero, all seven Telegram synchronization jobs were `ready` with a maximum of one attempt, and the production container was healthy with zero restarts.
- Security: production runs as non-root user `dashboard` with a read-only root filesystem, all capabilities dropped, `no-new-privileges`, and loopback-only publication. Missing identity returned HTTP `401` and an approved identity returned HTTP `200` at the origin.
- Recovery: copied the prior deployment definition to `/srv/mark-v2/crypto-dashboard/deploy.pre-20260902T073200Z`, created `/srv/mark-v2/crypto-dashboard/backups/pre-20260902T073200Z/crypto-intelligence.db` with mode `0640`, and retained the stopped predecessor as `crypto-dashboard-rollback-20260811T132229Z` with restart disabled.
- Public regression: unauthenticated `https://crypto.forkedbrain.fyi/` redirects to Cloudflare Access, plain HTTP redirects to HTTPS, `https://intel.forkedbrain.fyi/` remains HTTP `200`, and the protected root site remains unchanged.
- Unchanged scope: no DNS, Cloudflare Access, tunnel, provider, model, Hermes source, OpenViking source, ForkedBrain, legacy VPS, or `intel.forkedbrain.fyi` change occurred.

## 2026-09-02 08:49-09:08 UTC - Evidence and dark-mode completion accepted

- Operator: Codex completing Darshan's approved product-quality pass while preserving Mark's Lovable frontend structure.
- Status: completed and promoted as Crypto Intelligence release `20260902T084905Z`.
- Product scope: added bounded source briefs, clear event explanations, plain-language Ask and inline evidence contracts, clickable citations, real-topic Studio filtering, publishable-format validation, and persistent light and dark themes.
- Architecture boundary: retained the existing React application, Fastify backend, single SQLite database, Hermes brain, OpenViking memory, Telegram synchronization, Cloudflare boundary, and identity model. Added no second database, vector store, agent, provider, scraper, or reasoning layer.
- Automated verification: server and web type checks and production builds passed, all 87 server tests passed, production dependency audits reported zero known vulnerabilities, deployment scripts passed syntax validation, application source contained no Lovable sample data, and `git diff --check` passed.
- Canary: image `mark-crypto-dashboard:20260902T084905Z` passed an isolated canary on `127.0.0.1:9331` against a live database copy. Identity, data counts, SQLite, migrations, Hermes, OpenViking, intelligence, ingestion, Studio, Quiz, synchronization, source briefs, event presentation, timeline takeaways, theme assets, and container hardening passed with zero paid model calls.
- Promotion: production moved to image `mark-crypto-dashboard:20260902T084905Z` on `127.0.0.1:9330`. Mark and Mari identity checks passed. Production contained 66 events, 54 sources, 89 media assets, and seven ready synchronization jobs. SQLite quick and integrity checks returned `ok`, foreign-key violations were zero, and the container was healthy with zero restarts.
- Security: production runs as non-root user `dashboard`, with a read-only root filesystem, all capabilities dropped, `no-new-privileges`, and loopback-only publication. Missing identity returned HTTP `401`.
- Recovery: retained stopped predecessor `crypto-dashboard-rollback-20260902T073200Z`, copied the previous deployment definition to `/srv/mark-v2/crypto-dashboard/deploy.pre-20260902T084905Z`, and created `/srv/mark-v2/crypto-dashboard/backups/pre-20260902T084905Z/crypto-intelligence.db`.
- Public regression: unauthenticated Crypto HTTPS redirects to Cloudflare Access, HTTP redirects to HTTPS, and `intel.forkedbrain.fyi` remains HTTP `200` and unchanged.
- Cost: release acceptance made zero paid model calls.

## 2026-09-02 09:08-09:16 UTC - Release source and recovery mirror archived

- Operator: Codex closing the evidence and dark-mode release.
- Repository: fast-forwarded the tested feature branch into the private `main` branch and pushed the application, tests, deployment definition, runbook, acceptance matrix, handbook, and redacted release snapshot. The implementation commit contains no AI co-author trailer.
- Verification: the pushed `main` branch matched the tested local checkpoint, the worktree was clean, and the committed diff passed whitespace and credential-pattern checks.
- Recovery mirror: streamed a clean `git archive` into a new owner-only server directory, compared all 231 tracked file hashes with the local checkpoint, found an exact match, found no `.DS_Store` or AppleDouble artifacts, and promoted it to `/root/mark-v2-docs/`.
- Recovery: retained the previous documentation mirror as `/root/mark-v2-docs.pre-20260902T084905Z`. No application container, database, memory record, provider, Cloudflare setting, or legacy service changed during this archival step.

## 2026-09-03 13:17 UTC: Literal Lovable component release accepted

- Operator: Codex implementing Mark's explicit requirement that the production frontend match his Lovable build exactly.
- Status: completed and promoted as Crypto Intelligence release `20260903T131714Z`.
- Frontend contract: Topics, Timeline, Prep, Haseeb bot, and Tarun bot use the preserved Lovable component structure, navigation order, labels, typography, layout, controls, charts, generated states, feedback controls, citations, and responsive behavior. Dark mode is the only intentional visual addition.
- Data boundary: all Lovable sample records and mock actions remain excluded. The five screens use the existing production database and API boundaries. Hermes, OpenViking, Telegram synchronization, Cloudflare, ForkedBrain, and the legacy Intel service were not changed.
- Verification: the web production build and dependency audit passed with zero vulnerabilities. `git diff --check` passed, the active frontend scope contains no em dash or en dash characters, all five authenticated production routes returned HTTP 200, and the public Crypto route returned the expected Cloudflare Access redirect.
- Runtime: image `mark-crypto-dashboard:20260903T131714Z` is healthy with zero restarts, runs as user `dashboard`, uses a read-only root filesystem, drops all Linux capabilities, and uses `no-new-privileges`.
- Recovery: retained stopped predecessor `crypto-dashboard-rollback-20260903T131101Z` and verified pre-promotion database backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260903T131714Z/crypto-intelligence.db`.
- Cost: release acceptance made zero paid model calls.

## 2026-09-03 16:36 UTC: Exact Lovable final release accepted

- Operator: Codex completing Mark's exact Lovable frontend correction.
- Status: completed and promoted as Crypto Intelligence release `20260903T163620Z`.
- Frontend contract: the production UI exposes only Topics, Timeline, Prep, Haseeb bot, and Tarun bot in Mark's exact order and visible structure. The Lovable shell, typography, spacing, controls, charts, output states, feedback controls, citations, and responsive rules are retained. Dark mode is the only intentional visual addition and light remains the default.
- Data boundary: every seeded record, fake total, mock action, and sample creator response remains excluded. Topics, claims, speakers, dates, sources, counts, and generated outputs use the existing production database and APIs.
- API correction: Topics now returns real claim counts and related tags. Topic detail uses real claims, speakers, source types, date windows, related tags, and stance values.
- Candidate handling: browser interaction exposed a React effect cleanup fault in candidate `20260903T162235Z`. That candidate was superseded immediately and is not an accepted rollback target. Final release `20260903T163620Z` passed the same complete click-through sequence without errors.
- Verification: web production build, server type check, server production build, all 87 server tests, both dependency audits, API contracts, desktop and 390-pixel mobile browser checks, dark-mode switching, horizontal-overflow checks, and credential-pattern checks passed. Browser acceptance produced zero exceptions and zero failed requests.
- Runtime: image `mark-crypto-dashboard:20260903T163620Z` is healthy with zero restarts, runs as user `dashboard`, uses a read-only root filesystem, drops all Linux capabilities, enables `no-new-privileges`, and publishes only on `127.0.0.1:9330`.
- Public boundary: unauthenticated Crypto HTTPS redirects to Cloudflare Access, HTTP redirects to HTTPS, and `intel.forkedbrain.fyi` remains HTTP `200` and unchanged.
- Recovery: verified database backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260903T163620Z/crypto-intelligence.db` and deployment snapshot `/srv/mark-v2/crypto-dashboard/deploy.pre-20260903T163620Z`. The preferred known-good application rollback is retained as `crypto-dashboard-rollback-20260903T131714Z`.
- Recovery mirror: refreshed `/root/mark-v2-docs/` from the final tracked Git checkpoint, verified every tracked file hash, and retained the previous mirror as `/root/mark-v2-docs.pre-20260903T163620Z`.
- Scope safety: Cloudflare, Hermes, OpenViking, Satoshi, ForkedBrain, and the legacy Intel service were not changed.
- Cost: release acceptance made zero paid model calls.

## 2026-09-04 14:19-14:34 UTC: Response-quality completion accepted

- Operator: Codex completing the behavior, evidence, and response requirements behind Mark's exact five-screen Lovable interface.
- Status: completed and promoted as Crypto Intelligence release `20260904T141918Z`.
- Product scope: added structured Prep and creator workflows, readable evidence presentation, original source links, concise Timeline source context, distinct supporting-source counts, exact source resolution, requested creator output counts and lengths, citation separation, and append-only creator revisions.
- Frontend boundary: Topics, Timeline, Prep, Haseeb bot, and Tarun bot remain the only visible screens. Dark mode remains the only intentional visual addition. No seeded record, mock response, fake count, old dashboard tab, or dummy action was added.
- Canary defects: real Hermes acceptance exposed an internal evidence ID inside one Haseeb draft and a Tarun lookup path that ignored retained Tarun corpus records. Both were corrected before production. Publishable copy now rejects internal IDs, and creator generation explicitly retrieves retained Haseeb or Tarun records alongside topical evidence.
- Automated verification: server and web production builds passed, all 91 server tests passed across 10 files, production dependency audits reported zero known vulnerabilities, deployment scripts passed shell syntax validation, and `git diff --check` passed.
- Browser verification: local, canary, and production builds each passed all 53 Chrome checks across desktop and 390-pixel mobile. Topics, topic detail, Timeline, event evidence, source reading, Prep, Haseeb generation and revision, Tarun blog output, citations, requested lengths, dark mode, overflow, requests, and console behavior passed.
- Real Hermes acceptance: a disposable copied database produced a five-point sourced Prep brief, a Haseeb post and revision, and a 314-word Tarun article with three resolved sources. Test drafts were discarded before promotion. These bounded canary checks used paid model calls; static browser and deployment checks did not.
- Production: image `mark-crypto-dashboard:20260904T141918Z` is healthy with zero restarts on `127.0.0.1:9330`. SQLite quick and integrity checks returned `ok`, foreign-key violations were zero, and production retained 66 events, 54 sources, and 89 media assets.
- Access and edge: Mark and Marimar origin identities returned HTTP `200`; missing identity returned HTTP `401`; public HTTPS redirected to Cloudflare Access; HTTP redirected to HTTPS; `intel.forkedbrain.fyi` remained HTTP `200`.
- Security: the container runs as non-root user `dashboard`, uses a read-only root filesystem, drops all capabilities, enables `no-new-privileges`, and publishes only on loopback.
- Recovery: retained rollback container `crypto-dashboard-rollback-20260903T163620Z`, previous image `mark-crypto-dashboard:20260903T163620Z`, database backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260904T141918Z/crypto-intelligence.db`, and deployment snapshot `/srv/mark-v2/crypto-dashboard/deploy.pre-20260904T141918Z`.
- Scope safety: Cloudflare configuration, Hermes provider configuration, OpenViking, Satoshi, ForkedBrain, and the legacy Intel service were unchanged.

## 2026-09-04 15:03-15:09 UTC: Creator format state boundary accepted

- Operator: Codex completing the final browser interaction edge found during source review.
- Status: completed and promoted as Crypto Intelligence release `20260904T150300Z`.
- Change: switching Haseeb bot or Tarun bot between tweet and blog now clears incompatible prior output, and completed output renders according to its saved format.
- Verification: server and web builds passed; all 91 server tests passed against a disposable database and live built server; all 54 Chrome checks passed locally, in the isolated production canary, and in production; no first-party request or browser console error occurred.
- Cost: no additional paid model call was made because the accepted Hermes workflows were unchanged.
- Production: image `mark-crypto-dashboard:20260904T150300Z` is healthy with zero restarts, 66 events, 54 sources, and 89 media assets.
- Recovery: retained rollback container `crypto-dashboard-rollback-20260904T141918Z`, previous image `mark-crypto-dashboard:20260904T141918Z`, database backup `/srv/mark-v2/crypto-dashboard/backups/pre-20260904T150300Z/crypto-intelligence.db`, and deployment snapshot `/srv/mark-v2/crypto-dashboard/deploy.pre-20260904T150300Z`.
- Scope safety: Cloudflare, Hermes, OpenViking, Satoshi, ForkedBrain, and the legacy Intel service were unchanged.
