#!/usr/bin/env bash
set -euo pipefail

token_file=/root/mark-v2-staging/coolify-openviking-token
token_name=mark-openviking-deploy-20260731

case "${1:-}" in
  open)
    umask 077
    rm -f "$token_file"
    docker exec coolify php artisan tinker --execute='session(["currentTeam" => \App\Models\Team::find(0)]); $u=\App\Models\User::find(0); $t=$u->createToken("mark-openviking-deploy-20260731", ["read", "read:sensitive", "write", "write:sensitive", "deploy"], now()->addHours(2)); echo $t->plainTextToken;' > "$token_file"
    chmod 0600 "$token_file"
    docker exec coolify php artisan tinker --execute='$s=\App\Models\InstanceSettings::get(); $s->is_api_enabled=true; $s->save();' >/dev/null
    ;;
  close)
    docker exec coolify php artisan tinker --execute='$u=\App\Models\User::find(0); $u->tokens()->where("name", "mark-openviking-deploy-20260731")->delete(); $s=\App\Models\InstanceSettings::get(); $s->is_api_enabled=false; $s->save();' >/dev/null
    if [[ -f "$token_file" ]]; then
      shred -u "$token_file"
    fi
    ;;
  *)
    echo "Usage: $0 open|close" >&2
    exit 2
    ;;
esac
