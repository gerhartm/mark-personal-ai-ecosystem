#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
kit_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${kit_dir}/.env"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi
if [[ ! -f "${env_file}" ]]; then
  echo "Missing ${env_file}. Copy .env.example to .env and edit it first." >&2
  exit 1
fi

set -a
source "${env_file}"
set +a

safe_path() {
  local label="$1" value="$2"
  [[ "${value}" == /* && "${value}" != "/" && "${value}" != "/srv" ]] || {
    echo "Unsafe ${label}: ${value}" >&2
    exit 1
  }
}

safe_path STATE_ROOT "${STATE_ROOT:?STATE_ROOT is required}"
safe_path DATA_ROOT "${DATA_ROOT:?DATA_ROOT is required}"
safe_path SECRETS_ROOT "${SECRETS_ROOT:?SECRETS_ROOT is required}"

install -d -m 0750 \
  "${STATE_ROOT}/hermes" \
  "${STATE_ROOT}/openviking" \
  "${DATA_ROOT}/crypto-dashboard" \
  "${DATA_ROOT}/media"
install -d -m 0700 "${SECRETS_ROOT}"

# Both first-party application images run as UID/GID 1001.
chown 1001:1001 "${DATA_ROOT}/crypto-dashboard"
chmod 0750 "${DATA_ROOT}/crypto-dashboard"

echo "Runtime directories prepared."
echo "Still required before the app stage:"
printf '  %s\n' \
  "${SECRETS_ROOT}/hermes-dashboard-password" \
  "${SECRETS_ROOT}/openviking-dashboard-key" \
  "${SECRETS_ROOT}/satoshi-dashboard-sync-key" \
  "${DATA_ROOT}/crypto-dashboard/crypto-intelligence.db"
