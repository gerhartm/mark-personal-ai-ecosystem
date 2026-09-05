#!/usr/bin/env bash
set -euo pipefail

release="${1:?usage: promote-release.sh <release> <previous-release>}"
previous="${2:?usage: promote-release.sh <release> <previous-release>}"
project="crypto-dashboard-${release,,}"
compose=/srv/mark-v2/crypto-dashboard/deploy/docker-compose.production.yml
canary="crypto-dashboard-canary-${release}"
rollback="crypto-dashboard-rollback-${previous}"
backup_dir="/srv/mark-v2/crypto-dashboard/backups/pre-${release}"

test "$(docker inspect -f '{{.State.Health.Status}}' "$canary")" = healthy
test -z "$(docker ps -aq --filter "name=^/${rollback}$")"
grep -q "mark-crypto-dashboard:${release}" "$compose"
docker compose -f "$compose" config --quiet

install -d -m 0750 -o 1001 -g 1001 "$backup_dir"
if [ ! -f "${backup_dir}/crypto-intelligence.db" ]; then
  docker run --rm \
    --network none \
    --mount type=bind,src=/srv/mark-v2/crypto-dashboard/data,dst=/source,readonly \
    --mount "type=bind,src=${backup_dir},dst=/dest" \
    "mark-crypto-dashboard:${release}" \
    node --input-type=module -e \
    "import Database from 'better-sqlite3'; const db = new Database('/source/crypto-intelligence.db', { readonly: true }); await db.backup('/dest/crypto-intelligence.db'); db.close();" >/dev/null
fi
chmod 0640 "${backup_dir}/crypto-intelligence.db"

before_counts="$(docker run --rm \
  --network none \
  --mount "type=bind,src=${backup_dir},dst=/backup" \
  "mark-crypto-dashboard:${release}" \
  node --input-type=module -e \
  "import Database from 'better-sqlite3'; const db = new Database('/backup/crypto-intelligence.db', { readonly: true }); console.log(JSON.stringify({sources:db.prepare('SELECT count(*) c FROM sources').get().c,events:db.prepare('SELECT count(*) c FROM events').get().c,media:db.prepare('SELECT count(*) c FROM media_assets').get().c})); db.close();")"
docker stop crypto-dashboard >/dev/null
docker rename crypto-dashboard "$rollback"
docker update --restart=no "$rollback" >/dev/null
# Give every release its own Compose project identity. Reusing the default
# project name causes Compose to adopt and recreate the renamed predecessor,
# defeating the stopped-container rollback we intentionally keep above.
docker compose -p "$project" -f "$compose" up -d

for _ in $(seq 1 30); do
  test "$(docker inspect -f '{{.State.Health.Status}}' crypto-dashboard)" = healthy && break
  sleep 1
done
test "$(docker inspect -f '{{.State.Health.Status}}' crypto-dashboard)" = healthy

test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9330/)" = 401
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9330/)" = 200

brief="$(curl -fsS -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9330/api/brief)"
jq -e --argjson before "$before_counts" '
  .counts.events >= $before.events and
  .counts.sources >= $before.sources and
  .counts.media >= $before.media
' <<<"$brief" >/dev/null

database_health="$(docker exec crypto-dashboard node --input-type=module -e \
  "import Database from 'better-sqlite3'; const db = new Database('/data/crypto-intelligence.db', { readonly: true }); console.log(JSON.stringify({quick_check:db.pragma('quick_check',{simple:true}),foreign_keys:db.pragma('foreign_key_check').length,sync_migration:db.prepare(\"SELECT count(*) c FROM schema_migrations WHERE id='006' AND name='telegram_source_sync'\").get().c,ask_history_migration:db.prepare(\"SELECT count(*) c FROM schema_migrations WHERE id='007' AND name='ask_history'\").get().c,prompt_controls_migration:db.prepare(\"SELECT count(*) c FROM schema_migrations WHERE id='008' AND name='prompt_controls'\").get().c})); db.close();")"
jq -e '.quick_check == "ok" and .foreign_keys == 0 and .sync_migration == 1 and .ask_history_migration == 1 and .prompt_controls_migration == 1' <<<"$database_health" >/dev/null

prompt_controls="$(curl -fsS \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  http://127.0.0.1:9330/api/prompt-controls)"
jq -e '
  [.controls[].id] == ["topics","timeline","prep","haseeb","tarun"] and
  (.controls | map(select(.mode == "generated")) | length) == 4 and
  (.controls | map(select(.mode == "evidence")) | length) == 1
' <<<"$prompt_controls" >/dev/null

intelligence_status="$(curl -fsS \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  http://127.0.0.1:9330/api/intelligence)"
jq -e '.connected == true and .refresh_hours == 24' <<<"$intelligence_status" >/dev/null

ingestion="$(curl -fsS -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9330/api/ingestion)"
jq -e '.configured == true and .connected == true and (.receipts | type == "array")' <<<"$ingestion" >/dev/null

media_ref="$(curl -fsS -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9330/api/media | jq -r '.assets[0].archive_ref | @uri')"
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-31' -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' "http://127.0.0.1:9330/api/media/${media_ref}")" = 206

studio_status="$(curl -fsS \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  http://127.0.0.1:9330/api/studio/status)"
jq -e '
  .connected == true and
  (.templates | length == 6) and
  (.templates | index("x_post")) != null and
  (.writing_lenses | sort) == ["creator_reference", "mark"]
' <<<"$studio_status" >/dev/null

quiz_status="$(curl -fsS \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  http://127.0.0.1:9330/api/quiz/status)"
jq -e '.connected == true and .default_question_count == 5' <<<"$quiz_status" >/dev/null

docker rm -f "$canary" >/dev/null
rm -rf "/srv/mark-v2/crypto-dashboard/canary/${release}"

counts="$(jq -r '[.counts.events,.counts.sources,.counts.media]|join(":")' <<<"$brief")"
printf 'production=healthy\nrelease=%s\nstatic_without_identity=401\nstatic_with_identity=200\ncounts=%s\ndatabase=healthy-with-migrations-006-007-008\nprompt_controls=ready\nintelligence=connected\nmemory=connected\nmedia_range=206\nstudio=connected-with-lenses\nquiz=connected\nrollback=%s\nbackup=%s\n' \
  "$release" "$counts" "$rollback" "${backup_dir}/crypto-intelligence.db"
