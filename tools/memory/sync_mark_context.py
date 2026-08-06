#!/usr/bin/env python3
"""Replay-safe importer for Mark's curated owner context.

The source document is intentionally private and is never stored in Git. This
tool uses Hermes's existing native OpenViking provider and writes one bounded,
deterministic resource only after an explicit confirmation phrase.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from plugins.memory.openviking import OpenVikingMemoryProvider


CONFIRMATION = "APPLY_MARK_OWNER_CONTEXT_V1"
TARGET_URI = "viking://user/hermes/resources/mark/core-profile/v1"
PROFILE_ID = "mark-gerhart-core-2026-08-06"


def decode(raw: str) -> dict[str, Any]:
    value = json.loads(raw)
    if not isinstance(value, dict) or value.get("error"):
        raise RuntimeError("OpenViking operation failed")
    return value


def connect() -> OpenVikingMemoryProvider:
    load_dotenv("/opt/data/.env", override=True)
    provider = OpenVikingMemoryProvider()
    provider.initialize(
        "mark-owner-context-sync",
        hermes_home="/opt/data",
        platform="automation",
    )
    if not provider._ensure_client():
        raise RuntimeError("Hermes OpenViking provider did not connect")
    return provider


def target_state(provider: OpenVikingMemoryProvider) -> str:
    value = json.loads(
        provider.handle_tool_call(
            "viking_browse", {"action": "stat", "path": TARGET_URI}
        )
    )
    error = str(value.get("error") or "") if isinstance(value, dict) else ""
    if error:
        if "NOT_FOUND" in error or "not found" in error.casefold():
            return "absent"
        raise RuntimeError("OpenViking stat failed")
    if bool(value.get("isLocked") or value.get("is_locked")):
        return "processing"
    if int(value.get("count") or 0) <= 0:
        return "empty"
    return "ready"


def wait_ready(provider: OpenVikingMemoryProvider, timeout: int) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if target_state(provider) == "ready":
            return
        time.sleep(2)
    raise TimeoutError("Mark context did not become ready before timeout")


def list_children(provider: OpenVikingMemoryProvider, uri: str) -> list[dict[str, Any]]:
    value = json.loads(
        provider.handle_tool_call("viking_browse", {"action": "ls", "path": uri})
    )
    if not isinstance(value, list):
        raise RuntimeError("OpenViking browse returned a non-list response")
    return value


def verify(provider: OpenVikingMemoryProvider) -> str:
    """Verify exact content beneath the deterministic root without search timing."""
    pending = [TARGET_URI]
    visited: set[str] = set()
    readable: list[tuple[str, str]] = []
    while pending:
        current = pending.pop()
        if current in visited:
            continue
        visited.add(current)
        for item in list_children(provider, current):
            uri = str(item.get("uri") or "")
            if not uri or not uri.startswith(TARGET_URI):
                continue
            if bool(item.get("isDir") or item.get("is_dir")):
                pending.append(uri)
                continue
            payload = decode(
                provider.handle_tool_call(
                    "viking_read", {"uri": uri, "level": "full"}
                )
            )
            readable.append((uri, str(payload.get("content") or "")))
    combined = "\n".join(content for _, content in readable)
    required = (
        "Mark Gerhart",
        "Dialectic",
        "Satoshi",
        "Personal AI Ecosystem",
        "Crypto Intelligence",
        "Creator Reference",
    )
    missing = [anchor for anchor in required if anchor not in combined]
    if missing:
        raise RuntimeError("Mark context is incomplete under its deterministic root")
    if not readable:
        raise RuntimeError("Mark context has no readable documents")
    return readable[0][0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    source = args.source.resolve()
    body = source.read_text(encoding="utf-8")
    if PROFILE_ID not in body or "schema: mark.owner-context/v1" not in body:
        raise SystemExit("source is not the approved Mark owner-context document")
    sha256 = hashlib.sha256(body.encode("utf-8")).hexdigest()

    provider = connect()
    try:
        state = target_state(provider)
        if not args.apply:
            print(
                json.dumps(
                    {
                        "apply": False,
                        "profile_id": PROFILE_ID,
                        "sha256": sha256,
                        "target": TARGET_URI,
                        "state": state,
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
            return

        if args.confirm != CONFIRMATION:
            raise SystemExit("apply requires the exact confirmation phrase")
        if state == "ready":
            uri = verify(provider)
            status = "skipped_existing"
        elif state in {"processing", "empty"}:
            raise RuntimeError("deterministic target exists but is not ready")
        else:
            decode(
                provider.handle_tool_call(
                    "viking_add_resource",
                    {
                        "url": str(source),
                        "to": TARGET_URI,
                        "reason": "Approved canonical owner context for Mark Gerhart's private Satoshi assistant.",
                        "instruction": (
                            "Preserve confidence labels and architecture boundaries. "
                            "Do not turn inferences into confirmed facts."
                        ),
                        "wait": False,
                    },
                )
            )
            wait_ready(provider, args.timeout)
            uri = verify(provider)
            status = "created"

        print(
            json.dumps(
                {
                    "apply": True,
                    "profile_id": PROFILE_ID,
                    "sha256": sha256,
                    "status": status,
                    "target": TARGET_URI,
                    "verified_uri": uri,
                },
                indent=2,
                sort_keys=True,
            )
        )
    finally:
        provider.shutdown()


if __name__ == "__main__":
    main()
