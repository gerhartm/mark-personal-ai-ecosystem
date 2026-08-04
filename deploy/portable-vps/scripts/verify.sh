#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
kit_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${kit_dir}/.env"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi
[[ -f "${env_file}" ]] || { echo "Missing ${env_file}." >&2; exit 1; }

set -a
source "${env_file}"
set +a

failures=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; failures=$((failures + 1)); }

source /etc/os-release
[[ "${ID}" == ubuntu && "${VERSION_ID}" == 24.04 ]] && pass "Ubuntu 24.04" || fail "unexpected OS ${ID} ${VERSION_ID}"
[[ "$(dpkg --print-architecture)" == amd64 ]] && pass "AMD64 architecture" || fail "unexpected architecture"
docker info >/dev/null 2>&1 && pass "Docker daemon" || fail "Docker daemon unavailable"
docker compose version >/dev/null 2>&1 && pass "Docker Compose" || fail "Docker Compose unavailable"

for container in mark-hermes mark-openviking; do
  state="$(docker inspect "${container}" --format '{{.State.Status}}' 2>/dev/null || true)"
  [[ "${state}" == running ]] && pass "${container} running" || fail "${container} is ${state:-missing}"
done

for container in mark-forkedbrain mark-crypto-dashboard; do
  if docker inspect "${container}" >/dev/null 2>&1; then
    state="$(docker inspect "${container}" --format '{{.State.Status}}')"
    health="$(docker inspect "${container}" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
    [[ "${state}" == running && "${health}" == healthy ]] \
      && pass "${container} running and healthy" \
      || fail "${container} state=${state} health=${health}"

    readonly="$(docker inspect "${container}" --format '{{.HostConfig.ReadonlyRootfs}}')"
    user="$(docker inspect "${container}" --format '{{.Config.User}}')"
    security="$(docker inspect "${container}" --format '{{json .HostConfig.SecurityOpt}}')"
    [[ "${readonly}" == true ]] && pass "${container} read-only root" || fail "${container} writable root"
    [[ -n "${user}" && "${user}" != root && "${user}" != 0 ]] \
      && pass "${container} non-root user ${user}" \
      || fail "${container} root user"
    [[ "${security}" == *no-new-privileges:true* ]] \
      && pass "${container} no-new-privileges" \
      || fail "${container} missing no-new-privileges"
  fi
done

for container in mark-hermes mark-forkedbrain mark-crypto-dashboard coolify coolify-realtime; do
  if docker inspect "${container}" >/dev/null 2>&1; then
    while IFS= read -r binding; do
      [[ -z "${binding}" || "${binding}" == 127.0.0.1:* || "${binding}" == ::1:* ]] \
        || fail "${container} has non-loopback binding ${binding}"
    done < <(docker port "${container}" 2>/dev/null | awk '{print $3}')
  fi
done
pass "application port binding scan completed"

openviking_ports="$(docker port mark-openviking 2>/dev/null || true)"
[[ -z "${openviking_ports}" ]] && pass "OpenViking has no host port" || fail "OpenViking publishes ${openviking_ports}"

for secret in "${SECRETS_ROOT}/hermes-dashboard-password" "${SECRETS_ROOT}/openviking-dashboard-key"; do
  if [[ -e "${secret}" ]]; then
    mode="$(stat -c '%a' "${secret}")"
    (( (8#${mode} & 8#077) == 0 )) \
      && pass "private mode ${mode} on ${secret}" \
      || fail "unsafe mode ${mode} on ${secret}"
  fi
done

for container in mark-hermes mark-openviking mark-forkedbrain mark-crypto-dashboard; do
  if docker inspect "${container}" >/dev/null 2>&1; then
    if docker inspect "${container}" --format '{{range .Config.Env}}{{println .}}{{end}}' \
      | grep -Eq '(^|_)(API_KEY|PASSWORD|TOKEN|SECRET)=[^[:space:]]+'; then
      fail "${container} contains a raw secret-like environment value"
    else
      pass "${container} has no raw secret-like environment value"
    fi
  fi
done

if (( failures > 0 )); then
  echo "Verification failed: ${failures} check(s)." >&2
  exit 1
fi
echo "Portable stack verification passed."
