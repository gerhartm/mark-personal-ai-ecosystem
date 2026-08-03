#!/usr/bin/env python3
"""Build Mark's complete legacy Crypto memory and dashboard handoff.

The active-memory layer contains knowledge that should influence retrieval and
reasoning. The dashboard layer preserves every current structured record plus
sanitized human/assistant conversation text and an immutable media inventory.
Raw tool logs, credentials, cookies, duplicate event backups, and binary media
are never inserted into semantic memory.

This builder is local and write-free with respect to Hermes/OpenViking.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from crypto_intelligence.provenance import SourceEnvelope, text_source_id, utc_now
from build_legacy_crypto_packets import (
    build as build_core_packets,
    captured_at,
    extract_transcript_text,
    file_source_id,
    legacy_archive_ref,
    normalize_legacy_references,
    normalize_timestamp,
    parse_list,
    sha256_bytes,
    source_identity,
    source_type,
    target_source_uri,
    useful_title,
    write_packet,
)


SECRET_PATTERNS = (
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S),
    re.compile(r"\b(?:sk|rk|pk|cfat|ghp|github_pat|xox[a-z])-[-A-Za-z0-9_]{16,}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b"),
    re.compile(r"(?i)\b(?:authorization\s*:\s*bearer|bearer)\s+[-A-Za-z0-9._~+/=]{16,}"),
    re.compile(
        r"(?i)\b(?:api[_ -]?key|access[_ -]?token|auth[_ -]?token|secret|password)\b"
        r"\s*[:=]\s*[^\s,;]{8,}"
    ),
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def table_rows(connection: sqlite3.Connection, table: str) -> list[dict[str, Any]]:
    exists = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if not exists:
        return []
    return [dict(row) for row in connection.execute(f'SELECT * FROM "{table}"')]


def stable_artifact_id(family: str, key: str) -> str:
    return text_source_id(f"legacy-crypto-artifact:{family}:{key}")


def stable_timestamp(values: Iterable[Any], fallback: str = "2026-07-30T00:00:00Z") -> str:
    for value in values:
        normalized = normalize_timestamp(value)
        if normalized:
            return normalized if "T" in normalized else normalized + "T00:00:00Z"
    return fallback


def target_artifact_uri(family: str, source_id_value: str) -> str:
    digest = source_id_value.split(":", 1)[1]
    return f"viking://user/hermes/resources/crypto/legacy/{family}/source-{digest}.md"


def render_artifact(
    *,
    family: str,
    key: str,
    title: str,
    body: str,
    captured: str,
    tags: Iterable[str],
    source_type_value: str = "note",
    archive_ref: str | None = None,
    original_sha256: str | None = None,
    original_filename: str | None = None,
    extraction_method: str = "legacy.sqlite",
) -> tuple[str, dict[str, Any]]:
    source_id_value = stable_artifact_id(family, key)
    envelope = SourceEnvelope(
        source_id=source_id_value,
        source_type=source_type_value,
        captured_at=captured,
        extraction_method=extraction_method,
        extraction_status="complete",
        title=title,
        body=normalize_legacy_references(body).strip(),
        archive_ref=archive_ref,
        original_sha256=original_sha256,
        original_filename=original_filename,
        tags=tuple(dict.fromkeys(["legacy-migration", "crypto", family, *tags])),
    )
    return envelope.render_markdown(), {
        "source_id": source_id_value,
        "identity_basis": f"legacy_{family}_id",
        "linked_event_ids": [],
        "transcript_count": 0,
        "transcript_text_extracted": 0,
        "artifact_family": family,
        "target_uri": target_artifact_uri(family, source_id_value),
    }


def append_artifact_packet(
    packet_root: Path,
    packets: list[dict[str, Any]],
    *,
    family: str,
    key: str,
    title: str,
    body: str,
    captured: str,
    tags: Iterable[str] = (),
    source_type_value: str = "note",
    archive_ref: str | None = None,
    original_sha256: str | None = None,
    original_filename: str | None = None,
    extraction_method: str = "legacy.sqlite",
) -> None:
    content, metadata = render_artifact(
        family=family,
        key=key,
        title=title,
        body=body,
        captured=captured,
        tags=tags,
        source_type_value=source_type_value,
        archive_ref=archive_ref,
        original_sha256=original_sha256,
        original_filename=original_filename,
        extraction_method=extraction_method,
    )
    relative = Path("legacy") / family / f"source-{metadata['source_id'].split(':', 1)[1]}.md"
    packets.append({**metadata, **write_packet(packet_root, relative, content)})


def theme_body(row: dict[str, Any]) -> str:
    linked = parse_list(row.get("event_ids"))
    parts = [str(row.get("through_line") or "").strip()]
    if linked:
        parts.extend(["", "## Linked legacy events", "", *[f"- {item}" for item in linked]])
    return "\n".join(parts).strip()


def draft_body(row: dict[str, Any]) -> str:
    parts = [
        f"Template type: {row.get('template_type') or 'unknown'}",
        f"Date range: {row.get('date_from') or 'unspecified'} to {row.get('date_to') or 'unspecified'}",
    ]
    if str(row.get("focus") or "").strip():
        parts.extend(["", "## Focus", "", str(row["focus"]).strip()])
    edited = str(row.get("edited_output") or "").strip()
    raw = str(row.get("raw_output") or "").strip()
    if edited:
        parts.extend(["", "## Final edited output", "", edited])
    if raw and raw != edited:
        parts.extend(["", "## Original generated output", "", raw])
    return "\n".join(parts).strip()


def quiz_body(
    session: dict[str, Any],
    questions: list[dict[str, Any]],
    answers_by_question: dict[str, list[dict[str, Any]]],
) -> str:
    parts = [
        f"Legacy score: {session.get('score_correct') or 0}/{session.get('score_total') or 0}",
        f"Completed at: {session.get('completed_at') or 'not completed'}",
    ]
    for question in sorted(questions, key=lambda item: int(item.get("question_number") or 0)):
        qid = str(question.get("id") or "")
        parts.extend(
            [
                "",
                f"## Question {question.get('question_number') or '?'}",
                "",
                str(question.get("question_text") or "").strip(),
                "",
                f"Type: {question.get('question_type') or 'unknown'}",
                f"Category: {question.get('category') or 'unknown'}",
            ]
        )
        guidance = str(question.get("answer_guidance") or "").strip()
        if guidance:
            parts.extend(["", "Answer guidance:", guidance])
        related = parse_list(question.get("related_event_ids"))
        if related:
            parts.extend(["", "Related legacy events:", *[f"- {item}" for item in related]])
        for answer in answers_by_question.get(qid, []):
            parts.extend(["", "### Mark's answer", "", str(answer.get("answer_text") or "").strip()])
            feedback = str(answer.get("feedback") or "").strip()
            context = str(answer.get("context_note") or "").strip()
            if feedback:
                parts.extend(["", "Feedback:", feedback])
            if context:
                parts.extend(["", "Context note:", context])
    return "\n".join(parts).strip()


def pin_body(rows: list[dict[str, Any]]) -> str:
    parts = [f"Legacy event ID: {rows[0].get('event_id')}"]
    for row in sorted(rows, key=lambda item: str(item.get("pin_key") or "")):
        parts.extend(
            [
                "",
                f"## {row.get('pin_key') or 'Pinned summary'}",
                "",
                str(row.get("summary") or "").strip(),
                "",
                f"Mode: {row.get('mode') or 'unknown'}",
                f"Model: {row.get('model') or 'unknown'}",
            ]
        )
    return "\n".join(parts).strip()


def referenced_transcripts(crypto_root: Path, events: list[dict[str, Any]]) -> set[Path]:
    result: set[Path] = set()
    for event in events:
        raw = str(event.get("transcript_path") or "").strip()
        if not raw:
            continue
        relative = raw
        for marker in ("/root/crypto-intel/", "~/crypto-intel/"):
            if relative.startswith(marker):
                relative = relative[len(marker) :]
        candidate = crypto_root / relative
        if candidate.is_file():
            result.add(candidate.resolve())
            continue
        matches = [path for path in crypto_root.rglob(Path(relative).name) if path.is_file()]
        if len(matches) == 1:
            result.add(matches[0].resolve())
    return result


def add_extra_transcripts(
    crypto_root: Path,
    packet_root: Path,
    packets: list[dict[str, Any]],
    referenced: set[Path],
) -> int:
    count = 0
    for path in sorted(item for item in (crypto_root / "transcripts").rglob("*") if item.is_file()):
        if path.resolve() in referenced:
            continue
        content, method = extract_transcript_text(path)
        digest = file_source_id(path)
        captured = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).replace(
            microsecond=0
        ).isoformat().replace("+00:00", "Z")
        body = "\n".join(
            [
                "This transcript existed in the current legacy Crypto archive but was not linked to a canonical event.",
                "",
                f"Archive reference: {legacy_archive_ref(crypto_root, path)}",
                f"Original SHA-256: {digest}",
                f"Text extraction: {method}",
                "",
                content,
            ]
        )
        append_artifact_packet(
            packet_root,
            packets,
            family="unlinked-transcripts",
            key=path.relative_to(crypto_root).as_posix(),
            title=useful_title(path.stem.replace("_", " ").replace("-", " "), path.name),
            body=body,
            captured=captured,
            tags=("transcript", "unlinked-legacy-source"),
            source_type_value="document",
            archive_ref=legacy_archive_ref(crypto_root, path),
            original_sha256=digest,
            original_filename=path.name,
            extraction_method=method,
        )
        packets[-1]["transcript_count"] = 1
        packets[-1]["transcript_text_extracted"] = 1
        count += 1
    return count


def redact_sensitive_text(value: str) -> tuple[str, int]:
    text = value
    replacements = 0
    for pattern in SECRET_PATTERNS:
        text, count = pattern.subn("[REDACTED SENSITIVE VALUE]", text)
        replacements += count
    return normalize_legacy_references(text), replacements


def message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, list):
        return ""
    parts = []
    for item in content:
        if not isinstance(item, dict):
            continue
        if item.get("type") not in {None, "text", "input_text", "output_text"}:
            continue
        text = item.get("text")
        if isinstance(text, str) and text.strip():
            parts.append(text.strip())
    return "\n\n".join(parts)


def sanitized_conversations(crypto_root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    sessions: list[dict[str, Any]] = []
    messages: list[dict[str, Any]] = []
    redactions = 0
    archive = crypto_root / "conversation-archive"
    for path in sorted(archive.glob("*.jsonl")):
        session_id = path.stem
        first_timestamp = None
        kept = 0
        for line_number, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            timestamp = record.get("timestamp")
            first_timestamp = first_timestamp or timestamp
            message = record.get("message")
            if record.get("type") != "message" or not isinstance(message, dict):
                continue
            role = str(message.get("role") or "")
            if role not in {"user", "assistant"}:
                continue
            content = message_text(message)
            if not content:
                continue
            content, count = redact_sensitive_text(content)
            redactions += count
            messages.append(
                {
                    "id": str(record.get("id") or f"{session_id}:{line_number}"),
                    "session_id": session_id,
                    "sequence": line_number,
                    "timestamp": str(message.get("timestamp") or timestamp or ""),
                    "role": role,
                    "content": content,
                }
            )
            kept += 1
        sessions.append(
            {
                "id": session_id,
                "archive_ref": legacy_archive_ref(crypto_root, path),
                "original_sha256": file_source_id(path),
                "first_timestamp": str(first_timestamp or ""),
                "kept_messages": kept,
                "original_bytes": path.stat().st_size,
            }
        )
    return sessions, messages, redactions


def create_dashboard_database(
    path: Path,
    events: list[dict[str, Any]],
    sources: dict[str, list[dict[str, Any]]],
    tables: dict[str, list[dict[str, Any]]],
    conversations: tuple[list[dict[str, Any]], list[dict[str, Any]], int],
    media_assets: list[dict[str, Any]],
) -> dict[str, int]:
    if path.exists():
        raise FileExistsError(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys=ON")
    connection.executescript(
        """
        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE sources (
          source_id TEXT PRIMARY KEY, identity_basis TEXT NOT NULL, source_url TEXT,
          source_label TEXT, source_type TEXT NOT NULL, source_channel TEXT,
          captured_at TEXT NOT NULL, title TEXT NOT NULL
        );
        CREATE TABLE events (
          id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(source_id),
          timestamp TEXT, posted_date TEXT, ingested_at TEXT, source_type TEXT,
          source_channel TEXT, source_url TEXT, raw_text TEXT, summary TEXT,
          detailed_content TEXT, detailed_notes TEXT, mark_notes TEXT,
          primary_category TEXT, significance INTEGER, business_signal TEXT,
          underlying_principle TEXT, video_metadata_json TEXT
        );
        CREATE TABLE event_facets (
          event_id TEXT NOT NULL REFERENCES events(id), facet_type TEXT NOT NULL,
          position INTEGER NOT NULL, value_json TEXT NOT NULL,
          PRIMARY KEY(event_id, facet_type, position)
        );
        CREATE TABLE themes (
          id TEXT PRIMARY KEY, title TEXT, through_line TEXT, generated_at TEXT
        );
        CREATE TABLE theme_events (
          theme_id TEXT NOT NULL REFERENCES themes(id), event_id TEXT NOT NULL,
          position INTEGER NOT NULL, PRIMARY KEY(theme_id, event_id)
        );
        CREATE TABLE content_drafts (
          id TEXT PRIMARY KEY, template_type TEXT, date_from TEXT, date_to TEXT,
          focus TEXT, raw_output TEXT, edited_output TEXT, created_at TEXT, updated_at TEXT
        );
        CREATE TABLE quiz_sessions (
          id TEXT PRIMARY KEY, created_at TEXT, completed_at TEXT,
          score_correct INTEGER, score_total INTEGER
        );
        CREATE TABLE quiz_questions (
          id TEXT PRIMARY KEY, session_id TEXT REFERENCES quiz_sessions(id),
          question_number INTEGER, question_text TEXT, question_type TEXT,
          category TEXT, answer_guidance TEXT
        );
        CREATE TABLE quiz_answers (
          id TEXT PRIMARY KEY, session_id TEXT REFERENCES quiz_sessions(id),
          question_id TEXT REFERENCES quiz_questions(id), answer_text TEXT,
          is_correct INTEGER, feedback TEXT, context_note TEXT, created_at TEXT
        );
        CREATE TABLE quiz_event_links (
          owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, event_id TEXT NOT NULL,
          position INTEGER NOT NULL, PRIMARY KEY(owner_type, owner_id, event_id)
        );
        CREATE TABLE pin_summaries (
          event_id TEXT NOT NULL, pin_key TEXT NOT NULL, mode TEXT, summary TEXT,
          model TEXT, created_at TEXT, PRIMARY KEY(event_id, pin_key)
        );
        CREATE TABLE generation_meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE conversation_sessions (
          id TEXT PRIMARY KEY, archive_ref TEXT NOT NULL, original_sha256 TEXT NOT NULL,
          first_timestamp TEXT, kept_messages INTEGER NOT NULL, original_bytes INTEGER NOT NULL
        );
        CREATE TABLE conversation_messages (
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES conversation_sessions(id),
          sequence INTEGER NOT NULL, timestamp TEXT, role TEXT NOT NULL, content TEXT NOT NULL
        );
        CREATE TABLE media_assets (
          archive_ref TEXT PRIMARY KEY, relative_path TEXT NOT NULL, kind TEXT NOT NULL,
          bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, semantic_memory INTEGER NOT NULL,
          referenced_by_event INTEGER NOT NULL
        );
        CREATE INDEX idx_events_source ON events(source_id);
        CREATE INDEX idx_events_timestamp ON events(timestamp);
        CREATE INDEX idx_events_category ON events(primary_category);
        CREATE INDEX idx_facets_value ON event_facets(facet_type, value_json);
        CREATE INDEX idx_messages_session ON conversation_messages(session_id, sequence);
        """
    )
    connection.executemany(
        "INSERT INTO metadata(key,value) VALUES(?,?)",
        [
            ("schema", "mark.crypto.dashboard-handoff/v1"),
            ("generated_at", utc_now()),
            ("source_of_truth", "transaction-consistent legacy intel.db + preserved export"),
        ],
    )
    for source_id_value, rows in sorted(sources.items()):
        _, url, label, basis = source_identity(rows[0])
        title = useful_title(rows[0].get("summary"), f"Legacy Crypto source {source_id_value[-12:]}")
        connection.execute(
            "INSERT INTO sources VALUES(?,?,?,?,?,?,?,?)",
            (
                source_id_value,
                basis,
                url,
                label,
                source_type(rows),
                str(rows[0].get("source_channel") or "") or None,
                captured_at(rows),
                title,
            ),
        )
    facet_columns = {
        "secondary_category": "secondary_categories",
        "entity": "entities",
        "tag": "tags",
        "connection": "connections",
        "discussed_date": "discussed_dates",
        "key_insight": "key_insights",
    }
    for row in events:
        sid = source_identity(row)[0]
        connection.execute(
            "INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                row.get("id"), sid, row.get("timestamp"), row.get("posted_date"),
                row.get("ingested_at"), row.get("source_type"), row.get("source_channel"),
                row.get("source_url"), row.get("raw_text"), row.get("summary"),
                row.get("detailed_content"), row.get("detailed_notes"), row.get("my_notes"),
                row.get("primary_category"), row.get("significance"), row.get("business_signal"),
                row.get("underlying_principle"), row.get("video_metadata"),
            ),
        )
        for facet_type, column in facet_columns.items():
            for position, value in enumerate(parse_list(row.get(column))):
                connection.execute(
                    "INSERT INTO event_facets VALUES(?,?,?,?)",
                    (row.get("id"), facet_type, position, json.dumps(value, ensure_ascii=False)),
                )
    for row in tables["themes"]:
        connection.execute(
            "INSERT INTO themes VALUES(?,?,?,?)",
            (row.get("id"), row.get("title"), row.get("through_line"), row.get("generated_at")),
        )
        for position, event_id_value in enumerate(parse_list(row.get("event_ids"))):
            connection.execute(
                "INSERT OR IGNORE INTO theme_events VALUES(?,?,?)",
                (row.get("id"), event_id_value, position),
            )
    for table in ("content_drafts", "quiz_sessions", "quiz_questions", "quiz_answers", "pin_summaries", "generation_meta"):
        rows = tables[table]
        if not rows:
            continue
        columns = [item[1] for item in connection.execute(f'PRAGMA table_info("{table}")')]
        placeholders = ",".join("?" for _ in columns)
        quoted = ",".join(f'"{column}"' for column in columns)
        for row in rows:
            connection.execute(
                f'INSERT INTO "{table}" ({quoted}) VALUES ({placeholders})',
                [row.get(column) for column in columns],
            )
    for owner_type, rows in (("question", tables["quiz_questions"]), ("answer", tables["quiz_answers"])):
        for row in rows:
            for position, event_id_value in enumerate(parse_list(row.get("related_event_ids"))):
                connection.execute(
                    "INSERT OR IGNORE INTO quiz_event_links VALUES(?,?,?,?)",
                    (owner_type, row.get("id"), event_id_value, position),
                )
    sessions, messages, _ = conversations
    connection.executemany(
        "INSERT INTO conversation_sessions VALUES(?,?,?,?,?,?)",
        [
            (
                row["id"], row["archive_ref"], row["original_sha256"], row["first_timestamp"],
                row["kept_messages"], row["original_bytes"],
            )
            for row in sessions
        ],
    )
    connection.executemany(
        "INSERT INTO conversation_messages VALUES(?,?,?,?,?,?)",
        [
            (row["id"], row["session_id"], row["sequence"], row["timestamp"], row["role"], row["content"])
            for row in messages
        ],
    )
    connection.executemany(
        "INSERT INTO media_assets VALUES(?,?,?,?,?,?,?)",
        [
            (
                row["archive_ref"], row["relative_path"], row["kind"], row["bytes"],
                row["sha256"], int(row["semantic_memory"]), int(row["referenced_by_event"]),
            )
            for row in media_assets
        ],
    )
    connection.commit()
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    counts = {
        table: int(connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
        for table in (
            "sources", "events", "event_facets", "themes", "theme_events", "content_drafts",
            "quiz_sessions", "quiz_questions", "quiz_answers", "quiz_event_links",
            "pin_summaries", "generation_meta", "conversation_sessions",
            "conversation_messages", "media_assets",
        )
    }
    connection.close()
    if integrity != "ok":
        raise RuntimeError(f"dashboard handoff database integrity failed: {integrity}")
    return counts


def build_media_assets(crypto_root: Path, referenced: set[Path]) -> list[dict[str, Any]]:
    assets = []
    roots = [crypto_root / "transcripts", crypto_root / "archive"]
    for root in roots:
        for path in sorted(item for item in root.rglob("*") if item.is_file()):
            suffix = path.suffix.lower().lstrip(".") or "file"
            relative = path.relative_to(crypto_root).as_posix()
            assets.append(
                {
                    "archive_ref": legacy_archive_ref(crypto_root, path),
                    "relative_path": relative,
                    "kind": suffix,
                    "bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                    "semantic_memory": suffix in {"txt", "md", "json", "jsonl", "docx", "pdf"},
                    "referenced_by_event": path.resolve() in referenced,
                }
            )
    return assets


def build(export_root: Path, packet_root: Path, handoff_root: Path) -> dict[str, Any]:
    if packet_root.exists() and any(packet_root.iterdir()):
        raise FileExistsError(f"packet directory is not empty: {packet_root}")
    if handoff_root.exists() and any(handoff_root.iterdir()):
        raise FileExistsError(f"handoff directory is not empty: {handoff_root}")
    build_core_packets(export_root, output_dir=packet_root)
    manifest_path = packet_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    database = export_root / "database-snapshots/root/crypto-intel-dashboard/data/intel.db"
    crypto_root = export_root / "root/crypto-intel"
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        connection.close()
        raise RuntimeError(f"canonical database integrity check failed: {integrity}")
    tables = {
        name: table_rows(connection, name)
        for name in (
            "events", "themes", "generation_meta", "quiz_sessions", "quiz_questions",
            "quiz_answers", "content_drafts", "pin_summaries",
        )
    }
    connection.close()
    events = sorted(tables["events"], key=lambda row: str(row.get("id") or ""))
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in events:
        grouped[source_identity(row)[0]].append(row)
    extra_packets: list[dict[str, Any]] = []
    for row in tables["themes"]:
        append_artifact_packet(
            packet_root, extra_packets, family="themes", key=str(row.get("id")),
            title=str(row.get("title") or "Legacy Crypto theme"), body=theme_body(row),
            captured=stable_timestamp((row.get("generated_at"),)), tags=("theme",),
        )
    for row in tables["content_drafts"]:
        append_artifact_packet(
            packet_root, extra_packets, family="content-drafts", key=str(row.get("id")),
            title=f"Legacy {str(row.get('template_type') or 'content').replace('_', ' ')} draft",
            body=draft_body(row), captured=stable_timestamp((row.get("updated_at"), row.get("created_at"))),
            tags=("content-draft", str(row.get("template_type") or "unknown")),
        )
    answers_by_question: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for answer in tables["quiz_answers"]:
        answers_by_question[str(answer.get("question_id") or "")].append(answer)
    questions_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for question in tables["quiz_questions"]:
        questions_by_session[str(question.get("session_id") or "")].append(question)
    for session in tables["quiz_sessions"]:
        sid = str(session.get("id") or "")
        append_artifact_packet(
            packet_root, extra_packets, family="quiz-sessions", key=sid,
            title=f"Legacy Crypto learning session {sid}",
            body=quiz_body(session, questions_by_session.get(sid, []), answers_by_question),
            captured=stable_timestamp((session.get("completed_at"), session.get("created_at"))),
            tags=("quiz", "learning-history"),
        )
    pins_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in tables["pin_summaries"]:
        pins_by_event[str(row.get("event_id") or "")].append(row)
    for event_id_value, rows in sorted(pins_by_event.items()):
        append_artifact_packet(
            packet_root, extra_packets, family="pin-summaries", key=event_id_value,
            title=f"Pinned summary for legacy Crypto event {event_id_value}",
            body=pin_body(rows), captured=stable_timestamp(row.get("created_at") for row in rows),
            tags=("pinned-summary",),
        )
    referenced = referenced_transcripts(crypto_root, events)
    extra_transcripts = add_extra_transcripts(crypto_root, packet_root, extra_packets, referenced)
    source_ids = {record["source_id"] for record in manifest["source_packets"]}
    for record in extra_packets:
        if record["source_id"] in source_ids:
            raise ValueError("duplicate source identity across core and complete packet layers")
        source_ids.add(record["source_id"])
    manifest["source_packets"].extend(extra_packets)
    base_source_count = int(manifest["counts"]["source_create"])
    manifest["counts"].update(
        {
            "source_total": base_source_count + len(extra_packets),
            "source_create": base_source_count + len(extra_packets),
            "source_skip": 0,
            "packet_create": base_source_count + len(extra_packets) + int(manifest["counts"]["event_create"]),
            "transcript_references_resolved": int(manifest["counts"]["transcript_references_resolved"]) + extra_transcripts,
            "transcript_text_extracted": int(manifest["counts"]["transcript_text_extracted"]) + extra_transcripts,
            "artifact_source_packets": len(extra_packets),
            "themes": len(tables["themes"]),
            "content_drafts": len(tables["content_drafts"]),
            "quiz_sessions": len(tables["quiz_sessions"]),
            "quiz_questions": len(tables["quiz_questions"]),
            "quiz_answers": len(tables["quiz_answers"]),
            "pin_summaries": len(tables["pin_summaries"]),
            "extra_transcript_files": extra_transcripts,
        }
    )
    manifest["migration_scope"] = "all meaningful current legacy Crypto content"
    manifest["semantic_exclusions"] = [
        "raw agent tool calls and tool results",
        "credentials and cookies",
        "duplicate event backup directories",
        "rotation logs and scripts",
        "binary audio and video",
    ]
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    reconciliation = {
        "schema": "mark.crypto.complete-reconciliation/v1",
        "generated_at": manifest["generated_at"],
        "database_integrity": integrity,
        "openviking_write_performed": False,
        "counts": manifest["counts"],
        "semantic_exclusions": manifest["semantic_exclusions"],
    }
    (packet_root / "reconciliation-redacted.json").write_text(
        json.dumps(reconciliation, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    conversations = sanitized_conversations(crypto_root)
    media_assets = build_media_assets(crypto_root, referenced)
    handoff_root.mkdir(parents=True, exist_ok=True)
    database_path = handoff_root / "crypto-dashboard-v2.db"
    dashboard_counts = create_dashboard_database(
        database_path, events, grouped, tables, conversations, media_assets
    )
    media_manifest = {
        "schema": "mark.crypto.media-manifest/v1",
        "generated_at": utc_now(),
        "files": media_assets,
    }
    (handoff_root / "media-manifest.json").write_text(
        json.dumps(media_manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    handoff = {
        "schema": "mark.crypto.dashboard-handoff-manifest/v1",
        "generated_at": utc_now(),
        "database": {
            "path": database_path.name,
            "bytes": database_path.stat().st_size,
            "sha256": sha256_file(database_path),
            "integrity": "ok",
            "counts": dashboard_counts,
        },
        "media": {
            "manifest": "media-manifest.json",
            "files": len(media_assets),
            "bytes": sum(int(item["bytes"]) for item in media_assets),
        },
        "conversation_sanitization": {
            "sessions": len(conversations[0]),
            "messages": len(conversations[1]),
            "sensitive_values_redacted": conversations[2],
            "tool_calls_and_results_excluded": True,
        },
        "raw_source_of_truth": "owner-only preserved export; never copied into the dashboard bundle",
    }
    (handoff_root / "handoff-manifest.json").write_text(
        json.dumps(handoff, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {"memory": reconciliation, "dashboard": handoff}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("export_root", type=Path)
    parser.add_argument("--packet-dir", type=Path, required=True)
    parser.add_argument("--handoff-dir", type=Path, required=True)
    args = parser.parse_args()
    result = build(args.export_root.resolve(), args.packet_dir.resolve(), args.handoff_dir.resolve())
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
