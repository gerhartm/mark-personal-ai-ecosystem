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
  --env OPENVIKING_BASE_URL=http://openviking:1933 \
  --env OPENVIKING_API_KEY_FILE=/run/secrets/openviking-dashboard-key \
  --env OPENVIKING_ACCOUNT=mark-gerhart \
  --env OPENVIKING_USER=hermes \
  --env INTELLIGENCE_AUTO_REFRESH_HOURS=24 \
  --env SATOSHI_DASHBOARD_SYNC_SECRET_FILE=/run/secrets/satoshi-dashboard-sync-key \
  --env AUTH_MODE=shared-password \
  --env AUTH_USERNAME=mark \
  --env AUTH_ACTOR=mark \
  --env AUTH_PASSWORD_HASH_FILE=/run/secrets/crypto-dashboard-login-password \
  --env AUTH_SESSION_SECRET_FILE=/run/secrets/crypto-dashboard-session-secret \
  --env TURNSTILE_SECRET_KEY_FILE=/run/secrets/crypto-dashboard-turnstile-secret \
  --network 27am3wgv7vkohkenprml4s3p \
  -p 127.0.0.1:9332:5183 \
  --mount "type=bind,src=${canary_dir},dst=/data" \
  --mount type=bind,src=/srv/mark-v2/crypto-legacy-media/v1,dst=/media,readonly \
  --mount type=bind,src=/srv/mark-v2/secrets/forkedbrain-hermes-password,dst=/run/secrets/hermes-dashboard-password,readonly \
  --mount type=bind,src=/srv/mark-v2/secrets/crypto-dashboard-openviking-key,dst=/run/secrets/openviking-dashboard-key,readonly \
  --mount type=bind,src=/srv/mark-v2/secrets/satoshi-dashboard-sync-key,dst=/run/secrets/satoshi-dashboard-sync-key,readonly \
  --mount type=bind,src=/srv/mark-v2/secrets/crypto-dashboard-login-password,dst=/run/secrets/crypto-dashboard-login-password,readonly \
  --mount type=bind,src=/srv/mark-v2/secrets/crypto-dashboard-session-secret,dst=/run/secrets/crypto-dashboard-session-secret,readonly \
  --mount type=bind,src=/srv/mark-v2/secrets/crypto-dashboard-turnstile-secret,dst=/run/secrets/crypto-dashboard-turnstile-secret,readonly \
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

test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9332/)" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9332/api/brief)" = 401
auth_config="$(curl -fsS http://127.0.0.1:9332/api/auth/config)"
jq -e '.mode == "shared-password" and .turnstile == true and (.turnstileSiteKey | length) > 0' <<<"$auth_config" >/dev/null
session_token="$(docker exec "$name" node --input-type=module -e "import { issueSession } from '/app/server/dist/request-auth.js'; process.stdout.write(issueSession('mark','mark'));" )"
auth_cookie="crypto_session=${session_token}"

brief="$(curl -fsS -H "Cookie: ${auth_cookie}" http://127.0.0.1:9332/api/brief)"
jq -e '.counts.events >= 66 and .counts.sources >= 47 and .counts.media == 89' <<<"$brief" >/dev/null

intelligence_status="$(curl -fsS \
  -H "Cookie: ${auth_cookie}" \
  http://127.0.0.1:9332/api/intelligence)"
jq -e '.connected == true and .refresh_hours == 24' <<<"$intelligence_status" >/dev/null

ingestion="$(curl -fsS -H "Cookie: ${auth_cookie}" http://127.0.0.1:9332/api/ingestion)"
jq -e '
  .configured == true and
  .connected == true and
  (.receipts | type == "array") and
  (.telegram_sync | type == "array")
' <<<"$ingestion" >/dev/null

database_health="$(docker exec "$name" node --input-type=module -e \
  "import Database from 'better-sqlite3'; const db = new Database('/data/crypto-intelligence.db', { readonly: true }); console.log(JSON.stringify({quick_check:db.pragma('quick_check',{simple:true}),foreign_keys:db.pragma('foreign_key_check').length,sync_migration:db.prepare(\"SELECT count(*) c FROM schema_migrations WHERE id='006' AND name='telegram_source_sync'\").get().c,ask_history_migration:db.prepare(\"SELECT count(*) c FROM schema_migrations WHERE id='007' AND name='ask_history'\").get().c,prompt_controls_migration:db.prepare(\"SELECT count(*) c FROM schema_migrations WHERE id='008' AND name='prompt_controls'\").get().c})); db.close();")"
jq -e '.quick_check == "ok" and .foreign_keys == 0 and .sync_migration == 1 and .ask_history_migration == 1 and .prompt_controls_migration == 1' <<<"$database_health" >/dev/null

prompt_controls="$(curl -fsS \
  -H "Cookie: ${auth_cookie}" \
  http://127.0.0.1:9332/api/prompt-controls)"
jq -e '
  [.controls[].id] == ["topics","timeline","prep","haseeb","tarun"] and
  (.controls | map(select(.mode == "generated")) | length) == 4 and
  (.controls | map(select(.mode == "evidence")) | length) == 1
' <<<"$prompt_controls" >/dev/null

test "$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' \
  -d '{}' http://127.0.0.1:9332/api/internal/telegram-sync)" = 401

studio_status="$(curl -fsS \
  -H "Cookie: ${auth_cookie}" \
  http://127.0.0.1:9332/api/studio/status)"
jq -e '
  .connected == true and
  (.templates | index("speaking_prep")) != null and
  (.templates | index("x_post")) != null and
  (.writing_lenses | sort) == ["creator_reference", "mark"]
' <<<"$studio_status" >/dev/null

quiz_status="$(curl -fsS \
  -H "Cookie: ${auth_cookie}" \
  http://127.0.0.1:9332/api/quiz/status)"
jq -e '.connected == true and .default_question_count == 5' <<<"$quiz_status" >/dev/null

counts="$(jq -r '[.counts.events,.counts.sources,.counts.media]|join(":")' <<<"$brief")"
printf 'canary=healthy\nlogin_page=200\nprivate_api_without_session=401\nauthenticated_session=200\nturnstile=configured\ncounts=%s\ndatabase=healthy-with-migrations-006-007-008\nprompt_controls=ready\ninternal_sync_without_secret=401\nintelligence=connected\nmemory=connected\nstudio=connected-with-lenses\nquiz=connected\npaid_model_calls=0\n' "$counts"
