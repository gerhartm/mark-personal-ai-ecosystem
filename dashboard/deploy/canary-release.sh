#!/usr/bin/env bash
set -euo pipefail

release="${1:?usage: canary-release.sh <release>}"
name="crypto-dashboard-canary-${release}"
canary_dir="/srv/mark-v2/crypto-dashboard/canary/${release}"

test ! -e "$canary_dir"
install -d -m 0750 -o 1001 -g 1001 "$canary_dir"
docker run --rm \
  --network none \
  --mount type=bind,src=/srv/mark-v2/crypto-dashboard/data,dst=/source,readonly \
  --mount "type=bind,src=${canary_dir},dst=/dest" \
  "mark-crypto-dashboard:${release}" \
  node --input-type=module -e \
  "import Database from 'better-sqlite3'; const db = new Database('/source/crypto-intelligence.db', { readonly: true }); await db.backup('/dest/crypto-intelligence.db'); db.close();" >/dev/null
chown 1001:1001 "${canary_dir}/crypto-intelligence.db"
chmod 0640 "${canary_dir}/crypto-intelligence.db"

docker run -d \
  --name "$name" \
  --env-file /srv/mark-v2/secrets/crypto-dashboard.env \
  --network 27am3wgv7vkohkenprml4s3p \
  -p 127.0.0.1:9331:5183 \
  --mount "type=bind,src=${canary_dir},dst=/data" \
  --mount type=bind,src=/srv/mark-v2/crypto-legacy-media/v1,dst=/media,readonly \
  --mount type=bind,src=/srv/mark-v2/secrets/forkedbrain-hermes-password,dst=/run/secrets/hermes-dashboard-password,readonly \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --memory 2g \
  --cpus 2 \
  --pids-limit 256 \
  "mark-crypto-dashboard:${release}" >/dev/null

for _ in $(seq 1 30); do
  test "$(docker inspect -f '{{.State.Health.Status}}' "$name")" = healthy && break
  sleep 1
done
test "$(docker inspect -f '{{.State.Health.Status}}' "$name")" = healthy

test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9331/)" = 401
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9331/)" = 200

brief="$(curl -fsS -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9331/api/brief)"
jq -e '.counts.events == 66 and .counts.sources == 47 and .counts.media == 89' <<<"$brief" >/dev/null

ask="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  -d '{"question":"What are the most significant themes in the stored crypto research?"}' \
  http://127.0.0.1:9331/api/ask)"
jq -e '.mode == "hermes" and .state == "connected" and (.answer | length > 40) and .evidence_count > 0' <<<"$ask" >/dev/null

printf 'canary=healthy\nstatic_without_identity=401\nstatic_with_identity=200\ncounts=66:47:89\nask=connected\n'
