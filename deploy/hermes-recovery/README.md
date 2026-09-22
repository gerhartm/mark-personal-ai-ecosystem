# Satoshi stale quota recovery

Installed on `mark-netcup-v2` on 2026-09-09 at 20:10 UTC (2026-09-10 IST).

This external systemd helper only clears a persisted OpenAI quota/rate-limit failure after a small real generation succeeds with the same credential. It has no container restart command and does not invoke Satoshi, ingest sources, create dashboard records, or alter Hermes application code.

## Trigger and action

1. Every two minutes, inspect `/opt/data/auth.json`, model routing and `.env` read-only inside the existing Hermes container. Healthy credentials cause no API request and no auth-file write.
2. Require exactly the known manual API credential `530a65`, provider `openai-api`, model `gpt-5.6-sol`, and the official OpenAI API endpoint. A changed provider, model, endpoint, key selection or multi-key setup fails closed and needs review.
3. Require persisted `exhausted` status, HTTP 402/429 and an explicit `credit_balance_exhausted`, `insufficient_quota`, or `rate_limit_exceeded` code. Older serialized provider codes are supported. Generic authentication text, 401s and other errors are ignored.
4. Wait at least two minutes from the error. Respect a future explicit retry time for rate limiting. Probe the Responses API with a fixed four-word prompt, at most 16 output tokens, no tools, reasoning disabled and `store: false`. No chat history or client source content is sent. Credentials stay inside the container and are not logged or copied to the host.
5. Only after a completed HTTP 200 generation, re-read the exact credential/status fingerprint. If it changed, abort. Otherwise run the official targeted command `hermes auth reset openai-api 530a65` as the Hermes user, then verify the status fields were cleared.

Failures back off at 2, 5, 10 and then 15 minutes, honoring a longer provider Retry-After. A persisted incident gets at most one reset attempt, with at least 15 minutes between reset attempts for distinct incidents. An interrupted/uncertain worker attempt stops automatic recovery pending manual review. A small successful request verifies restored access; it cannot establish that a larger workload fits all token/rate limits. Credits still need to be replenished when actually exhausted. See [OpenAI's error guidance](https://developers.openai.com/api/docs/guides/error-codes).

This handles persisted pool status. A running session can still hold or re-persist stale in-memory state; if the same incident returns, the helper does not loop or restart production. An operator must inspect that case. Existing Telegram error messages are not edited, and interrupted requests are not automatically replayed. Normal service checks cost no API tokens; recovery probes have a small, bounded generation cost.

## Operations

Host script: `/usr/local/lib/mark-hermes-recovery/recover.py`.
Units: `/etc/systemd/system/mark-hermes-recovery.{service,timer}`.
Private redacted backoff state: `/var/lib/mark-hermes-recovery/state.json`.

```sh
systemctl list-timers mark-hermes-recovery.timer
systemctl show mark-hermes-recovery.service -p Result -p ExecMainStatus
journalctl -u mark-hermes-recovery.service --since today
python3 /usr/local/lib/mark-hermes-recovery/recover.py --inspect
```

Disable future checks without touching Hermes:

```sh
systemctl disable --now mark-hermes-recovery.timer
```

If a check is already running, allow the bounded one-shot to finish before maintenance. Do not remove the state file merely to force repeated attempts. An operator should first examine `pending`, `last_result`, and the current pool status; the file contains no credential or raw provider message.

The service uses a filesystem sandbox and a private state directory. Docker access remains powerful even with these restrictions; the helper is root-owned and runs only fixed commands against the named container. No extra Docker service, package dependency, database migration or Hermes image change is required.

## Verification performed

- 21 tests passed locally and on the VPS: healthy no-op, explicit quota codes, real auth failures, backoff/retry times, changed credentials/newer errors during probing, reset readback, alternating old incidents, and interrupted worker handling.
- Tested the installed official Hermes CLI against fake credentials in a temporary separate Hermes home. Only the target failure metadata cleared; its key and other fields, a sibling credential and unrelated auth metadata were preserved. The fixture was removed. Production auth remained byte-for-byte unchanged.
- One direct live acceptance probe succeeded with the exact 16-token payload. This did not reset production auth or create a Hermes conversation, memory item or dashboard source.
- Read-only classification of both saved real incident archives matched the trigger: the credit-exhaustion archive yielded `insufficient_quota` and the TPM archive yielded `rate_limit_exceeded`. Neither archive was modified or restored into production.
- Installed service completed successfully with `healthy`; state contained only that observation, with no automated probe/reset attempted. The production auth SHA-256 remained unchanged before/after installation.
- Hermes, dashboard and OpenViking retained identical container IDs/start times and zero restarts. Dashboard and OpenViking reported healthy.

Release source and container identity checks are retained at `/root/mark-v2-upgrades/hermes-20260909T192634Z/hermes-recovery/`. The full pre-upgrade backup remains in the parent directory.

Run local tests from this directory with `python3 -m unittest -v test_recover.py`. `verify_native.py` is a one-off acceptance harness, not part of the installed service: append it to `recover.py` with the latter's main guard disabled, pipe to Python in the existing Hermes container, and pass `--verify-native` for the isolated fixture or `--verify-probe` for one bounded paid live check.
