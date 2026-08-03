#!/usr/bin/env python3
"""Replay-safe Crypto packet importer using Hermes's native OpenViking provider.

Without `--apply` this command is write-free. Applying requires an explicit
confirmation phrase and a new receipt file. It is intended to run inside the
Hermes container after the locally verified packet set is staged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

from crypto_intelligence.provenance import IngestReceipt, utc_now


CONFIRMATION = "APPLY_MARK_CRYPTO_V2_PACKETS"


class ResourceIdentityConflict(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(packet_root: Path) -> dict[str, Any]:
    manifest = json.loads((packet_root / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != "mark.crypto.migration-manifest/v1":
        raise ValueError("unsupported migration manifest")
    if manifest.get("openviking_write_performed") is not False:
        raise ValueError("manifest write boundary is invalid")
    if manifest.get("failures"):
        raise ValueError("manifest contains packet failures")
    return manifest


def validate_packet(packet_root: Path, record: dict[str, Any]) -> Path:
    root = packet_root.resolve()
    path = (root / str(record["path"])).resolve()
    if root not in path.parents or not path.is_file():
        raise ValueError("packet path is unsafe or missing")
    if path.stat().st_size != int(record["bytes"]):
        raise ValueError("packet byte count does not match manifest")
    if sha256_file(path) != record["sha256"]:
        raise ValueError("packet checksum does not match manifest")
    return path


def decode(raw: str) -> dict[str, Any]:
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError("native provider returned a non-object response")
    return value


def read_optional(provider: Any, uri: str) -> str | None:
    value = decode(provider.handle_tool_call("viking_read", {"uri": uri, "level": "full"}))
    error = str(value.get("error") or "")
    if error:
        if "NOT_FOUND" in error or "not found" in error.casefold():
            return None
        raise RuntimeError("native provider read failed")
    return str(value.get("content") or "")


def expected_identity(record: dict[str, Any]) -> tuple[str, str]:
    if "event_id" in record:
        return "mark.crypto.event/v1", str(record["event_id"])
    return "mark.crypto.source/v1", str(record["source_id"])


def find_exact_resource(provider: Any, record: dict[str, Any]) -> str | None:
    """Return OpenViking's canonical URI for a packet identity, if present.

    OpenViking owns the final stored filename and may append a collision-safe
    suffix. Deterministic provenance inside the packet is therefore the stable
    identity; a caller must not predict the generated resource URI.
    """
    schema, identity = expected_identity(record)
    result = decode(
        provider.handle_tool_call(
            "viking_search",
            {"query": identity, "mode": "fast", "limit": 50},
        )
    )
    if result.get("error"):
        raise RuntimeError("native provider search failed")
    matches: set[str] = set()
    read_errors = 0
    for item in result.get("results", []):
        uri = str(item.get("uri") or "")
        if not uri:
            continue
        try:
            content = read_optional(provider, uri)
        except RuntimeError:
            # Semantic summaries are replaced atomically during processing;
            # retry instead of interpreting a transient stale hit as absence.
            read_errors += 1
            continue
        if content is not None and schema in content and identity in content:
            matches.add(uri)
    if not matches:
        if read_errors:
            raise RuntimeError("native provider read failed during identity search")
        return None
    return sorted(matches)[0]


def find_exact_resource_with_retry(
    provider: Any,
    record: dict[str, Any],
    attempts: int = 6,
    interval: float = 2.0,
) -> str | None:
    last_error: RuntimeError | None = None
    for attempt in range(attempts):
        try:
            return find_exact_resource(provider, record)
        except RuntimeError as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(interval)
    assert last_error is not None
    raise last_error


def wait_for_exact_resource(
    provider: Any,
    record: dict[str, Any],
    timeout: int = 240,
    interval: float = 2.0,
) -> str:
    deadline = time.monotonic() + timeout
    last_error: RuntimeError | None = None
    while time.monotonic() < deadline:
        try:
            uri = find_exact_resource(provider, record)
        except RuntimeError as error:
            last_error = error
            time.sleep(interval)
            continue
        if uri is not None:
            return uri
        time.sleep(interval)
    if last_error is not None:
        raise TimeoutError("native identity search remained unavailable before timeout") from last_error
    raise TimeoutError("native resource did not become readable before timeout")


def write_receipt(handle: Any, receipt: IngestReceipt) -> None:
    handle.write(json.dumps(receipt.as_dict(), ensure_ascii=False, sort_keys=True) + "\n")
    handle.flush()
    os.fsync(handle.fileno())


def execute(
    packet_root: Path,
    manifest: dict[str, Any],
    provider: Any,
    receipt_path: Path,
    poll_interval: float = 2.0,
) -> dict[str, Any]:
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    counts = {"created": 0, "skipped": 0, "failed": 0}
    records = list(manifest.get("source_packets", [])) + list(manifest.get("event_packets", []))
    with receipt_path.open("x", encoding="utf-8") as receipts:
        for record in records:
            path = validate_packet(packet_root, record)
            source_id = str(record["source_id"])
            event_ids = (str(record["event_id"]),) if "event_id" in record else tuple(record.get("linked_event_ids", []))
            try:
                existing = find_exact_resource_with_retry(
                    provider, record, interval=poll_interval
                )
                if existing is not None:
                    receipt = IngestReceipt(
                        status="skipped",
                        source_id=source_id,
                        attempted_at=utc_now(),
                        event_ids=event_ids,
                        openviking_uris=(existing,),
                    )
                else:
                    response = decode(
                        provider.handle_tool_call(
                            "viking_add_resource",
                            {
                                "url": str(path),
                                "to": record["target_uri"],
                                "reason": "Approved Mark Crypto V2 provenance packet import.",
                                "instruction": "Preserve the visible provenance and source content exactly; do not invent facts.",
                                "wait": False,
                            },
                        )
                    )
                    if response.get("error"):
                        raise RuntimeError("native provider add failed")
                    created_uri = wait_for_exact_resource(
                        provider, record, interval=poll_interval
                    )
                    receipt = IngestReceipt(
                        status="created",
                        source_id=source_id,
                        attempted_at=utc_now(),
                        event_ids=event_ids,
                        openviking_uris=(created_uri,),
                    )
                write_receipt(receipts, receipt)
                counts[receipt.status] += 1
            except Exception as error:
                failed = IngestReceipt(
                    status="failed",
                    source_id=source_id,
                    attempted_at=utc_now(),
                    event_ids=event_ids,
                    error_class=type(error).__name__,
                )
                write_receipt(receipts, failed)
                counts["failed"] += 1
                raise
    return {
        "schema": "mark.crypto.import-result/v1",
        "records": len(records),
        **counts,
        "receipt_file": str(receipt_path),
    }


def connect_native_provider() -> Any:
    from dotenv import load_dotenv
    from plugins.memory.openviking import OpenVikingMemoryProvider

    load_dotenv("/opt/data/.env", override=True)
    provider = OpenVikingMemoryProvider()
    provider.initialize(
        "mark-v2-crypto-production-import",
        hermes_home="/opt/data",
        platform="automation",
    )
    if not provider._ensure_client():
        raise RuntimeError("Hermes native OpenViking provider did not connect")
    return provider


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("packet_root", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm")
    parser.add_argument("--receipt-file", type=Path)
    args = parser.parse_args()
    root = args.packet_root.resolve()
    manifest = load_manifest(root)
    records = len(manifest.get("source_packets", [])) + len(manifest.get("event_packets", []))
    for record in list(manifest.get("source_packets", [])) + list(manifest.get("event_packets", [])):
        validate_packet(root, record)
    if not args.apply:
        print(
            json.dumps(
                {
                    "schema": "mark.crypto.import-plan/v1",
                    "apply": False,
                    "openviking_write_performed": False,
                    "records": records,
                },
                indent=2,
                sort_keys=True,
            )
        )
        return
    if args.confirm != CONFIRMATION or args.receipt_file is None:
        raise SystemExit("apply requires the exact confirmation phrase and --receipt-file")
    provider = connect_native_provider()
    try:
        result = execute(root, manifest, provider, args.receipt_file.resolve())
        print(json.dumps(result, indent=2, sort_keys=True))
    finally:
        provider.shutdown()


if __name__ == "__main__":
    main()
