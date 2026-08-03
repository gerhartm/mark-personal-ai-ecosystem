#!/usr/bin/env python3
"""Acceptance-test Hermes's native OpenViking memory provider.

The script exercises the provider class Hermes itself uses. It stores one
non-sensitive marker, retrieves and reads it, supports verification after a
container restart, and removes the marker during closeout.
"""

from __future__ import annotations

import argparse
import json
import time

from dotenv import load_dotenv

from plugins.memory.openviking import OpenVikingMemoryProvider


def decode(raw: str) -> dict:
    value = json.loads(raw)
    if not isinstance(value, dict) or value.get("error"):
        raise RuntimeError(raw)
    return value


def connect() -> OpenVikingMemoryProvider:
    load_dotenv("/opt/data/.env", override=True)
    provider = OpenVikingMemoryProvider()
    provider.initialize(
        "mark-v2-openviking-acceptance",
        hermes_home="/opt/data",
        platform="automation",
    )
    if not provider._ensure_client():
        raise RuntimeError("Hermes OpenViking provider did not connect")
    return provider


def find_and_read(provider: OpenVikingMemoryProvider, marker: str, timeout: int) -> str:
    deadline = time.monotonic() + timeout
    last_total = 0
    while time.monotonic() < deadline:
        result = decode(
            provider.handle_tool_call(
                "viking_search",
                {"query": marker, "mode": "fast", "limit": 10},
            )
        )
        last_total = int(result.get("total", 0))
        for item in result.get("results", []):
            uri = str(item.get("uri", ""))
            if not uri:
                continue
            payload = decode(
                provider.handle_tool_call(
                    "viking_read", {"uri": uri, "level": "full"}
                )
            )
            if marker in str(payload.get("content", "")):
                return uri
        time.sleep(2)
    raise RuntimeError(f"Acceptance marker was not retrievable; last_total={last_total}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("write", "verify", "delete"))
    parser.add_argument("--marker", required=True)
    parser.add_argument("--uri")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    provider = connect()
    try:
        if args.mode == "write":
            decode(
                provider.handle_tool_call(
                    "viking_remember",
                    {"content": args.marker, "category": "case"},
                )
            )
            uri = find_and_read(provider, args.marker, args.timeout)
            print(json.dumps({"write": "passed", "search": "passed", "read": "passed", "uri": uri}))
        elif args.mode == "verify":
            uri = find_and_read(provider, args.marker, args.timeout)
            if args.uri and uri != args.uri:
                raise RuntimeError("Acceptance marker resolved to a different URI")
            print(json.dumps({"restart_persistence": "passed", "uri": uri}))
        else:
            if not args.uri:
                raise SystemExit("--uri is required for delete")
            decode(provider.handle_tool_call("viking_forget", {"uri": args.uri}))
            print(json.dumps({"cleanup": "passed", "uri": args.uri}))
    finally:
        provider.shutdown()


if __name__ == "__main__":
    main()
