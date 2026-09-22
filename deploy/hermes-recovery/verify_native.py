"""One-off acceptance checks, appended to recover.py and piped into the container.

Run with --verify-native (fake temporary Hermes home, no API call) or
--verify-probe (one tiny real generation, no reset or knowledge writes).
"""
import copy
import tempfile


def verify_native():
    live_auth = Path("/opt/data/auth.json").read_bytes()
    with tempfile.TemporaryDirectory(prefix="mark-hermes-reset-fixture-") as temporary:
        fixture_home = Path(temporary)
        target = {"id": "fixture-target", "label": "fixture target", "priority": 0,
                  "source": "manual", "auth_type": "api_key", "access_token": "fake-test-token",
                  "base_url": BASE_URL, "request_count": 8, "last_status": "exhausted",
                  "last_status_at": time.time(), "last_error_code": 429,
                  "last_error_reason": "credit_balance_exhausted", "failure_reason": "billing",
                  "last_error_message": "fixture", "last_error_reset_at": time.time() + 3600}
        sibling = {**copy.deepcopy(target), "id": "fixture-sibling", "priority": 1,
                   "label": "fixture sibling", "access_token": "another-fake-test-token"}
        fixture = {"credential_pool": {PROVIDER: [target, sibling]}, "fixture_marker": "preserve"}
        (fixture_home / "auth.json").write_text(json.dumps(fixture))
        (fixture_home / "config.yaml").write_text("model:\n  provider: openai-api\n  default: gpt-5.6-sol\n")
        (fixture_home / ".env").write_text("")
        env = {"PATH": "/opt/hermes/.venv/bin:/usr/local/bin:/usr/bin:/bin",
               "HOME": temporary, "HERMES_HOME": temporary, "PYTHONDONTWRITEBYTECODE": "1"}
        completed = subprocess.run([HERMES, "auth", "reset", PROVIDER, "fixture-target"],
                                   env=env, capture_output=True, timeout=40, cwd=temporary)
        assert completed.returncode == 0, "isolated native reset failed"
        after = json.loads((fixture_home / "auth.json").read_text())
        entries = {e["id"]: e for e in after["credential_pool"][PROVIDER]}
        assert all(not entries["fixture-target"].get(k) for k in STATUS_FIELDS), "target status not cleared"
        for key, value in target.items():
            if key not in STATUS_FIELDS:
                assert entries["fixture-target"].get(key) == value, "non-status target field changed"
        assert entries["fixture-sibling"] == sibling, "sibling credential changed"
        assert after["fixture_marker"] == "preserve", "unrelated auth metadata changed"
    assert Path("/opt/data/auth.json").read_bytes() == live_auth, "live auth changed during fixture test"
    print(json.dumps({"isolated_native_reset": "passed", "sibling_preserved": True,
                      "live_auth_unchanged": True, "temporary_fixture_removed": True}))


def verify_probe():
    before = Path("/opt/data/auth.json").read_bytes()
    ctx = read_context()
    assert inspect_data(*ctx, time.time())["status"] == "healthy", "production setup is not healthy"
    result = probe(ctx[0]["credential_pool"][PROVIDER][0])
    assert Path("/opt/data/auth.json").read_bytes() == before, "live auth changed during probe"
    print(json.dumps({"live_probe": result, "live_auth_unchanged": True}))
    assert result["status"] == "upstream_ok", "live bounded generation failed"


if sys.argv[1:] == ["--verify-native"]:
    verify_native()
elif sys.argv[1:] == ["--verify-probe"]:
    verify_probe()
