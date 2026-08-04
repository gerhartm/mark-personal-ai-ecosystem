#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template="${script_dir}/../templates/docker-compose.coolify-loopback.yml"
source_dir=/data/coolify/source
target="${source_dir}/docker-compose.custom.yml"

for required in "${template}" "${source_dir}/docker-compose.yml" "${source_dir}/docker-compose.prod.yml" "${source_dir}/.env"; do
  [[ -f "${required}" ]] || { echo "Missing Coolify input: ${required}" >&2; exit 1; }
done

if [[ -e "${target}" ]] && ! cmp -s "${template}" "${target}"; then
  echo "Refusing to overwrite an existing different Coolify custom override: ${target}" >&2
  exit 1
fi

install -m 0644 "${template}" "${target}"
cd "${source_dir}"
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.custom.yml \
  config -q
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.custom.yml \
  up -d

for port in 8000 6001 6002; do
  if ss -lntH | awk '{print $4}' | grep -Eq "(^|:)${port}$"; then
    if ss -lntH | awk '{print $4}' | grep -Eq "^(0\.0\.0\.0|\[::\]|\*):${port}$"; then
      echo "Coolify port ${port} is still publicly bound." >&2
      exit 1
    fi
  fi
done
echo "Coolify dashboard, realtime and terminal ports are loopback-only."
