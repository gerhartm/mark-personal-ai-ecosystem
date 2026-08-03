#!/usr/bin/env python3
"""Verify a local Crypto packet set without printing client content."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path
from typing import Any


FIELD_PATTERNS = {
    "source_id": re.compile(r'^source_id: "([^"]+)"$', re.MULTILINE),
    "event_id": re.compile(r'^event_id: "([^"]+)"$', re.MULTILINE),
    "schema": re.compile(r'^schema: "([^"]+)"$', re.MULTILINE),
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def field(content: str, name: str) -> str:
    match = FIELD_PATTERNS[name].search(content)
    if not match:
        raise ValueError(f"packet is missing visible {name}")
    return match.group(1)


def safe_packet_path(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if root.resolve() not in path.parents:
        raise ValueError("packet path escapes output root")
    return path


def canonical_event_ids(export_root: Path) -> set[str]:
    database = (
        export_root
        / "database-snapshots"
        / "root"
        / "crypto-intel-dashboard"
        / "data"
        / "intel.db"
    )
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        connection.close()
        raise RuntimeError(f"canonical database integrity check failed: {integrity}")
    values = {str(row[0]) for row in connection.execute("SELECT id FROM events")}
    connection.close()
    return values


def verify(export_root: Path, packet_root: Path) -> dict[str, Any]:
    manifest_path = packet_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("openviking_write_performed") is not False:
        raise ValueError("manifest does not prove a write-free build")
    if manifest.get("failures"):
        raise ValueError("manifest contains packet failures")

    source_ids: set[str] = set()
    event_ids: set[str] = set()
    event_source_ids: set[str] = set()
    target_uris: set[str] = set()
    verified_bytes = 0

    for kind, expected_schema, records in (
        ("source", "mark.crypto.source/v1", manifest.get("source_packets", [])),
        ("event", "mark.crypto.event/v1", manifest.get("event_packets", [])),
    ):
        for record in records:
            path = safe_packet_path(packet_root, str(record["path"]))
            if not path.is_file():
                raise FileNotFoundError(path)
            content = path.read_text(encoding="utf-8")
            if content.startswith("---") or "## Provenance" not in content:
                raise ValueError(f"{kind} packet does not use visible provenance")
            if path.stat().st_size != int(record["bytes"]):
                raise ValueError(f"packet byte mismatch: {record['path']}")
            if sha256_file(path) != record["sha256"]:
                raise ValueError(f"packet checksum mismatch: {record['path']}")
            if field(content, "schema") != expected_schema:
                raise ValueError(f"packet schema mismatch: {record['path']}")
            source_id_value = field(content, "source_id")
            if source_id_value != record["source_id"]:
                raise ValueError(f"source linkage mismatch: {record['path']}")
            if record["target_uri"] in target_uris:
                raise ValueError("duplicate target URI")
            target_uris.add(record["target_uri"])
            verified_bytes += path.stat().st_size
            if kind == "source":
                if source_id_value in source_ids:
                    raise ValueError("duplicate source identity")
                source_ids.add(source_id_value)
            else:
                event_id_value = field(content, "event_id")
                if event_id_value != record["event_id"] or event_id_value in event_ids:
                    raise ValueError("duplicate or mismatched event identity")
                event_ids.add(event_id_value)
                event_source_ids.add(source_id_value)

    canonical_ids = canonical_event_ids(export_root)
    if event_ids != canonical_ids:
        raise ValueError("packet event IDs do not exactly match canonical database")
    if not event_source_ids.issubset(source_ids):
        raise ValueError("one or more events point to a missing source packet")

    counts = manifest.get("counts", {})
    if int(counts.get("source_create", -1)) != len(source_ids):
        raise ValueError("source count mismatch")
    if int(counts.get("event_create", -1)) != len(event_ids):
        raise ValueError("event count mismatch")
    if int(counts.get("packet_create", -1)) != len(source_ids) + len(event_ids):
        raise ValueError("total packet count mismatch")

    return {
        "schema": "mark.crypto.packet-verification/v1",
        "verified": True,
        "openviking_write_performed": False,
        "source_packets": len(source_ids),
        "event_packets": len(event_ids),
        "total_packets": len(source_ids) + len(event_ids),
        "unique_target_uris": len(target_uris),
        "verified_packet_bytes": verified_bytes,
        "canonical_event_ids_exact": True,
        "all_event_source_links_resolved": True,
        "all_checksums_match": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("export_root", type=Path)
    parser.add_argument("packet_root", type=Path)
    args = parser.parse_args()
    result = verify(args.export_root.resolve(), args.packet_root.resolve())
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
