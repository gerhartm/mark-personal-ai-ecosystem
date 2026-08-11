#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:-}"
case "${mode}" in
  platform|apps|all) ;;
  *) echo "Usage: sudo bash $0 {platform|apps|all}" >&2; exit 2 ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
kit_dir="$(cd "${script_dir}/.." && pwd)"
compose_file="${kit_dir}/docker-compose.yml"
env_file="${kit_dir}/.env"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi
if [[ ! -f "${env_file}" ]]; then
  echo "Missing ${env_file}. Copy .env.example to .env and edit it first." >&2
  exit 1
fi
command -v docker >/dev/null || { echo "Docker is not installed." >&2; exit 1; }
docker compose version >/dev/null

set -a
source "${env_file}"
set +a

compose=(docker compose --env-file "${env_file}" -f "${compose_file}")
"${compose[@]}" --profile apps config -q

deploy_platform() {
  "${compose[@]}" pull hermes openviking
  "${compose[@]}" up -d hermes openviking
}

require_private_file() {
  local path="$1"
  [[ -f "${path}" && -s "${path}" ]] || {
    echo "Required private input is missing or empty: ${path}" >&2
    exit 1
  }
}

deploy_apps() {
  require_private_file "${SECRETS_ROOT:?}/hermes-dashboard-password"
  require_private_file "${SECRETS_ROOT:?}/openviking-dashboard-key"
  require_private_file "${SECRETS_ROOT:?}/satoshi-dashboard-sync-key"
  require_private_file "${DATA_ROOT:?}/crypto-dashboard/crypto-intelligence.db"

  chmod 0600 \
    "${SECRETS_ROOT}/hermes-dashboard-password" \
    "${SECRETS_ROOT}/openviking-dashboard-key" \
    "${SECRETS_ROOT}/satoshi-dashboard-sync-key"
  chown 1001:1001 \
    "${DATA_ROOT}/crypto-dashboard" \
    "${DATA_ROOT}/crypto-dashboard/crypto-intelligence.db"
  chmod 0640 "${DATA_ROOT}/crypto-dashboard/crypto-intelligence.db"

  "${compose[@]}" --profile apps build --pull forkedbrain crypto-dashboard
  "${compose[@]}" --profile apps up -d
}

case "${mode}" in
  platform) deploy_platform ;;
  apps) deploy_apps ;;
  all) deploy_platform; deploy_apps ;;
esac

"${compose[@]}" --profile apps ps
