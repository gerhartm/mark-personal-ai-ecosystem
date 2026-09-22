#!/usr/bin/env python3
"""External, targeted recovery of Satoshi's persisted OpenAI quota block.

The host schedules checks. The worker runs via stdin as the Hermes user inside
the existing container; credentials never leave it. No container restart path.
"""
import datetime as dt
import email.utils
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

CONTAINER = "hermes-27am3wgv7vkohkenprml4s3p"
PYTHON = "/opt/hermes/.venv/bin/python"
HERMES = "/opt/hermes/.venv/bin/hermes"
PROVIDER = "openai-api"
CREDENTIAL = "530a65"
MODEL = "gpt-5.6-sol"
BASE_URL = "https://api.openai.com/v1"
STATE_DIR = Path("/var/lib/mark-hermes-recovery")
GRACE = 120
RESET_INTERVAL = 900
BACKOFF = (120, 300, 600, 900)
REASONS = frozenset({"credit_balance_exhausted", "insufficient_quota", "rate_limit_exceeded"})
STATUS_FIELDS = ("last_status", "last_status_at", "last_error_code", "last_error_reason",
                 "last_error_message", "last_error_reset_at", "failure_reason")


def epoch(value):
    try:
        number = float(value)
    except (ValueError, TypeError):
        try:
            stamp = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                return None
            number = stamp.timestamp()
        except ValueError:
            return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number / 1000 if number > 1_000_000_000_000 else number


def inspect_data(auth, model, routing, now):
    """Fail closed if routing, credential selection, or error semantics changed."""
    entries = auth.get("credential_pool", {}).get(PROVIDER, [])
    if (len(entries) != 1 or entries[0].get("id") != CREDENTIAL
            or model.get("provider") != PROVIDER or model.get("default") != MODEL):
        return {"status": "unsupported_setup"}
    entry = entries[0]
    urls = [entry.get("base_url"), model.get("base_url"), routing.get("OPENAI_BASE_URL"),
            routing.get("OPENAI_API_BASE")]
    if (entry.get("auth_type") != "api_key" or entry.get("source") != "manual"
            or not entry.get("access_token")
            or any(url and str(url).rstrip("/") != BASE_URL for url in urls)
            or any(routing.get(k) for k in ("OPENAI_ORG_ID", "OPENAI_ORGANIZATION", "OPENAI_PROJECT_ID"))
            or routing.get("alternate_routing") or routing.get("different_env_key")):
        return {"status": "unsupported_setup"}
    if entry.get("last_status") in (None, "", "ok") and not entry.get("last_error_code"):
        return {"status": "healthy"}
    reason = entry.get("last_error_reason")
    if not reason:
        # Older entries kept the provider code only in the serialized error.
        codes = re.findall(r'''["'](?:code|type)["']\s*:\s*["']([a-z_]+)["']''',
                           entry.get("last_error_message") or "")
        reason = next((code for code in codes if code in REASONS), None)
    if (entry.get("last_status") != "exhausted"
            or str(entry.get("last_error_code")) not in ("402", "429") or reason not in REASONS):
        return {"status": "ignored_error"}
    blocked_at = epoch(entry.get("last_status_at"))
    if blocked_at is None or blocked_at > now:
        return {"status": "invalid_timestamp"}
    reset_at = epoch(entry.get("last_error_reset_at"))
    # Respect explicit retry times for transient throttles. For prepaid-credit
    # exhaustion, a successful generation is the evidence that funding returned.
    not_before = max(blocked_at + GRACE, (reset_at or 0) if reason == "rate_limit_exceeded" else 0)
    fingerprint = hashlib.sha256(json.dumps(
        {"entry": {k: v for k, v in entry.items() if k != "request_count"},
         "model": model, "routing": routing}, sort_keys=True).encode()).hexdigest()
    return {"status": "candidate", "id": CREDENTIAL, "fingerprint": fingerprint,
            "reason": reason, "blocked_at": blocked_at, "not_before": not_before}


def read_context():
    # Parse only; do not invoke Hermes runtime initialization or touch its files.
    import yaml
    from dotenv import dotenv_values
    auth = json.loads(Path("/opt/data/auth.json").read_text())
    model = yaml.safe_load(Path("/opt/data/config.yaml").read_text()).get("model", {})
    dotenv = dotenv_values("/opt/data/.env")
    env = {**os.environ, **{k: v for k, v in dotenv.items() if v}}
    routing = {k: env.get(k) for k in ("OPENAI_BASE_URL", "OPENAI_API_BASE", "OPENAI_ORG_ID",
                                      "OPENAI_ORGANIZATION", "OPENAI_PROJECT_ID")}
    routing["alternate_routing"] = any(
        source.get(key) and source[key].rstrip("/") != BASE_URL
        for source in (dotenv, os.environ) for key in ("OPENAI_BASE_URL", "OPENAI_API_BASE"))
    entries = auth.get("credential_pool", {}).get(PROVIDER, [])
    token = entries[0].get("access_token") if len(entries) == 1 else None
    routing["different_env_key"] = any(source.get("OPENAI_API_KEY") and source["OPENAI_API_KEY"] != token
                                       for source in (dotenv, os.environ))
    return auth, model, routing


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def retry_seconds(value, now):
    try:
        seconds = float(value)
    except (ValueError, TypeError):
        try:
            seconds = email.utils.parsedate_to_datetime(value).timestamp() - now
        except (ValueError, TypeError, AttributeError):
            return 0
    return max(0, seconds) if math.isfinite(seconds) else 0


def probe(entry):
    payload = {"model": MODEL, "input": "Reply exactly OK.", "store": False,
               "reasoning": {"effort": "none"}, "max_output_tokens": 16}
    request = urllib.request.Request(BASE_URL + "/responses", data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + entry["access_token"], "Content-Type": "application/json"})
    # No redirect or proxy can receive this credential. No SDK retries.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=25) as response:
            body = json.loads(response.read(262144))
            if response.status == 200 and body.get("status") == "completed" and not body.get("error"):
                return {"status": "upstream_ok"}
            return {"status": "probe_incomplete"}
    except urllib.error.HTTPError as exc:
        # Do not log response bodies, headers, request objects or exception text.
        result = {"status": "upstream_rejected", "http_status": exc.code,
                  "retry_after": retry_seconds(exc.headers.get("Retry-After"), time.time())}
        exc.close()
        return result
    except Exception:
        return {"status": "probe_failed"}


def native_reset(credential_id):
    result = subprocess.run([HERMES, "auth", "reset", PROVIDER, credential_id],
                            capture_output=True, timeout=30,
                            env={**os.environ, "HOME": "/opt/data", "HERMES_HOME": "/opt/data"})
    return result.returncode == 0


def recover(expected, read=read_context, check=probe, reset=native_reset, clock=time.time):
    auth, model, routing = read()
    before = inspect_data(auth, model, routing, clock())
    if before.get("fingerprint") != expected or before.get("not_before", math.inf) > clock():
        return {"status": "changed_before_probe"}
    result = check(auth["credential_pool"][PROVIDER][0])
    if result["status"] != "upstream_ok":
        return result
    current = inspect_data(*read(), clock())
    if current.get("fingerprint") != expected:
        return {"status": "changed_during_probe"}
    if not reset(before["id"]):
        return {"status": "reset_failed"}
    auth_after, _, _ = read()
    entry_after = next((e for e in auth_after.get("credential_pool", {}).get(PROVIDER, [])
                        if e.get("id") == before["id"]), None)
    cleared = entry_after is not None and all(not entry_after.get(k) for k in STATUS_FIELDS)
    return {"status": "reset_done" if cleared else "reset_not_confirmed"}


def worker(action, expected=None):
    if action == "inspect":
        return inspect_data(*read_context(), time.time())
    if action == "recover" and re.fullmatch(r"[a-f0-9]{64}", expected or ""):
        return recover(expected)
    return {"status": "invalid_request"}


def call_worker(action, expected=None):
    args = ["/usr/bin/docker", "exec", "-i", "-u", "hermes", CONTAINER,
            PYTHON, "-", "--worker", action]
    if expected:
        args.append(expected)
    result = subprocess.run(args, input=Path(__file__).read_text(), text=True,
                            capture_output=True, timeout=65)
    if result.returncode:
        raise RuntimeError("worker_unavailable")
    return json.loads(result.stdout)


def tick(state, call=call_worker, clock=time.time, save=lambda state: None):
    now = clock()
    snapshot = call("inspect")
    status = snapshot["status"]
    if status != "candidate":
        changed = state.get("observation") != status
        state["observation"] = status
        if changed:
            save(state)
        return {"status": status, "log": changed and status != "healthy"}
    state["observation"] = status
    if state.get("pending"):
        return {"status": "manual_review_required", "log": False}
    fingerprint = snapshot["fingerprint"]
    if fingerprint in state.get("handled", {}):
        return {"status": "manual_review_required", "log": False}
    if state.get("incident") != fingerprint:
        state.update(incident=fingerprint, attempts=0, attempted_reset=False)
    if state.get("attempted_reset"):
        return {"status": "manual_review_required", "log": False}
    due = max(snapshot["not_before"], state.get("next_probe", 0),
              state.get("last_reset_attempt", 0) + RESET_INTERVAL)
    if now < due:
        return {"status": "waiting", "log": False}
    # Persist the deadline BEFORE the worker starts, so a killed/uncertain run
    # cannot create rapid probes or resets. Keep global backoff across incidents.
    state["attempts"] = state.get("attempts", 0) + 1
    delay = BACKOFF[min(state["attempts"] - 1, len(BACKOFF) - 1)]
    state["next_probe"] = now + delay
    state["pending"] = fingerprint
    save(state)
    result = call("recover", fingerprint)
    state.pop("pending", None)
    status = result["status"]
    if status in {"reset_done", "reset_failed", "reset_not_confirmed", "worker_error"}:
        state.update(attempted_reset=True, last_reset_attempt=clock())
        state.setdefault("handled", {})[fingerprint] = status
    elif result.get("http_status") in (400, 401, 403, 404):
        # A different provider/model/permission failure needs review. Never
        # clear it or repeatedly probe the same saved incident.
        state["attempted_reset"] = True
        state.setdefault("handled", {})[fingerprint] = status
    state["next_probe"] = max(state["next_probe"], clock() + result.get("retry_after", 0))
    state["last_result"] = status
    save(state)
    return {**result, "log": True}


def save_state(state):
    temporary = STATE_DIR / "state.tmp"
    with temporary.open("w") as stream:
        json.dump(state, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(STATE_DIR / "state.json")


def main():
    os.umask(0o077)
    if len(sys.argv) > 2 and sys.argv[1] == "--worker":
        try:
            result = worker(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
        except Exception:
            result = {"status": "worker_error"}
        print(json.dumps(result))
        return
    if sys.argv[1:] == ["--inspect"]:
        print(json.dumps(call_worker("inspect")))
        return
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE_DIR / "lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        path = STATE_DIR / "state.json"
        # Corrupted state fails closed instead of forgetting backoff/reset limits.
        state = json.loads(path.read_text()) if path.exists() else {}
        result = tick(state, save=save_state)
        if result.pop("log", False):
            print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print('{"status":"helper_error_no_action"}')
        sys.exit(1)
