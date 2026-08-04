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
backup_dir="${client_root}/.secrets/cloudflare-backups/${stamp}-crypto-cutover"
header_file="$(mktemp -t mark-cloudflare-header.XXXXXX)"
route_backup=""
access_changed=false
route_changed=false

cleanup() {
  rm -f "$header_file"
}

rollback() {
  code=$?
  trap - ERR
  if $route_changed && test -n "$route_backup"; then
    ssh mark-netcup-v2 "cp -a '$route_backup' /etc/cloudflared/config.yml && chmod 600 /etc/cloudflared/config.yml && cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate >/dev/null && systemctl restart cloudflared" || true
  fi
  if $access_changed; then
    curl -sS --fail-with-body --config "$header_file" -X PUT --data-binary "@${backup_dir}/access-rollback-payload.json" "$api" -o "${backup_dir}/access-rollback-response.json" || true
  fi
  printf 'cutover=rolled_back\nbackup=%s\n' "$backup_dir" >&2
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
printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' "$api_token" >"$header_file"
api_token=''

install -d -m 0700 "$backup_dir"
curl -sS --fail-with-body --config "$header_file" "$api" -o "${backup_dir}/access-app-before.json"
curl -sS --fail-with-body --config "$header_file" "${api}/policies/${policy_id}" -o "${backup_dir}/access-policy-before.json"

jq -e '.success == true' "${backup_dir}/access-app-before.json" >/dev/null
jq -e '.success == true' "${backup_dir}/access-policy-before.json" >/dev/null
jq -e '
  .result.type == "self_hosted" and
  .result.session_duration == "12h" and
  (([.result.destinations[].uri] | sort) == ["forkedbrain.fyi", "manage-realtime.forkedbrain.fyi", "manage.forkedbrain.fyi"] or
   ([.result.destinations[].uri] | sort) == ["crypto.forkedbrain.fyi", "forkedbrain.fyi", "manage-realtime.forkedbrain.fyi", "manage.forkedbrain.fyi"])
' "${backup_dir}/access-app-before.json" >/dev/null
jq -e '
  .result.decision == "allow" and
  ([.result.include[].email.email] | sort) == ["darshan@growthforgeai.com", "gerhartmark@gmail.com"] and
  (.result.exclude | length) == 0 and
  (.result.require | length) == 0
' "${backup_dir}/access-policy-before.json" >/dev/null

jq '
  .result | {
    type,
    name,
    domain,
    session_duration,
    destinations: ((.destinations + [{type: "public", uri: "crypto.forkedbrain.fyi"}]) | unique_by(.uri)),
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
curl -sS --fail-with-body --config "$header_file" -X PUT --data-binary "@${backup_dir}/access-update-payload.json" "$api" -o "${backup_dir}/access-update-response.json"
jq -e '.success == true and ([.result.destinations[].uri] | index("crypto.forkedbrain.fyi") != null)' "${backup_dir}/access-update-response.json" >/dev/null

route_backup="$(ssh mark-netcup-v2 'set -e; stamp=$(date -u +%Y%m%dT%H%M%SZ); backup=/srv/mark-v2/operator-backups/${stamp}-cloudflared-pre-crypto-live/config.yml; install -d -m 700 "$(dirname "$backup")"; cp -a /etc/cloudflared/config.yml "$backup"; printf "%s" "$backup"')"
route_changed=true
scp "${script_dir}/cloudflared-config.yml" mark-netcup-v2:/tmp/cloudflared-config.yml >/dev/null
ssh mark-netcup-v2 'set -e; install -o root -g root -m 600 /tmp/cloudflared-config.yml /etc/cloudflared/config.yml; rm /tmp/cloudflared-config.yml; cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate >/dev/null; systemctl restart cloudflared; systemctl is-active --quiet cloudflared'

crypto_ip="$(dig +short @1.1.1.1 "$hostname" A | head -1)"
test -n "$crypto_ip"
crypto_status=""
for _ in $(seq 1 20); do
  crypto_status="$(curl -sS -o /dev/null -w '%{http_code}' --resolve "${hostname}:443:${crypto_ip}" --max-time 15 "https://${hostname}/")"
  test "$crypto_status" = 302 && break
  sleep 2
done
test "$crypto_status" = 302
crypto_location="$(curl -sSI --resolve "${hostname}:443:${crypto_ip}" --max-time 15 "https://${hostname}/" | tr -d '\r' | awk 'tolower($1) == "location:" {print $2; exit}')"
case "$crypto_location" in
  https://*.cloudflareaccess.com/cdn-cgi/access/login/*) ;;
  *) false ;;
esac

test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://forkedbrain.fyi/)" = 302
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://brain.forkedbrain.fyi/)" = 302
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://manage.forkedbrain.fyi/)" = 302
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://manage-realtime.forkedbrain.fyi/ready)" = 302
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://intel.forkedbrain.fyi/)" = 200

curl -sS --fail-with-body --config "$header_file" "$api" -o "${backup_dir}/access-app-after.json"
curl -sS --fail-with-body --config "$header_file" "${api}/policies/${policy_id}" -o "${backup_dir}/access-policy-after.json"
jq -e '.success == true and ([.result.destinations[].uri] | sort) == ["crypto.forkedbrain.fyi", "forkedbrain.fyi", "manage-realtime.forkedbrain.fyi", "manage.forkedbrain.fyi"]' "${backup_dir}/access-app-after.json" >/dev/null
jq -e '.success == true and ([.result.include[].email.email] | sort) == ["darshan@growthforgeai.com", "gerhartmark@gmail.com"]' "${backup_dir}/access-policy-after.json" >/dev/null

trap - ERR
printf 'cutover=complete\ncrypto_status=302\nlegacy_intel_status=200\naccess_destinations=4\nroute_backup=%s\napi_backup=%s\n' "$route_backup" "$backup_dir"
