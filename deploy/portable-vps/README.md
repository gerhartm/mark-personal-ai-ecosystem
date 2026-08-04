# Portable Personal AI VPS Deployment Kit

This directory reproduces the **software architecture** of the accepted Personal AI Ecosystem on a fresh VPS. It is deliberately not a clone of Mark's private data.

## What this gives you

- Ubuntu host preparation and security checks.
- Docker and optional self-hosted Coolify management.
- The pinned, unmodified Hermes central brain.
- The pinned, private OpenViking memory service used natively by Hermes.
- Buildable ForkedBrain and Crypto Intelligence applications.
- Loopback-only application origins, resource limits and container hardening.
- Staged deployment, health verification and a portable source bundle.

## What is intentionally not included

- Crypto databases, OpenViking memories, media or uploaded documents.
- Hermes/OpenViking/Coolify persistent state.
- Passwords, API keys, Cloudflare tokens, SSH keys or provider credentials.
- DNS records, Cloudflare Access policies or server-specific tunnel credentials.
- Build output, dependency directories, logs or operating-system junk.

After deployment, the stack is the same system with fresh state. Restoring Mark's existing content is a separate owner-controlled data operation.

## Supported recovery target

Use a fresh **Ubuntu 24.04 LTS AMD64** VPS with root or passwordless-sudo access.

| Resource | Required for this stack |
|---|---:|
| CPU | 8 vCPU recommended; 4 vCPU minimum |
| RAM | 16 GiB recommended and used by the accepted system |
| Disk | 100 GiB minimum; 250+ GiB preferred for media and backups |
| Swap | 8 GiB |
| Network | Public IPv4 or IPv6, outbound HTTPS, inbound SSH/HTTP/HTTPS |

The package is provider-independent. Netcup, Hetzner, Hostinger or another VPS provider is acceptable when the requirements above are met.

## Deployment sequence

### 1. Secure access first

Install an operator public key and prove a second key-based SSH session works. Do not disable password login until that succeeds.

### 2. Prepare the host

From this repository on the fresh server:

```bash
sudo bash deploy/portable-vps/scripts/bootstrap-host.sh --install-coolify
```

The script validates the host, applies updates, configures UTC, swap, unattended security updates, UFW and SSD trim, then optionally runs Coolify's official installer. It does **not** change SSH authentication.

When Coolify is installed, the bootstrap immediately applies the included loopback-only override for its dashboard, realtime and terminal ports. Access the initial setup through an SSH tunnel until protected HTTPS ingress exists:

```bash
ssh -L 8000:127.0.0.1:8000 root@REPLACE_VPS_IP
```

Then open `http://127.0.0.1:8000` and create the owner administrator before continuing.

After proving a second key-only session:

```bash
sudo CONFIRMED_SECOND_SSH_SESSION=yes \
  bash deploy/portable-vps/scripts/harden-ssh.sh
```

### 3. Create the runtime contract

```bash
cd deploy/portable-vps
cp .env.example .env
chmod 600 .env
sudo bash scripts/prepare-runtime.sh
```

Edit `.env` before deployment. It contains identifiers and paths only; raw credentials remain in owner-only files under `SECRETS_ROOT`.

### 4. Supply fresh configuration and secrets

Configure Hermes and OpenViking through their native setup paths. Do not patch either product and do not add another agent, vector database or memory service.

Required private files for the application layer:

```text
SECRETS_ROOT/hermes-dashboard-password
SECRETS_ROOT/openviking-dashboard-key
```

Required data inputs for the application layer:

```text
DATA_ROOT/forkedbrain/crypto-intelligence.db
DATA_ROOT/crypto-dashboard/crypto-intelligence.db
DATA_ROOT/media/                              # may be empty
```

Those database files may be blank schema-compatible databases or separately restored owner data. They are not part of this kit.

### 5. Deploy in two small stages

```bash
# Hermes and OpenViking first
sudo bash scripts/deploy.sh platform

# ForkedBrain and Crypto after private inputs exist
sudo bash scripts/deploy.sh apps
```

`deploy.sh all` performs both stages. The application images are built from the bundled source; no private image registry is required.

### 6. Verify before exposure

```bash
sudo bash scripts/verify.sh
```

Keep `9119`, `9320`, `9330`, `8000`, `6001` and `6002` bound to loopback. Publish them only through an authenticated reverse tunnel or an equivalently protected private ingress. Do not expose OpenViking port `1933` at all.

DNS, tunnel and identity policies are intentionally deployment-specific. Use `cloudflared-config.yml.example` only after the owner approves the hostnames and access list.

## Coolify boundary

Coolify is included as the management layer, but the application definition is standard Docker Compose. This makes disaster recovery independent of Coolify's internal database: the same stack can be started directly while the management UI is restored or rebuilt.

The official Coolify installer is deliberately downloaded at install time and its SHA-256 is printed before execution. Core AI images are digest-pinned in `docker-compose.yml`; `manifest.env` records the accepted control-plane versions for comparison.

## Recovery rule

Restore in this order:

1. Host and SSH/firewall baseline.
2. Docker/Coolify.
3. Hermes and OpenViking native configuration.
4. Owner-controlled databases, memories and media if required.
5. ForkedBrain and Crypto applications.
6. Private ingress, DNS and identity policy.
7. Full verification.

Never restore production data into a public or unprotected application origin.
