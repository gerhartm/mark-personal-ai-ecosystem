#!/usr/bin/env bash
set -euo pipefail

release="${1:?usage: promote-release.sh <release> <previous-release>}"
previous="${2:?usage: promote-release.sh <release> <previous-release>}"
compose=/srv/mark-v2/crypto-dashboard/deploy/docker-compose.production.yml
canary="crypto-dashboard-canary-${release}"
rollback="crypto-dashboard-rollback-${previous}"
backup_dir="/srv/mark-v2/crypto-dashboard/backups/pre-${release}"

test "$(docker inspect -f '{{.State.Health.Status}}' "$canary")" = healthy
test -z "$(docker ps -aq --filter "name=^/${rollback}$")"
grep -q "mark-crypto-dashboard:${release}" "$compose"
docker compose -f "$compose" config --quiet

install -d -m 0750 -o 1001 -g 1001 "$backup_dir"
docker run --rm \
  --network none \
  --mount type=bind,src=/srv/mark-v2/crypto-dashboard/data,dst=/source,readonly \
  --mount "type=bind,src=${backup_dir},dst=/dest" \
  "mark-crypto-dashboard:${release}" \
  node --input-type=module -e \
  "import Database from 'better-sqlite3'; const db = new Database('/source/crypto-intelligence.db', { readonly: true }); await db.backup('/dest/crypto-intelligence.db'); db.close();" >/dev/null
chmod 0640 "${backup_dir}/crypto-intelligence.db"

before="$(sha256sum /srv/mark-v2/crypto-dashboard/data/crypto-intelligence.db | awk '{print $1}')"
docker stop crypto-dashboard >/dev/null
docker rename crypto-dashboard "$rollback"
docker update --restart=no "$rollback" >/dev/null
docker compose -f "$compose" up -d

for _ in $(seq 1 30); do
  test "$(docker inspect -f '{{.State.Health.Status}}' crypto-dashboard)" = healthy && break
  sleep 1
done
test "$(docker inspect -f '{{.State.Health.Status}}' crypto-dashboard)" = healthy

test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9330/)" = 401
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9330/)" = 200

brief="$(curl -fsS -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9330/api/brief)"
jq -e '.counts.events == 66 and .counts.sources == 47 and .counts.media == 89' <<<"$brief" >/dev/null
test "$before" = "$(sha256sum /srv/mark-v2/crypto-dashboard/data/crypto-intelligence.db | awk '{print $1}')"

media_ref="$(curl -fsS -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9330/api/media | jq -r '.assets[0].archive_ref | @uri')"
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-31' -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' "http://127.0.0.1:9330/api/media/${media_ref}")" = 206

ask="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  -d '{"question":"What are the most significant themes in the stored crypto research?"}' \
  http://127.0.0.1:9330/api/ask)"
jq -e '.mode == "hermes" and .state == "connected" and (.answer | length > 40) and .evidence_count > 0' <<<"$ask" >/dev/null

docker rm -f "$canary" >/dev/null
rm -rf "/srv/mark-v2/crypto-dashboard/canary/${release}"

printf 'production=healthy\nrelease=%s\nstatic_without_identity=401\nstatic_with_identity=200\ncounts=66:47:89\nmedia_range=206\nask=connected\nrollback=%s\nbackup=%s\n' \
  "$release" "$rollback" "${backup_dir}/crypto-intelligence.db"
