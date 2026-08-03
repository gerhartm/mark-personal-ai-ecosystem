#!/usr/bin/env python3
"""Read-only structural audit for the preserved Crypto Intelligence dataset.

The report intentionally contains counts, field coverage, integrity results, and
dataset fingerprints only. It never emits client content, URLs, credentials, or
conversation text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


EVENT_JSON_FIELDS = {
    "secondary_categories",
    "entities",
    "connections",
    "tags",
    "video_metadata",
    "key_insights",
    "discussed_dates",
}


def digest_files(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda item: item.name):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def normalize_db_value(field: str, value: Any) -> Any:
    if field not in EVENT_JSON_FIELDS or value is None:
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return value


def map_legacy_path(crypto_root: Path, raw: str | None) -> Path | None:
    if not raw:
        return None
    marker = "/root/crypto-intel/"
    if raw.startswith(marker):
        return crypto_root / raw[len(marker) :]
    home_marker = "~/crypto-intel/"
    if raw.startswith(home_marker):
        return crypto_root / raw[len(home_marker) :]
    candidate = Path(raw)
    if candidate.is_absolute():
        basename_matches = [
            path for path in crypto_root.rglob(candidate.name) if path.is_file()
        ]
        return basename_matches[0] if len(basename_matches) == 1 else None
    mapped = crypto_root / candidate
    if mapped.is_file():
        return mapped
    basename_matches = [path for path in crypto_root.rglob(candidate.name) if path.is_file()]
    return basename_matches[0] if len(basename_matches) == 1 else mapped


def table_counts(connection: sqlite3.Connection) -> dict[str, int]:
    result: dict[str, int] = {}
    names = connection.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    for (name,) in names:
        escaped = name.replace('"', '""')
        result[name] = int(
            connection.execute(f'SELECT COUNT(*) FROM "{escaped}"').fetchone()[0]
        )
    return result


def audit(export_root: Path) -> dict[str, Any]:
    crypto_root = export_root / "root" / "crypto-intel"
    database = (
        export_root
        / "database-snapshots"
        / "root"
        / "crypto-intel-dashboard"
        / "data"
        / "intel.db"
    )
    if not crypto_root.is_dir():
        raise FileNotFoundError(f"Crypto dataset not found: {crypto_root}")
    if not database.is_file():
        raise FileNotFoundError(f"Consistent dashboard snapshot not found: {database}")

    event_paths = sorted((crypto_root / "events").glob("*.json"))
    events: list[dict[str, Any]] = []
    invalid_event_files = 0
    for path in event_paths:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            invalid_event_files += 1
            continue
        if not isinstance(value, dict):
            invalid_event_files += 1
            continue
        events.append(value)

    ids = [str(event.get("id", "")) for event in events]
    source_references = [
        str(event["source_url"]).strip()
        for event in events
        if event.get("source_url")
    ]
    absolute_urls = [
        value
        for value in source_references
        if urlsplit(value).scheme.lower() in {"http", "https"}
        and urlsplit(value).hostname
    ]
    legacy_source_labels = [
        value for value in source_references if value not in absolute_urls
    ]
    transcript_refs = [
        map_legacy_path(crypto_root, event.get("transcript_path")) for event in events
    ]
    transcript_refs_present = [path for path in transcript_refs if path is not None]

    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    counts = table_counts(connection)
    rows = connection.execute("SELECT * FROM events ORDER BY id").fetchall()
    db_by_id = {str(row["id"]): dict(row) for row in rows}
    file_by_id = {str(event.get("id", "")): event for event in events}

    mismatch_fields: Counter[str] = Counter()
    mismatched_records = 0
    for event_id in sorted(set(file_by_id) & set(db_by_id)):
        source = file_by_id[event_id]
        stored = db_by_id[event_id]
        record_mismatch = False
        for field in sorted(set(source) & set(stored)):
            left = source[field]
            right = normalize_db_value(field, stored[field])
            if left != right:
                mismatch_fields[field] += 1
                record_mismatch = True
        if record_mismatch:
            mismatched_records += 1
    connection.close()

    all_files = [path for path in crypto_root.rglob("*") if path.is_file()]
    archive_files = [path for path in (crypto_root / "archive").glob("*") if path.is_file()]
    media_suffixes = {".mp4", ".mp3", ".m4a", ".wav", ".mov", ".webm"}
    media_files = [path for path in archive_files if path.suffix.lower() in media_suffixes]
    metadata_files = list((crypto_root / "archive").glob("*.info.json"))
    transcript_files = [
        path for path in (crypto_root / "transcripts").glob("*") if path.is_file()
    ]
    conversation_files = list((crypto_root / "conversation-archive").glob("*.jsonl"))

    return {
        "report_version": 1,
        "read_only": True,
        "dataset": {
            "files": len(all_files),
            "bytes": sum(path.stat().st_size for path in all_files),
            "event_set_sha256": digest_files(event_paths),
            "dashboard_snapshot_sha256": hashlib.sha256(database.read_bytes()).hexdigest(),
        },
        "events": {
            "files": len(event_paths),
            "parsed": len(events),
            "invalid": invalid_event_files,
            "unique_ids": len(set(ids)),
            "empty_ids": sum(not value for value in ids),
            "source_references_present": len(source_references),
            "duplicate_source_references": sum(
                count - 1
                for count in Counter(source_references).values()
                if count > 1
            ),
            "absolute_urls_present": len(absolute_urls),
            "unique_absolute_urls": len(set(absolute_urls)),
            "duplicate_source_urls": sum(
                count - 1 for count in Counter(absolute_urls).values() if count > 1
            ),
            "legacy_source_labels_present": len(legacy_source_labels),
            "unique_legacy_source_labels": len(set(legacy_source_labels)),
            "raw_text_present": sum(bool(event.get("raw_text")) for event in events),
            "summary_present": sum(bool(event.get("summary")) for event in events),
            "posted_date_present": sum(bool(event.get("posted_date")) for event in events),
            "transcript_references_present": len(transcript_refs_present),
            "transcript_references_resolved": sum(
                path.is_file() for path in transcript_refs_present
            ),
        },
        "database": {
            "integrity": integrity,
            "table_counts": counts,
            "event_ids_missing_from_files": len(set(db_by_id) - set(file_by_id)),
            "event_ids_missing_from_database": len(set(file_by_id) - set(db_by_id)),
            "event_records_with_field_differences": mismatched_records,
            "field_difference_counts": dict(sorted(mismatch_fields.items())),
        },
        "source_assets": {
            "archive_files": len(archive_files),
            "archive_bytes": sum(path.stat().st_size for path in archive_files),
            "media_files": len(media_files),
            "media_bytes": sum(path.stat().st_size for path in media_files),
            "metadata_files": len(metadata_files),
            "transcript_files": len(transcript_files),
            "conversation_archives": len(conversation_files),
        },
        "migration_boundary": {
            "canonical_event_source": "transaction-consistent SQLite snapshot",
            "cross_check_source": "event JSON files",
            "memory_import": "event provenance packets plus transcripts and metadata",
            "binary_handling": "preserve by checksum; reference from memory; do not embed raw media",
            "excluded_from_automatic_memory_import": [
                "credentials and cookies",
                "OpenClaw runtime state",
                "historical backup event folders",
                "generated drafts, quizzes, and session logs",
                "raw conversation archives",
            ],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("export_root", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit(args.export_root.resolve())
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
