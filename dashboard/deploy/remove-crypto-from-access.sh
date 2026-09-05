#!/usr/bin/env bash
set -euo pipefail
umask 077

account_id="53df9ba2244060fc1597bcd81bd7f4b8"
application_id="529f193c-2aad-4acf-af00-05ad556b58d0"
policy_id="a5166e47-b9a3-4c51-82c2-977e0eacb171"
hostname="crypto.forkedbrain.fyi"
api="https://api.cloudflare.com/client/v4/accounts/${account_id}/access/apps/${application_id}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
client_root="$(cd "${script_dir}/../../.." && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${client_root}/.secrets/cloudflare-backups/${stamp}-crypto-access-removal"
header_file="$(mktemp -t mark-cloudflare-header.XXXXXX)"
access_changed=false

cleanup() {
  rm -f "$header_file"
}

rollback() {
  code=$?
  trap - ERR
  if $access_changed; then
    curl -sS --fail-with-body --config "$header_file" -X PUT \
      --data-binary "@${backup_dir}/access-rollback-payload.json" "$api" \
      -o "${backup_dir}/access-rollback-response.json" || true
  fi
  printf 'access_removal=rolled_back\nbackup=%s\n' "$backup_dir" >&2
  exit "$code"
}

trap cleanup EXIT

if test -t 0; then
  read -r -s -p 'Cloudflare API token: ' api_token
  printf '\n'
else
  IFS= read -r api_token || true
fi
test -n "${api_token:-}"
printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' \
  "$api_token" >"$header_file"
api_token=''

install -d -m 0700 "$backup_dir"
curl -sS --fail-with-body --config "$header_file" "$api" \
  -o "${backup_dir}/access-app-before.json"
curl -sS --fail-with-body --config "$header_file" "${api}/policies/${policy_id}" \
  -o "${backup_dir}/access-policy-before.json"

jq -e '
  .success == true and
  .result.type == "self_hosted" and
  .result.session_duration == "12h" and
  ([.result.destinations[].uri] | sort) == [
    "crypto.forkedbrain.fyi",
    "forkedbrain.fyi",
    "manage-realtime.forkedbrain.fyi",
    "manage.forkedbrain.fyi"
  ]
' "${backup_dir}/access-app-before.json" >/dev/null
jq -e '
  .success == true and
  .result.decision == "allow" and
  (.result.include | length) >= 1 and
  all(.result.include[]; (.email.email | type) == "string" and (.email.email | length) > 0) and
  (.result.exclude | length) == 0 and
  (.result.require | length) == 0
' "${backup_dir}/access-policy-before.json" >/dev/null
jq -S '.result | {id,name,decision,precedence,include,exclude,require}' \
  "${backup_dir}/access-policy-before.json" >"${backup_dir}/access-policy-contract-before.json"

jq '
  .result | {
    type,
    name,
    domain,
    session_duration,
    destinations: (.destinations | map(select(.uri != "crypto.forkedbrain.fyi"))),
    app_launcher_visible,
    allowed_idps,
    auto_redirect_to_identity,
    options_preflight_bypass,
    enable_binding_cookie,
    http_only_cookie_attribute,
    eager_redirect_cookie_setting,
    tags
  }
' "${backup_dir}/access-app-before.json" >"${backup_dir}/access-update-payload.json"

jq '.result | {
  type,
  name,
  domain,
  session_duration,
  destinations,
  app_launcher_visible,
  allowed_idps,
  auto_redirect_to_identity,
  options_preflight_bypass,
  enable_binding_cookie,
  http_only_cookie_attribute,
  eager_redirect_cookie_setting,
  tags
}' "${backup_dir}/access-app-before.json" >"${backup_dir}/access-rollback-payload.json"

trap rollback ERR
access_changed=true
curl -sS --fail-with-body --config "$header_file" -X PUT \
  --data-binary "@${backup_dir}/access-update-payload.json" "$api" \
  -o "${backup_dir}/access-update-response.json"

jq -e '
  .success == true and
  ([.result.destinations[].uri] | sort) == [
    "forkedbrain.fyi",
    "manage-realtime.forkedbrain.fyi",
    "manage.forkedbrain.fyi"
  ]
' "${backup_dir}/access-update-response.json" >/dev/null

crypto_status=''
for _ in $(seq 1 20); do
  crypto_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://${hostname}/")"
  test "$crypto_status" = 200 && break
  sleep 2
done
test "$crypto_status" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://${hostname}/api/brief")" = 401
auth_config="$(curl -fsS --max-time 15 "https://${hostname}/api/auth/config")"
jq -e '
  .mode == "shared-password" and
  .turnstile == true and
  (.turnstileSiteKey | length) > 0 and
  (.turnstileSiteKey != "1x00000000000000000000AA") and
  (.turnstileSiteKey != "2x00000000000000000000AB") and
  (.turnstileSiteKey != "1x00000000000000000000BB")
' <<<"$auth_config" >/dev/null
session_state="$(curl -fsS --max-time 15 "https://${hostname}/api/auth/session")"
jq -e '.authenticated == false and .actor == ""' <<<"$session_state" >/dev/null

test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://forkedbrain.fyi/)" = 302
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://manage.forkedbrain.fyi/)" = 302
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://manage-realtime.forkedbrain.fyi/ready)" = 302
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://intel.forkedbrain.fyi/)" = 200

curl -sS --fail-with-body --config "$header_file" "$api" \
  -o "${backup_dir}/access-app-after.json"
curl -sS --fail-with-body --config "$header_file" "${api}/policies/${policy_id}" \
  -o "${backup_dir}/access-policy-after.json"

jq -e '
  .success == true and
  ([.result.destinations[].uri] | sort) == [
    "forkedbrain.fyi",
    "manage-realtime.forkedbrain.fyi",
    "manage.forkedbrain.fyi"
  ]
' "${backup_dir}/access-app-after.json" >/dev/null
jq -e '
  .success == true
' "${backup_dir}/access-policy-after.json" >/dev/null
jq -S '.result | {id,name,decision,precedence,include,exclude,require}' \
  "${backup_dir}/access-policy-after.json" >"${backup_dir}/access-policy-contract-after.json"
cmp -s \
  "${backup_dir}/access-policy-contract-before.json" \
  "${backup_dir}/access-policy-contract-after.json"

trap - ERR
printf 'access_removal=complete\ncrypto_login_status=200\ncrypto_private_api_status=401\nturnstile=production\naccess_destinations=3\nlegacy_intel_status=200\nbackup=%s\n' \
  "$backup_dir"
