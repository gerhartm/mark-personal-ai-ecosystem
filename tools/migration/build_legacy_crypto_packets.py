#!/usr/bin/env python3
"""Build reviewable Crypto V2 packets without calling Hermes or OpenViking.

The consistent legacy SQLite snapshot is canonical. Output is local-only and
contains client content, so it belongs under the ignored `.work` tree. This
tool has no network client and cannot write to V2 memory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit

from crypto_intelligence.provenance import (
    EventEnvelope,
    SourceEnvelope,
    file_source_id,
    label_source_id,
    needs_create,
    normalize_url,
    text_source_id,
    unique_ids,
    url_source_id,
    utc_now,
)


SOURCE_TYPE_MAP = {
    "article": "article",
    "instagram_reel": "instagram",
    "podcast_transcript": "audio",
    "retrospective": "note",
    "telegram_channel": "note",
    "telegram_forward": "note",
    "video_instagram": "instagram",
    "video_transcript": "video",
    "video_youtube": "youtube",
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def load_existing(path: Path | None) -> tuple[set[str], set[str]]:
    if path is None:
        return set(), set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("existing IDs must be a JSON object")
    return set(payload.get("source_ids", [])), set(payload.get("event_ids", []))


def parse_list(value: Any) -> tuple[str, ...]:
    if value is None or value == "":
        return ()
    parsed = value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            parsed = [value]
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list):
        parsed = [parsed]
    rendered = []
    for item in parsed:
        if item is None or item == "":
            continue
        if isinstance(item, (dict, list)):
            rendered.append(json.dumps(item, ensure_ascii=False, sort_keys=True))
        else:
            rendered.append(str(item).strip())
    return unique_ids(rendered)


def absolute_http_url(value: str) -> bool:
    parsed = urlsplit(value)
    return parsed.scheme.lower() in {"http", "https"} and bool(parsed.hostname)


def source_identity(row: dict[str, Any]) -> tuple[str, str | None, str | None, str]:
    reference = str(row.get("source_url") or "").strip()
    raw_text = str(row.get("raw_text") or "").strip()
    if reference and absolute_http_url(reference):
        normalized = normalize_url(reference)
        return url_source_id(normalized), normalized, None, "normalized_url"
    if reference:
        return label_source_id(reference), None, reference, "legacy_label"
    if raw_text:
        return text_source_id(raw_text), None, None, "preserved_text"
    raise ValueError(f"event {row.get('id', '<missing>')} has no source identity")


def normalize_timestamp(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if "T" in raw or " " in raw:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace(
                "+00:00", "Z"
            )
        return date.fromisoformat(raw).isoformat()
    except ValueError:
        return None


def event_date(row: dict[str, Any]) -> str:
    for field in ("posted_date", "timestamp", "ingested_at"):
        normalized = normalize_timestamp(row.get(field))
        if normalized:
            return normalized[:10]
    raise ValueError(f"event {row.get('id', '<missing>')} has no valid date")


def captured_at(rows: list[dict[str, Any]]) -> str:
    candidates = []
    for row in rows:
        for field in ("ingested_at", "timestamp"):
            normalized = normalize_timestamp(row.get(field))
            if normalized:
                candidates.append(normalized)
                break
    if not candidates:
        raise ValueError("source group has no valid captured timestamp")
    first = sorted(candidates)[0]
    return first if "T" in first else first + "T00:00:00Z"


def resolve_legacy_path(crypto_root: Path, raw: Any) -> Path | None:
    value = str(raw or "").strip()
    if not value:
        return None
    for marker in ("/root/crypto-intel/", "~/crypto-intel/"):
        if value.startswith(marker):
            candidate = crypto_root / value[len(marker) :]
            return candidate if candidate.is_file() else None
    candidate = Path(value)
    if not candidate.is_absolute():
        mapped = crypto_root / candidate
        if mapped.is_file():
            return mapped
    matches = [path for path in crypto_root.rglob(candidate.name) if path.is_file()]
    return matches[0] if len(matches) == 1 else None


def legacy_archive_ref(crypto_root: Path, path: Path) -> str:
    return "legacy-export://root/crypto-intel/" + path.relative_to(crypto_root).as_posix()


def extract_json_text(value: Any) -> str:
    if isinstance(value, dict):
        direct = value.get("text")
        if isinstance(direct, str) and direct.strip():
            return direct.strip()
        parts = []
        for key in ("raw_text", "summary", "detailed_content", "key_insights", "detailed_notes"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                parts.append(item.strip())
            elif isinstance(item, list):
                parts.extend(str(entry).strip() for entry in item if str(entry).strip())
        return "\n\n".join(parts)
    if isinstance(value, list):
        return "\n".join(str(item).strip() for item in value if str(item).strip())
    return str(value or "").strip()


def extract_docx_text(path: Path) -> str:
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    paragraphs = []
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    for paragraph in root.iter(namespace + "p"):
        text = "".join(node.text or "" for node in paragraph.iter(namespace + "t")).strip()
        if text:
            paragraphs.append(text)
    return "\n\n".join(paragraphs)


def extract_transcript_text(path: Path) -> tuple[str, str]:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".csv"}:
        text = path.read_text(encoding="utf-8", errors="replace")
        method = "migration.plain-text"
    elif suffix in {".json", ".jsonl"}:
        if suffix == ".jsonl":
            values = [
                json.loads(line)
                for line in path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
        else:
            values = json.loads(path.read_text(encoding="utf-8"))
        text = extract_json_text(values)
        method = "migration.json-text-fields"
    elif suffix == ".docx":
        text = extract_docx_text(path)
        method = "migration.docx-openxml"
    elif suffix == ".pdf":
        completed = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        text = completed.stdout
        method = "migration.pdftotext"
    else:
        raise ValueError(f"unsupported transcript format: {suffix or '<none>'}")
    normalized = normalize_legacy_references(text).strip()
    if not normalized:
        raise ValueError(f"transcript extraction produced no text: {path.name}")
    return normalized, method


def source_type(rows: list[dict[str, Any]]) -> str:
    mapped = [SOURCE_TYPE_MAP.get(str(row.get("source_type") or ""), "note") for row in rows]
    counts = Counter(mapped)
    return sorted(counts, key=lambda item: (-counts[item], item))[0]


def useful_title(text: Any, fallback: str) -> str:
    normalized = " ".join(normalize_legacy_references(str(text or "")).split())
    if not normalized:
        return fallback
    return normalized if len(normalized) <= 180 else normalized[:177].rstrip() + "..."


def normalize_legacy_references(value: str) -> str:
    """Replace dead VPS paths while the checksum keeps the original recoverable."""

    return value.replace(
        "/root/crypto-intel/", "legacy-export://root/crypto-intel/"
    ).replace("~/crypto-intel/", "legacy-export://root/crypto-intel/")


def append_text_section(parts: list[str], heading: str, value: Any) -> None:
    text = normalize_legacy_references(str(value or "")).strip()
    if text:
        parts.extend([f"## {heading}", "", text, ""])


def append_list_section(parts: list[str], heading: str, values: Iterable[str]) -> None:
    items = unique_ids(values)
    if items:
        parts.extend([f"## {heading}", ""])
        parts.extend(f"- {normalize_legacy_references(item)}" for item in items)
        parts.append("")


def target_source_uri(source_id: str) -> str:
    return "viking://user/hermes/resources/crypto/sources/source-" + source_id.split(":", 1)[1] + ".md"


def target_event_uri(event_id_value: str) -> str:
    digest = sha256_bytes(event_id_value.encode("utf-8"))
    return f"viking://user/hermes/resources/crypto/events/event-{digest}.md"


def render_source_packet(
    crypto_root: Path,
    source_id_value: str,
    rows: list[dict[str, Any]],
) -> tuple[str, dict[str, Any]]:
    _, normalized_url, label, identity_basis = source_identity(rows[0])
    transcript_paths = unique_ids(
        str(path)
        for row in rows
        if (path := resolve_legacy_path(crypto_root, row.get("transcript_path")))
    )
    transcripts = [Path(path) for path in transcript_paths]
    channels = unique_ids(str(row.get("source_channel") or "").strip() for row in rows)
    event_ids = unique_ids(str(row.get("id") or "").strip() for row in rows)
    tags = unique_ids(
        ["legacy-migration", "crypto"]
        + [tag for row in rows for tag in parse_list(row.get("tags"))]
    )

    reference = normalized_url or label or source_id_value
    host = urlsplit(normalized_url).hostname if normalized_url else None
    title = (
        f"Legacy Crypto source: {host}"
        if host
        else f"Legacy Crypto source: {label}"
        if label
        else f"Legacy Crypto source: {source_id_value[-12:]}"
    )

    parts = [
        "This resource preserves source evidence from the canonical legacy Crypto Intelligence export.",
        "",
        f"Identity basis: {identity_basis}",
        f"Source reference: {reference}",
        "",
    ]
    append_list_section(parts, "Linked legacy event IDs", event_ids)
    append_list_section(parts, "Source channels", channels)

    seen_raw: set[str] = set()
    raw_sections: list[str] = []
    for row in rows:
        raw = normalize_legacy_references(str(row.get("raw_text") or "")).strip()
        if raw and raw not in seen_raw:
            seen_raw.add(raw)
            raw_sections.extend([f"### Event {row['id']}", "", raw, ""])
    if raw_sections:
        parts.extend(["## Preserved source text", ""] + raw_sections)

    transcript_metadata = []
    for path in transcripts:
        archive_ref = legacy_archive_ref(crypto_root, path)
        digest = file_source_id(path)
        transcript_metadata.append(
            {"filename": path.name, "archive_ref": archive_ref, "sha256": digest}
        )
        content, transcript_method = extract_transcript_text(path)
        parts.extend(
            [
                f"## Preserved transcript: {path.name}",
                "",
                f"Archive reference: {archive_ref}",
                f"Original SHA-256: {digest}",
                f"Text extraction: {transcript_method}",
                "",
                content,
                "",
            ]
        )

    posted_values = unique_ids(
        normalized
        for row in rows
        if (normalized := normalize_timestamp(row.get("posted_date")))
    )
    envelope = SourceEnvelope(
        source_id=source_id_value,
        source_type=source_type(rows),
        source_url=normalized_url,
        source_label=label,
        source_channel=channels[0] if len(channels) == 1 else None,
        captured_at=captured_at(rows),
        posted_at=posted_values[0] if len(posted_values) == 1 else None,
        original_sha256=transcript_metadata[0]["sha256"] if len(transcript_metadata) == 1 else None,
        original_filename=transcript_metadata[0]["filename"] if len(transcript_metadata) == 1 else None,
        archive_ref=transcript_metadata[0]["archive_ref"] if len(transcript_metadata) == 1 else None,
        extraction_method="legacy.sqlite+preserved-export",
        extraction_status="complete",
        title=title,
        body="\n".join(parts).strip(),
        tags=tags,
    )
    return envelope.render_markdown(), {
        "source_id": source_id_value,
        "identity_basis": identity_basis,
        "linked_event_ids": list(event_ids),
        "transcript_count": len(transcripts),
        "transcript_text_extracted": len(transcripts),
        "target_uri": target_source_uri(source_id_value),
    }


def render_event_packet(row: dict[str, Any], source_id_value: str) -> tuple[str, dict[str, Any]]:
    event_id_value = str(row.get("id") or "").strip()
    if not event_id_value:
        raise ValueError("legacy event ID is blank")
    parts = [f"Linked source URI: {target_source_uri(source_id_value)}", ""]
    append_text_section(parts, "Summary", row.get("summary"))
    append_text_section(parts, "Detailed content", row.get("detailed_content"))
    append_list_section(parts, "Key insights", parse_list(row.get("key_insights")))
    append_text_section(parts, "Business signal", row.get("business_signal"))
    append_text_section(parts, "Underlying principle", row.get("underlying_principle"))
    append_text_section(parts, "Mark's notes", row.get("my_notes"))
    append_text_section(parts, "Detailed notes", row.get("detailed_notes"))
    append_text_section(parts, "Raw supporting text", row.get("raw_text"))
    append_list_section(parts, "Discussed dates", parse_list(row.get("discussed_dates")))
    significance = row.get("significance")
    if significance is not None and significance != "":
        append_text_section(parts, "Legacy significance score", significance)

    title = useful_title(row.get("summary"), f"Legacy Crypto event {event_id_value}")
    envelope = EventEnvelope(
        event_id=event_id_value,
        legacy_event_id=event_id_value,
        source_id=source_id_value,
        event_date=event_date(row),
        title=title,
        body="\n".join(parts).strip(),
        primary_category=str(row.get("primary_category") or "").strip() or None,
        secondary_categories=parse_list(row.get("secondary_categories")),
        entities=parse_list(row.get("entities")),
        tags=parse_list(row.get("tags")),
        related_event_ids=parse_list(row.get("connections")),
    )
    return envelope.render_markdown(), {
        "event_id": event_id_value,
        "source_id": source_id_value,
        "target_uri": target_event_uri(event_id_value),
    }


def write_packet(root: Path, relative: Path, content: str) -> dict[str, Any]:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return {
        "path": relative.as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256_bytes(path.read_bytes()),
    }


def build(
    export_root: Path,
    existing_ids_path: Path | None = None,
    output_dir: Path | None = None,
) -> dict[str, Any]:
    crypto_root = export_root / "root" / "crypto-intel"
    database = (
        export_root
        / "database-snapshots"
        / "root"
        / "crypto-intel-dashboard"
        / "data"
        / "intel.db"
    )
    if not crypto_root.is_dir() or not database.is_file():
        raise FileNotFoundError("preserved Crypto export or canonical database is missing")
    if output_dir and output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"output directory is not empty: {output_dir}")

    existing_sources, existing_events = load_existing(existing_ids_path)
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    rows = [dict(row) for row in connection.execute("SELECT * FROM events ORDER BY id")]
    connection.close()
    if integrity != "ok":
        raise RuntimeError(f"canonical database integrity check failed: {integrity}")

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    row_sources: dict[str, str] = {}
    failures: list[dict[str, str]] = []
    for row in rows:
        event_id_value = str(row.get("id") or "").strip()
        try:
            identity = source_identity(row)
            grouped[identity[0]].append(row)
            row_sources[event_id_value] = identity[0]
        except (TypeError, ValueError) as error:
            failures.append({"event_id": event_id_value, "error_class": type(error).__name__})

    source_packets: list[dict[str, Any]] = []
    event_packets: list[dict[str, Any]] = []
    output = output_dir.resolve() if output_dir else None
    if output:
        output.mkdir(parents=True, exist_ok=True)

    for source_id_value in sorted(grouped):
        if not needs_create(source_id_value, existing_sources):
            continue
        content, metadata = render_source_packet(crypto_root, source_id_value, grouped[source_id_value])
        relative = Path("sources") / f"source-{source_id_value.split(':', 1)[1]}.md"
        packet = {**metadata, "path": relative.as_posix(), "bytes": len(content.encode("utf-8")), "sha256": sha256_bytes(content.encode("utf-8"))}
        if output:
            packet.update(write_packet(output, relative, content))
        source_packets.append(packet)

    for row in rows:
        event_id_value = str(row.get("id") or "").strip()
        if event_id_value not in row_sources or not needs_create(event_id_value, existing_events):
            continue
        content, metadata = render_event_packet(row, row_sources[event_id_value])
        relative = Path("events") / f"event-{sha256_bytes(event_id_value.encode('utf-8'))}.md"
        packet = {**metadata, "path": relative.as_posix(), "bytes": len(content.encode("utf-8")), "sha256": sha256_bytes(content.encode("utf-8"))}
        if output:
            packet.update(write_packet(output, relative, content))
        event_packets.append(packet)

    source_total = len(grouped)
    event_total = len(row_sources)
    manifest = {
        "schema": "mark.crypto.migration-manifest/v1",
        "generated_at": utc_now(),
        "canonical_source": "transaction-consistent intel.db",
        "database_integrity": integrity,
        "openviking_write_performed": False,
        "output_contains_client_content": bool(output),
        "counts": {
            "source_total": source_total,
            "source_create": len(source_packets),
            "source_skip": source_total - len(source_packets),
            "event_total": event_total,
            "event_create": len(event_packets),
            "event_skip": event_total - len(event_packets),
            "packet_create": len(source_packets) + len(event_packets),
            "failures": len(failures),
            "transcript_references_resolved": sum(packet["transcript_count"] for packet in source_packets),
            "transcript_text_extracted": sum(
                packet["transcript_text_extracted"] for packet in source_packets
            ),
        },
        "source_packets": source_packets,
        "event_packets": event_packets,
        "failures": failures,
    }
    redacted = {
        "schema": "mark.crypto.migration-reconciliation/v1",
        "generated_at": manifest["generated_at"],
        "canonical_source": manifest["canonical_source"],
        "database_integrity": integrity,
        "openviking_write_performed": False,
        "packet_files_written_locally": bool(output),
        "counts": manifest["counts"],
    }
    if output:
        (output / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        (output / "reconciliation-redacted.json").write_text(
            json.dumps(redacted, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    return redacted


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("export_root", type=Path)
    parser.add_argument("--existing-ids", type=Path)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    report = build(
        args.export_root.resolve(),
        args.existing_ids.resolve() if args.existing_ids else None,
        args.output_dir.resolve() if args.output_dir else None,
    )
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
