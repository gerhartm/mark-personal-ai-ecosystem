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
  --network 27am3wgv7vkohkenprml4s3p \
  -p 127.0.0.1:9331:5183 \
  --mount "type=bind,src=${canary_dir},dst=/data" \
  --mount type=bind,src=/srv/mark-v2/crypto-legacy-media/v1,dst=/media,readonly \
  --mount type=bind,src=/srv/mark-v2/secrets/forkedbrain-hermes-password,dst=/run/secrets/hermes-dashboard-password,readonly \
  --mount type=bind,src=/srv/mark-v2/secrets/crypto-dashboard-openviking-key,dst=/run/secrets/openviking-dashboard-key,readonly \
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

intelligence_status="$(curl -fsS \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  http://127.0.0.1:9331/api/intelligence)"
jq -e '.connected == true and .refresh_hours == 24' <<<"$intelligence_status" >/dev/null

intelligence="$(curl -fsS --max-time 240 -X POST \
  -H 'Content-Type: application/json' \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  -d '{}' \
  http://127.0.0.1:9331/api/intelligence/refresh)"
jq -e '
  (.brief.id | startswith("brief_")) and
  (.brief.headline | length > 8) and
  (.brief.summary | length > 30) and
  (.brief.changes | length > 0) and
  all(.brief.changes[]; (.source_url | test("^https?://")))
' <<<"$intelligence" >/dev/null

ingestion="$(curl -fsS -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' http://127.0.0.1:9331/api/ingestion)"
jq -e '.configured == true and .connected == true and (.receipts | type == "array")' <<<"$ingestion" >/dev/null

ask="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  -d '{"question":"What are the most significant themes in the stored crypto research?"}' \
  http://127.0.0.1:9331/api/ask)"
jq -e '.mode == "hermes" and .state == "connected" and (.answer | length > 40) and .evidence_count > 0' <<<"$ask" >/dev/null

studio_status="$(curl -fsS \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  http://127.0.0.1:9331/api/studio/status)"
jq -e '
  .connected == true and
  (.templates | index("speaking_prep")) != null and
  (.writing_lenses | sort) == ["creator_reference", "mark"]
' <<<"$studio_status" >/dev/null

studio_draft="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  -d '{"template_type":"speaking_prep","writing_lens":"mark","focus":"Aave protocol risk and market implications","date_from":"2026-04-01","date_to":"2026-07-04"}' \
  http://127.0.0.1:9331/api/studio/drafts)"
jq -e '(.id | startswith("draft_")) and (.body | length > 40) and (.citations | length > 0) and .revision == 0 and .writing_lens == "mark"' <<<"$studio_draft" >/dev/null
studio_id="$(jq -r '.id' <<<"$studio_draft")"
studio_citation="$(jq -r '.citations[0].id' <<<"$studio_draft")"
studio_revision_body="$(jq -cn --arg citation "$studio_citation" '{body: ("Canary revision preserving verified evidence [" + $citation + "].")}')"
studio_revision="$(curl -fsS -X PUT \
  -H 'Content-Type: application/json' \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  -d "$studio_revision_body" \
  "http://127.0.0.1:9331/api/drafts/${studio_id}")"
jq -e '.revision == 1 and (.citations | length > 0)' <<<"$studio_revision" >/dev/null
studio_saved="$(curl -fsS \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  "http://127.0.0.1:9331/api/drafts/${studio_id}")"
jq -e '(.raw_output != .edited_output) and (.revisions | length == 2) and (.citations | length > 0) and .writing_lens == "mark"' <<<"$studio_saved" >/dev/null

quiz_status="$(curl -fsS \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  http://127.0.0.1:9331/api/quiz/status)"
jq -e '.connected == true and .default_question_count == 5' <<<"$quiz_status" >/dev/null

quiz="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  -d '{"focus":"Aave protocol risk and durable implications","question_count":3}' \
  http://127.0.0.1:9331/api/quiz/sessions)"
jq -e '(.id | startswith("quiz_")) and (.questions | length == 3) and all(.questions[]; (.events | length) > 0)' <<<"$quiz" >/dev/null
quiz_id="$(jq -r '.id' <<<"$quiz")"
quiz_answers="$(jq -c '{answers: [.questions[] | {question_id: .id, answer_text: "This answer uses the linked stored evidence and explains the central fact, its implications, and why it matters."}]}' <<<"$quiz")"
quiz_graded="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H 'cf-access-authenticated-user-email: gerhartmark@gmail.com' \
  -d "$quiz_answers" \
  "http://127.0.0.1:9331/api/quiz/sessions/${quiz_id}/answers")"
jq -e '.completed_at != null and .score_total == 3 and (.questions | length == 3) and all(.questions[]; (.answer.feedback | length) > 0)' <<<"$quiz_graded" >/dev/null

printf 'canary=healthy\nstatic_without_identity=401\nstatic_with_identity=200\ncounts=66:47:89\nintelligence=live-sourced\nmemory=connected\nask=connected\nstudio=generated-cited-revised-with-lenses\nquiz=generated-evidence-linked-graded\n'
