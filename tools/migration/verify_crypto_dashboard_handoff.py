#!/usr/bin/env python3
"""Verify the frozen Crypto dashboard database and optional private media tree."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any


TABLES = {
    "sources",
    "events",
    "event_facets",
    "themes",
    "theme_events",
    "content_drafts",
    "quiz_sessions",
    "quiz_questions",
    "quiz_answers",
    "quiz_event_links",
    "pin_summaries",
    "generation_meta",
    "conversation_sessions",
    "conversation_messages",
    "media_assets",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_child(root: Path, relative_path: str) -> Path:
    base = root.resolve()
    path = (base / relative_path).resolve()
    if base not in path.parents or not path.is_file():
        raise ValueError(f"unsafe or missing handoff file: {relative_path}")
    return path


def verify(handoff_root: Path, media_root: Path | None = None) -> dict[str, Any]:
    root = handoff_root.resolve()
    manifest = json.loads((root / "handoff-manifest.json").read_text(encoding="utf-8"))
    media_manifest = json.loads((root / "media-manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != "mark.crypto.dashboard-handoff-manifest/v1":
        raise ValueError("unsupported dashboard handoff manifest")
    if media_manifest.get("schema") != "mark.crypto.media-manifest/v1":
        raise ValueError("unsupported media manifest")

    database_meta = manifest["database"]
    database = safe_child(root, str(database_meta["path"]))
    if database.stat().st_size != int(database_meta["bytes"]):
        raise ValueError("dashboard database byte count mismatch")
    if sha256_file(database) != str(database_meta["sha256"]):
        raise ValueError("dashboard database checksum mismatch")

    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
        if integrity != "ok" or foreign_keys:
            raise ValueError("dashboard database integrity verification failed")
        observed_counts: dict[str, int] = {}
        for table, expected in database_meta["counts"].items():
            if table not in TABLES:
                raise ValueError(f"unexpected dashboard table in manifest: {table}")
            observed = int(connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
            if observed != int(expected):
                raise ValueError(f"dashboard row count mismatch: {table}")
            observed_counts[table] = observed
    finally:
        connection.close()

    files = list(media_manifest.get("files", []))
    if len(files) != int(manifest["media"]["files"]):
        raise ValueError("media manifest file count mismatch")
    if sum(int(item["bytes"]) for item in files) != int(manifest["media"]["bytes"]):
        raise ValueError("media manifest byte total mismatch")

    media_verified = 0
    if media_root is not None:
        for item in files:
            path = safe_child(media_root, str(item["relative_path"]))
            if path.stat().st_size != int(item["bytes"]):
                raise ValueError("media byte count mismatch")
            if sha256_file(path) != str(item["sha256"]):
                raise ValueError("media checksum mismatch")
            media_verified += 1

    return {
        "schema": "mark.crypto.dashboard-handoff-verification/v1",
        "verified": True,
        "database_sha256": str(database_meta["sha256"]),
        "database_integrity": integrity,
        "foreign_key_errors": len(foreign_keys),
        "row_counts": observed_counts,
        "media_manifest_files": len(files),
        "media_manifest_bytes": sum(int(item["bytes"]) for item in files),
        "media_files_checksum_verified": media_verified,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("handoff_root", type=Path)
    parser.add_argument("--media-root", type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.handoff_root, args.media_root), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
