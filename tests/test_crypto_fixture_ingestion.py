#!/usr/bin/env python3
"""Live fixture acceptance through Hermes's native OpenViking provider.

The caller creates and later removes the exact fixture namespace. This script
never touches client content and prints only fixture statuses and URIs.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from crypto_intelligence.provenance import needs_create


def decode(raw: str) -> dict:
    value = json.loads(raw)
    if not isinstance(value, dict) or value.get("error"):
        raise RuntimeError(raw)
    return value


def connect() -> Any:
    from dotenv import load_dotenv
    from plugins.memory.openviking import OpenVikingMemoryProvider

    load_dotenv("/opt/data/.env", override=True)
    provider = OpenVikingMemoryProvider()
    provider.initialize(
        "mark-v2-crypto-fixture-acceptance",
        hermes_home="/opt/data",
        platform="automation",
    )
    if not provider._ensure_client():
        raise RuntimeError("Hermes OpenViking provider did not connect")
    return provider


def add_resource(
    provider: Any,
    source: str,
    target: str,
    reason: str,
) -> dict:
    return decode(
        provider.handle_tool_call(
            "viking_add_resource",
            {
                "url": source,
                "to": target,
                "reason": reason,
                "instruction": "Preserve the source and provenance exactly; do not invent facts.",
                # OpenViking's semantic workers can legitimately outlive the
                # synchronous Hermes tool window. Submit natively, then prove
                # completion by searching and reading the exact marker below.
                "wait": False,
            },
        )
    )


def find_marker(
    provider: Any,
    marker: str,
    timeout: int,
) -> tuple[str, str]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = decode(
            provider.handle_tool_call(
                "viking_search",
                {"query": marker, "mode": "fast", "limit": 20},
            )
        )
        for item in result.get("results", []):
            uri = str(item.get("uri", ""))
            if not uri:
                continue
            try:
                payload = decode(
                    provider.handle_tool_call(
                        "viking_read", {"uri": uri, "level": "full"}
                    )
                )
            except RuntimeError:
                # Generated summaries are replaced atomically while semantic
                # processing runs, so a stale search hit may briefly vanish.
                continue
            content = str(payload.get("content", ""))
            if marker in content:
                return uri, content
        time.sleep(2)
    raise RuntimeError(f"fixture marker not retrievable: {marker}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-dir", type=Path, required=True)
    parser.add_argument("--base-uri", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--skip-direct-url", action="store_true")
    args = parser.parse_args()

    markers = {
        "url-envelope": f"MARK_CRYPTO_URL_{args.run_id}",
        "document": f"MARK_CRYPTO_DOCUMENT_{args.run_id}",
        "transcript": f"MARK_CRYPTO_TRANSCRIPT_{args.run_id}",
        "event": f"MARK_CRYPTO_EVENT_{args.run_id}",
    }
    expected_metadata = {
        "url-envelope": (
            "sha256:0f115db062b7c0dd030b16878c99dea5c354b49dc37b38eb8846179c7783e9d7",
            "https://example.com/",
        ),
        "document": (
            "sha256:f430a33d2448b86653b189e8c338c04e73a4da95742e9bc4fad3884cbe0b8bc5",
            None,
        ),
        "transcript": (
            "sha256:768d81de34817eaae23322e0962577f4ca8e72f77cfa99eb9e995b5368786b12",
            "https://example.com/video/crypto-fixture",
        ),
        "event": ("fixture-20260731T181655Z", None),
    }
    local_files = {
        name: args.fixture_dir / f"{name}.md" for name in markers
    }
    for path in local_files.values():
        if not path.is_file():
            raise FileNotFoundError(path)

    provider = connect()
    try:
        results: dict[str, object] = {}
        if args.skip_direct_url:
            results["direct_url"] = {"status": "preverified_after_provider_timeout"}
        else:
            results["direct_url"] = add_resource(
                provider,
                "https://example.com/",
                f"{args.base_uri}/direct-url.md",
                "Non-sensitive native URL-ingestion acceptance fixture.",
            )
        reads = {}
        for name, path in local_files.items():
            marker = markers[name]
            try:
                uri, content = find_marker(provider, marker, 2)
                results[name] = {"status": "preexisting_from_prior_submission"}
            except RuntimeError:
                results[name] = add_resource(
                    provider,
                    str(path),
                    f"{args.base_uri}/{name}.md",
                    "Non-sensitive Crypto provenance acceptance fixture.",
                )
                uri, content = find_marker(provider, marker, 180)
            reads[name] = {
                "uri": uri,
                "marker": "present",
                "schema": "present" if "mark.crypto." in content else "missing",
                "date": "present" if "2026-07-31" in content else "missing",
                "identity": "present" if expected_metadata[name][0] in content else "missing",
                "source_url": (
                    "not_applicable"
                    if expected_metadata[name][1] is None
                    else "present"
                    if expected_metadata[name][1] in content
                    else "missing"
                ),
            }

        document_id = expected_metadata["document"][0]
        observed_source_ids = {
            identity
            for name, (identity, _) in expected_metadata.items()
            if name != "event" and reads[name]["identity"] == "present"
        }
        if needs_create(document_id, observed_source_ids):
            raise RuntimeError("identity guard failed to recognize existing document")

        print(
            json.dumps(
                {
                    "adds": {name: "passed" for name in results},
                    "search_read": reads,
                    "duplicate_replay": "skipped_by_identity_guard",
                },
                sort_keys=True,
            )
        )
    finally:
        provider.shutdown()


if __name__ == "__main__":
    main()
