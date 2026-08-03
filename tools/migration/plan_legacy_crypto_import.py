#!/usr/bin/env python3
"""Build a write-free aggregate plan for legacy Crypto migration.

No source URL, text, title, note, or client content is emitted. Existing IDs may
be supplied as a JSON object with `source_ids` and `event_ids` arrays.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any

from crypto_intelligence.provenance import (
    label_source_id,
    normalize_url,
    text_source_id,
    url_source_id,
)


def load_existing(path: Path | None) -> tuple[set[str], set[str]]:
    if path is None:
        return set(), set()
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("existing-ID input must be a JSON object")
    return set(value.get("source_ids", [])), set(value.get("event_ids", []))


def plan(export_root: Path, existing_path: Path | None = None) -> dict[str, Any]:
    database = (
        export_root
        / "database-snapshots"
        / "root"
        / "crypto-intel-dashboard"
        / "data"
        / "intel.db"
    )
    if not database.is_file():
        raise FileNotFoundError(database)

    existing_sources, existing_events = load_existing(existing_path)
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    rows = [dict(row) for row in connection.execute("SELECT * FROM events ORDER BY id")]
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    connection.close()

    sources: set[str] = set()
    fallback_text_sources = 0
    legacy_label_sources = 0
    failures = 0
    for row in rows:
        raw_url = str(row.get("source_url") or "").strip()
        raw_text = str(row.get("raw_text") or "").strip()
        try:
            if raw_url and normalize_url(raw_url):
                source_id = url_source_id(raw_url)
            elif raw_text:
                source_id = text_source_id(raw_text)
                fallback_text_sources += 1
            else:
                failures += 1
                continue
        except ValueError:
            if raw_url:
                source_id = label_source_id(raw_url)
                legacy_label_sources += 1
            elif raw_text:
                source_id = text_source_id(raw_text)
                fallback_text_sources += 1
            else:
                failures += 1
                continue
        sources.add(source_id)

    event_ids = {str(row["id"]) for row in rows if row.get("id")}
    source_creates = len(sources - existing_sources)
    source_skips = len(sources & existing_sources)
    event_creates = len(event_ids - existing_events)
    event_skips = len(event_ids & existing_events)

    return {
        "report_version": 1,
        "write_performed": False,
        "canonical_source": "transaction-consistent intel.db",
        "database_integrity": integrity,
        "observed_existing_ids": existing_path is not None,
        "plan": {
            "source_resources_total": len(sources),
            "source_resources_create": source_creates,
            "source_resources_skip": source_skips,
            "event_resources_total": len(event_ids),
            "event_resources_create": event_creates,
            "event_resources_skip": event_skips,
            "memory_resources_create": source_creates + event_creates,
            "memory_resources_skip": source_skips + event_skips,
            "fallback_text_sources": fallback_text_sources,
            "legacy_label_sources": legacy_label_sources,
            "failures": failures,
        },
        "excluded": [
            "binary media bytes",
            "credentials and cookies",
            "OpenClaw runtime state",
            "historical event backups",
            "raw conversations and sessions",
            "generated drafts, quizzes, and themes",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("export_root", type=Path)
    parser.add_argument("--existing-ids", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = plan(args.export_root.resolve(), args.existing_ids)
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
