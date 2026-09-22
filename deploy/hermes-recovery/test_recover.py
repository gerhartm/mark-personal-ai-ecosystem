import copy
import json
import unittest
from unittest.mock import Mock, patch
import urllib.error

import recover as r

NOW = 1_788_990_000.0


def context(**changes):
    entry = dict(id=r.CREDENTIAL, auth_type="api_key", source="manual", access_token="fake-test-key",
                 base_url=r.BASE_URL, last_status="exhausted", last_status_at=NOW - 300,
                 last_error_code=429, last_error_reason="credit_balance_exhausted",
                 last_error_message="no credit", failure_reason="billing")
    entry.update(changes)
    return ({"credential_pool": {r.PROVIDER: [entry]}},
            {"provider": r.PROVIDER, "default": r.MODEL}, {})


class RecoveryTests(unittest.TestCase):
    def snapshot(self, ctx=None, now=NOW):
        return r.inspect_data(*(ctx or context()), now)

    def test_healthy_does_not_probe_or_reset(self):
        snapshot = self.snapshot(context(last_status=None, last_error_code=None))
        call = Mock(return_value=snapshot)
        self.assertEqual(r.tick({}, call=call, clock=lambda: NOW)["status"], "healthy")
        call.assert_called_once_with("inspect")

    def test_non_quota_errors_ignored(self):
        for code, reason in [(401, "invalid_api_key"), (403, "access_denied"), (500, "server_error"),
                             (429, "unknown"), (429, "slow_down")]:
            with self.subTest(code=code, reason=reason):
                self.assertEqual(self.snapshot(context(last_error_code=code, last_error_reason=reason))[
                    "status"], "ignored_error")

    def test_old_serialized_quota_code_supported(self):
        ctx = context(last_error_reason=None, last_error_message=
                      "Error code: 429 - {'error': {'type': 'insufficient_quota', 'code': 'credit_balance_exhausted'}}")
        self.assertEqual(self.snapshot(ctx)["status"], "candidate")
        ctx = context(last_error_reason=None, last_error_message="unknown authentication failure")
        self.assertEqual(self.snapshot(ctx)["status"], "ignored_error")

    def test_other_provider_model_key_or_endpoint_fail_closed(self):
        contexts = [context(base_url="https://other.example/v1"), context(auth_type="oauth"),
                    context(id="another"), context(access_token="")]
        ctx = context()
        ctx[1]["default"] = "different-model"
        contexts.append(ctx)
        ctx = context()
        ctx[0]["credential_pool"][r.PROVIDER].append(copy.deepcopy(ctx[0]["credential_pool"][r.PROVIDER][0]))
        contexts.append(ctx)
        ctx = context()
        ctx[2]["OPENAI_PROJECT_ID"] = "different-project"
        contexts.append(ctx)
        for ctx in contexts:
            self.assertEqual(self.snapshot(ctx)["status"], "unsupported_setup")

    def test_grace_and_retry_after_prevent_probe(self):
        for ctx in [context(last_status_at=NOW - 5),
                    context(last_error_reason="rate_limit_exceeded", last_error_reset_at=NOW + 3600)]:
            call = Mock(return_value=self.snapshot(ctx))
            self.assertEqual(r.tick({}, call=call, clock=lambda: NOW)["status"], "waiting")
            call.assert_called_once_with("inspect")

    def test_invalid_dates_fail_closed(self):
        for stamp in [None, "broken", float("nan"), NOW + 30]:
            self.assertEqual(self.snapshot(context(last_status_at=stamp))["status"], "invalid_timestamp")
        self.assertEqual(r.epoch("2026-09-10T00:00:00Z"), 1788998400)

    def test_success_clears_only_target_after_recheck(self):
        ctx = context()
        after = copy.deepcopy(ctx)
        entry = after[0]["credential_pool"][r.PROVIDER][0]
        for field in r.STATUS_FIELDS:
            entry[field] = None
        reset = Mock(return_value=True)
        check = Mock(return_value={"status": "upstream_ok"})
        result = r.recover(self.snapshot(ctx)["fingerprint"],
                           read=Mock(side_effect=[ctx, ctx, after]), check=check, reset=reset, clock=lambda: NOW)
        self.assertEqual(result["status"], "reset_done")
        reset.assert_called_once_with(r.CREDENTIAL)
        self.assertEqual(check.call_args.args[0]["access_token"], "fake-test-key")

    def test_failed_probe_never_resets(self):
        ctx = context()
        for outcome in [{"status": "upstream_rejected", "http_status": 429},
                        {"status": "upstream_rejected", "http_status": 401},
                        {"status": "probe_failed"}, {"status": "probe_incomplete"}]:
            reset = Mock()
            result = r.recover(self.snapshot(ctx)["fingerprint"], read=lambda: ctx,
                check=lambda e: outcome, reset=reset, clock=lambda: NOW)
            self.assertEqual(result, outcome)
            reset.assert_not_called()

    def test_newer_error_or_changed_key_during_probe_never_reset(self):
        ctx = context()
        for changed in [context(last_status_at=NOW - 150), context(access_token="another-fake-key"),
                        context(last_error_code=401, last_error_reason="invalid_api_key")]:
            reset = Mock()
            result = r.recover(self.snapshot(ctx)["fingerprint"], read=Mock(side_effect=[ctx, changed]),
                check=lambda e: {"status": "upstream_ok"}, reset=reset, clock=lambda: NOW)
            self.assertEqual(result["status"], "changed_during_probe")
            reset.assert_not_called()

    def test_changed_state_before_probe_does_nothing(self):
        ctx = context()
        check = Mock()
        self.assertEqual(r.recover("0" * 64, read=lambda: ctx, check=check, clock=lambda: NOW)["status"],
                         "changed_before_probe")
        check.assert_not_called()

    def test_reset_result_is_read_back(self):
        ctx = context()
        self.assertEqual(r.recover(self.snapshot(ctx)["fingerprint"], read=lambda: ctx,
            check=lambda e: {"status": "upstream_ok"}, reset=lambda id: True, clock=lambda: NOW)["status"],
            "reset_not_confirmed")

    def test_backoff_and_retry_after_survive_new_incident(self):
        state = {}
        snapshot = self.snapshot()
        call = Mock(side_effect=[snapshot, {"status": "upstream_rejected", "http_status": 429, "retry_after": 1800}])
        r.tick(state, call=call, clock=lambda: NOW)
        self.assertEqual(state["next_probe"], NOW + 1800)
        newer = self.snapshot(context(last_status_at=NOW - 200))
        call = Mock(return_value=newer)
        self.assertEqual(r.tick(state, call=call, clock=lambda: NOW + 300)["status"], "waiting")
        call.assert_called_once_with("inspect")

    def test_backoff_increases_with_failed_probes(self):
        state = {}
        now = NOW
        for delay in (120, 300, 600, 900, 900):
            call = Mock(side_effect=[self.snapshot(), {"status": "probe_failed"}])
            r.tick(state, call=call, clock=lambda: now)
            self.assertEqual(state["next_probe"], now + delay)
            now += delay

    def test_same_incident_reset_at_most_once_even_if_resurrected(self):
        state = {}
        snapshot = self.snapshot()
        call = Mock(side_effect=[snapshot, {"status": "reset_done"}])
        r.tick(state, call=call, clock=lambda: NOW)
        r.tick(state, call=lambda action: {"status": "healthy"}, clock=lambda: NOW + 200)
        call = Mock(return_value=snapshot)
        self.assertEqual(r.tick(state, call=call, clock=lambda: NOW + 4000)["status"], "manual_review_required")
        call.assert_called_once_with("inspect")

    def test_uncertain_worker_run_is_not_retried(self):
        state = {}
        persisted = []
        call = Mock(side_effect=[self.snapshot(), TimeoutError("fake")])
        with self.assertRaises(TimeoutError):
            r.tick(state, call=call, clock=lambda: NOW, save=lambda s: persisted.append(copy.deepcopy(s)))
        self.assertTrue(persisted[-1]["pending"])
        call = Mock(return_value=self.snapshot())
        self.assertEqual(r.tick(persisted[-1], call=call, clock=lambda: NOW + 4000)["status"], "manual_review_required")
        call.assert_called_once_with("inspect")

    def test_alternating_old_incidents_are_not_reset_again(self):
        state = {}
        for i, snapshot in enumerate([self.snapshot(), self.snapshot(context(last_status_at=NOW - 200))]):
            call = Mock(side_effect=[snapshot, {"status": "reset_done"}])
            r.tick(state, call=call, clock=lambda: NOW + i * 2000)
        call = Mock(return_value=self.snapshot())
        self.assertEqual(r.tick(state, call=call, clock=lambda: NOW + 8000)["status"], "manual_review_required")
        call.assert_called_once_with("inspect")

    def test_distinct_failure_waits_fifteen_minutes_after_reset(self):
        state = {}
        call = Mock(side_effect=[self.snapshot(), {"status": "reset_done"}])
        r.tick(state, call=call, clock=lambda: NOW)
        newer = self.snapshot(context(last_status_at=NOW - 200))
        call = Mock(return_value=newer)
        self.assertEqual(r.tick(state, call=call, clock=lambda: NOW + 300)["status"], "waiting")
        call.assert_called_once_with("inspect")

    def test_real_auth_failure_stops_probing_incident(self):
        state = {}
        call = Mock(side_effect=[self.snapshot(), {"status": "upstream_rejected", "http_status": 401}])
        r.tick(state, call=call, clock=lambda: NOW)
        call = Mock(return_value=self.snapshot())
        self.assertEqual(r.tick(state, call=call, clock=lambda: NOW + 4000)["status"], "manual_review_required")
        call.assert_called_once_with("inspect")

    def test_redacted_inspection_does_not_expose_key_or_error_body(self):
        output = json.dumps(self.snapshot())
        self.assertNotIn("fake-test-key", output)
        self.assertNotIn("no credit", output)

    @patch("recover.urllib.request.build_opener")
    def test_probe_uses_same_key_bounded_generation_and_no_storage(self, factory):
        response = factory.return_value.open.return_value.__enter__.return_value
        response.status = 200
        response.read.return_value = b'{"status":"completed"}'
        self.assertEqual(r.probe(context()[0]["credential_pool"][r.PROVIDER][0])["status"], "upstream_ok")
        request = factory.return_value.open.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.full_url, r.BASE_URL + "/responses")
        self.assertEqual(request.get_header("Authorization"), "Bearer fake-test-key")
        self.assertEqual(payload["max_output_tokens"], 16)
        self.assertFalse(payload["store"])
        self.assertNotIn("tools", payload)

    @patch("recover.urllib.request.build_opener")
    def test_http_failure_never_returns_provider_body(self, factory):
        factory.return_value.open.side_effect = urllib.error.HTTPError(
            r.BASE_URL, 429, "private response", {"Retry-After": "300"}, None)
        result = r.probe(context()[0]["credential_pool"][r.PROVIDER][0])
        self.assertEqual(result, {"status": "upstream_rejected", "http_status": 429, "retry_after": 300})


if __name__ == "__main__":
    unittest.main()
