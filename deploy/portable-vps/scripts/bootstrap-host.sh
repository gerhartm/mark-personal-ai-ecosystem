#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install_coolify=false
if [[ "${1:-}" == "--install-coolify" ]]; then
  install_coolify=true
elif [[ $# -ne 0 ]]; then
  echo "Usage: sudo bash $0 [--install-coolify]" >&2
  exit 2
fi

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

source /etc/os-release
arch="$(dpkg --print-architecture)"
ram_kib="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
disk_gib="$(df -Pk / | awk 'NR==2 {printf "%d", $2 / 1024 / 1024}')"

[[ "${ID}" == "ubuntu" && "${VERSION_ID}" == "24.04" ]] || {
  echo "Expected Ubuntu 24.04 LTS; found ${ID} ${VERSION_ID}." >&2
  exit 1
}
[[ "${arch}" == "amd64" ]] || {
  echo "Expected AMD64; found ${arch}." >&2
  exit 1
}
(( ram_kib >= 7500000 )) || {
  echo "At least 8 GiB RAM is required; 16 GiB is recommended." >&2
  exit 1
}
(( disk_gib >= 100 )) || {
  echo "At least 100 GiB root storage is required." >&2
  exit 1
}

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y full-upgrade
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git jq rsync ufw unattended-upgrades

timedatectl set-timezone UTC

if ! swapon --show=NAME --noheadings | grep -q .; then
  fallocate -l 8G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -qE '^/swapfile[[:space:]]' /etc/fstab || \
    printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

install -m 0644 /dev/null /etc/sysctl.d/99-personal-ai.conf
printf '%s\n' 'vm.swappiness=10' 'vm.vfs_cache_pressure=50' \
  > /etc/sysctl.d/99-personal-ai.conf
sysctl --system >/dev/null

install -m 0644 /dev/null /etc/apt/apt.conf.d/20auto-upgrades
printf '%s\n' \
  'APT::Periodic::Update-Package-Lists "1";' \
  'APT::Periodic::Unattended-Upgrade "1";' \
  > /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now fstrim.timer

ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

if ${install_coolify}; then
  installer="$(mktemp)"
  trap 'rm -f "${installer}"' EXIT
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh -o "${installer}"
  echo "Coolify installer SHA-256: $(sha256sum "${installer}" | awk '{print $1}')"
  bash "${installer}"
  bash "${script_dir}/configure-coolify-loopback.sh"
fi

echo "Host bootstrap complete."
echo "SSH authentication was not changed. Prove a second key-based session, then run harden-ssh.sh."
echo "Docker-published ports can bypass UFW; configure the VPS provider firewall before exposure."
