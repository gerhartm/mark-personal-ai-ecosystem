#!/usr/bin/env python3
"""Read-only search for existing Mark context in Hermes's OpenViking memory."""

from __future__ import annotations

import json

from dotenv import load_dotenv
from plugins.memory.openviking import OpenVikingMemoryProvider


PROFILE_ID = "mark-gerhart-core-2026-08-06"


QUERIES = (
    "mark-gerhart-core-2026-08-06",
    "Mark Gerhart Dialectic professional background",
    "Mark Personal AI Ecosystem Satoshi",
    "Crypto Intelligence Creator Reference Mark",
)


def decode(raw: str) -> dict:
    value = json.loads(raw)
    if not isinstance(value, dict) or value.get("error"):
        raise RuntimeError("OpenViking search failed")
    return value


def main() -> None:
    load_dotenv("/opt/data/.env", override=True)
    provider = OpenVikingMemoryProvider()
    provider.initialize(
        "mark-context-read-only-audit",
        hermes_home="/opt/data",
        platform="automation",
    )
    if not provider._ensure_client():
        raise RuntimeError("Hermes OpenViking provider did not connect")
    try:
        output = []
        root = "viking://user/hermes/resources/mark/core-profile/v1"
        root_items = json.loads(
            provider.handle_tool_call(
                "viking_browse", {"action": "ls", "path": root}
            )
        )
        output.append({"browse": root_items})
        for item in root_items:
            if not item.get("isDir"):
                continue
            children = json.loads(
                provider.handle_tool_call(
                    "viking_browse", {"action": "ls", "path": item["uri"]}
                )
            )
            output.append(
                {
                    "children": [
                        {
                            "uri": child.get("uri", ""),
                            "is_dir": child.get("isDir", False),
                        }
                        for child in children
                    ]
                }
            )
            for child in children:
                if child.get("isDir"):
                    continue
                payload = json.loads(
                    provider.handle_tool_call(
                        "viking_read",
                        {"uri": child["uri"], "level": "full"},
                    )
                )
                output.append(
                    {
                        "read": child["uri"],
                        "payload_type": type(payload).__name__,
                        "keys": sorted(payload.keys()) if isinstance(payload, dict) else [],
                        "contains_profile_id": PROFILE_ID in json.dumps(payload),
                    }
                )
        for query in QUERIES:
            result = decode(
                provider.handle_tool_call(
                    "viking_search",
                    {"query": query, "mode": "fast", "limit": 8},
                )
            )
            output.append(
                {
                    "query": query,
                    "total": result.get("total", 0),
                    "results": [
                        {
                            "uri": item.get("uri", ""),
                            "score": item.get("score"),
                        }
                        for item in result.get("results", [])
                    ],
                }
            )
        print(json.dumps(output, indent=2, sort_keys=True))
    finally:
        provider.shutdown()


if __name__ == "__main__":
    main()
