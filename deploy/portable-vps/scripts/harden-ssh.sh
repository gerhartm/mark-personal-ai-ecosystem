#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi
if [[ "${CONFIRMED_SECOND_SSH_SESSION:-}" != "yes" ]]; then
  echo "Refusing: first prove a second key-based SSH session, then set CONFIRMED_SECOND_SSH_SESSION=yes." >&2
  exit 1
fi
if [[ ! -s /root/.ssh/authorized_keys ]]; then
  echo "Refusing: /root/.ssh/authorized_keys is empty." >&2
  exit 1
fi

target=/etc/ssh/sshd_config.d/99-personal-ai-hardening.conf
backup="${target}.before-$(date -u +%Y%m%dT%H%M%SZ)"
[[ ! -e "${target}" ]] || cp -a "${target}" "${backup}"

install -m 0644 /dev/null "${target}"
printf '%s\n' \
  'PermitRootLogin prohibit-password' \
  'PasswordAuthentication no' \
  'KbdInteractiveAuthentication no' \
  'PubkeyAuthentication yes' \
  'X11Forwarding no' \
  'MaxAuthTries 3' \
  'AllowAgentForwarding no' \
  'AllowTcpForwarding yes' \
  > "${target}"

sshd -t
systemctl reload ssh
echo "SSH hardening installed and sshd configuration validated. Keep the current session open until a fresh login succeeds."
