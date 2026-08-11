#!/usr/bin/env python3
"""Register one completed OpenViking source with the Crypto dashboard queue."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--openviking-uri", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--source-type", required=True)
    parser.add_argument("--source-url")
    parser.add_argument("--captured-at")
    parser.add_argument("--external-id")
    parser.add_argument("--wait-seconds", type=int, default=180)
    parser.add_argument(
        "--dashboard-url",
        default=os.environ.get("CRYPTO_DASHBOARD_INTERNAL_URL", "http://crypto-dashboard:5183"),
    )
    parser.add_argument(
        "--secret-file",
        default=os.environ.get(
            "SATOSHI_DASHBOARD_SYNC_SECRET_FILE",
            "/opt/data/.secrets/satoshi-dashboard-sync-key",
        ),
    )
    return parser.parse_args()


def request_json(url: str, secret: str, method: str = "GET", payload: dict | None = None) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            detail = json.load(error)
        except Exception:
            detail = {"error": "dashboard_sync_failed"}
        raise RuntimeError(str(detail.get("error", "dashboard_sync_failed"))) from None
    except OSError:
        raise RuntimeError("dashboard_sync_unreachable") from None


def main() -> int:
    args = parse_args()
    secret_path = Path(args.secret_file)
    if not secret_path.is_file():
        print(json.dumps({"status": "failed", "error": "sync_secret_unavailable"}))
        return 2
    secret = secret_path.read_text(encoding="utf-8").strip()
    if len(secret) < 32:
        print(json.dumps({"status": "failed", "error": "sync_secret_invalid"}))
        return 2

    external_id = args.external_id or "ov:" + hashlib.sha256(
        args.openviking_uri.encode("utf-8")
    ).hexdigest()
    payload = {
        "external_id": external_id,
        "title": args.title,
        "source_type": args.source_type,
        "openviking_uri": args.openviking_uri,
        "captured_at": args.captured_at or datetime.now(timezone.utc).isoformat(),
        "metadata": {"context_branch": "crypto-intelligence", "submitted_by": "satoshi"},
    }
    if args.source_url:
        payload["source_url"] = args.source_url

    base = args.dashboard_url.rstrip("/")
    try:
        job = request_json(f"{base}/api/internal/telegram-sync", secret, "POST", payload)
        deadline = time.monotonic() + max(0, min(args.wait_seconds, 600))
        status_url = (
            f"{base}/api/internal/telegram-sync/"
            f"{urllib.parse.quote(external_id, safe='')}"
        )
        while job.get("status") in {"queued", "processing"} and time.monotonic() < deadline:
            time.sleep(1)
            job = request_json(status_url, secret)
        safe = {
            "status": job.get("status", "unknown"),
            "external_id": external_id,
            "canonical_id": job.get("canonical_id"),
            "attempts": job.get("attempts", 0),
        }
        if job.get("last_error"):
            safe["error"] = job["last_error"]
        print(json.dumps(safe, sort_keys=True))
        return 0 if job.get("status") == "ready" else 1
    except RuntimeError as error:
        print(json.dumps({"status": "failed", "error": str(error)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
