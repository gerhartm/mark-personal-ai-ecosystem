"""Deterministic source identity and provenance envelopes.

This module is intentionally storage-agnostic. Hermes performs acquisition and
OpenViking stores/retrieves the rendered resources; these helpers only provide
the Crypto-specific identity and receipt contract missing from those systems.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


TRACKING_PARAMETERS = {
    "dclid",
    "fbclid",
    "gclid",
    "igsh",
    "igshid",
    "mc_cid",
    "mc_eid",
    "msclkid",
    "ref_src",
    "si",
}
TRACKING_PREFIXES = ("utm_",)
SOURCE_TYPES = {
    "article",
    "youtube",
    "x",
    "instagram",
    "pdf",
    "document",
    "audio",
    "video",
    "note",
}
EXTRACTION_STATUSES = {"complete", "partial", "failed"}
RECEIPT_STATUSES = {"created", "skipped", "updated", "failed"}
ID_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")


def _sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def normalize_url(raw_url: str) -> str:
    """Return a stable URL form suitable for source identity."""

    value = raw_url.strip()
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise ValueError("source URL must be absolute HTTP(S)")

    scheme = parsed.scheme.lower()
    hostname = parsed.hostname.lower().rstrip(".")
    port = parsed.port
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        hostname = f"{hostname}:{port}"

    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/") or "/"

    query_pairs = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered in TRACKING_PARAMETERS or lowered.startswith(TRACKING_PREFIXES):
            continue
        query_pairs.append((key, value))
    query_pairs.sort(key=lambda pair: (pair[0], pair[1]))

    return urlunsplit((scheme, hostname, path, urlencode(query_pairs, doseq=True), ""))


def url_source_id(raw_url: str) -> str:
    return _sha256(normalize_url(raw_url).encode("utf-8"))


def file_source_id(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def text_source_id(text: str) -> str:
    normalized = "\n".join(line.rstrip() for line in text.strip().splitlines())
    if not normalized:
        raise ValueError("text source cannot be empty")
    return _sha256(normalized.encode("utf-8"))


def label_source_id(label: str) -> str:
    """Identify a legacy source label when no absolute source URL exists."""

    normalized = " ".join(label.casefold().split())
    if not normalized:
        raise ValueError("source label cannot be empty")
    return _sha256(f"legacy-label:{normalized}".encode("utf-8"))


def event_id(source_id: str, content: str, event_date: str) -> str:
    _validate_sha256_id("source_id", source_id)
    normalized_content = " ".join(content.split())
    if not normalized_content:
        raise ValueError("event content cannot be empty")
    normalized_date = event_date.strip()
    if not normalized_date:
        raise ValueError("event date cannot be empty")
    return _sha256(f"{source_id}\n{normalized_date}\n{normalized_content}".encode("utf-8"))


def _validate_sha256_id(label: str, value: str) -> None:
    if not ID_PATTERN.fullmatch(value):
        raise ValueError(f"{label} must use sha256:<64 lowercase hex>")


def _validate_timestamp(label: str, value: str | None) -> None:
    if value is None:
        return
    try:
        if "T" in value:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        else:
            date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{label} must be ISO-8601") from error


def _provenance_block(values: dict[str, object]) -> str:
    """Render metadata inside the document body so OpenViking preserves it."""

    lines = ["```yaml"]
    for key, value in values.items():
        if value is None or value == "" or value == []:
            continue
        lines.append(f"{key}: {json.dumps(value, ensure_ascii=False, sort_keys=True)}")
    lines.append("```")
    return "\n".join(lines)


@dataclass(frozen=True)
class SourceEnvelope:
    source_id: str
    source_type: str
    captured_at: str
    extraction_method: str
    extraction_status: Literal["complete", "partial", "failed"]
    title: str
    body: str
    source_url: str | None = None
    source_label: str | None = None
    source_channel: str | None = None
    posted_at: str | None = None
    original_sha256: str | None = None
    original_filename: str | None = None
    archive_ref: str | None = None
    language: str | None = None
    tags: tuple[str, ...] = field(default_factory=tuple)

    def validate(self) -> None:
        _validate_sha256_id("source_id", self.source_id)
        if self.source_type not in SOURCE_TYPES:
            raise ValueError(f"unsupported source_type: {self.source_type}")
        if self.extraction_status not in EXTRACTION_STATUSES:
            raise ValueError(f"unsupported extraction_status: {self.extraction_status}")
        _validate_timestamp("captured_at", self.captured_at)
        _validate_timestamp("posted_at", self.posted_at)
        if self.source_url and normalize_url(self.source_url) != self.source_url:
            raise ValueError("source_url must already be normalized")
        if self.original_sha256:
            _validate_sha256_id("original_sha256", self.original_sha256)
        if not self.title.strip():
            raise ValueError("title is required")
        if self.extraction_status == "complete" and not self.body.strip():
            raise ValueError("complete extraction requires body text")

    def render_markdown(self) -> str:
        self.validate()
        metadata = {
            "schema": "mark.crypto.source/v1",
            "source_id": self.source_id,
            "source_type": self.source_type,
            "source_url": self.source_url,
            "source_label": self.source_label,
            "source_channel": self.source_channel,
            "captured_at": self.captured_at,
            "posted_at": self.posted_at,
            "original_sha256": self.original_sha256,
            "original_filename": self.original_filename,
            "archive_ref": self.archive_ref,
            "extraction_method": self.extraction_method,
            "extraction_status": self.extraction_status,
            "language": self.language,
            "tags": list(self.tags),
        }
        return (
            f"# {self.title.strip()}\n\n"
            f"## Provenance\n\n{_provenance_block(metadata)}\n\n"
            f"## Content\n\n{self.body.strip()}\n"
        )


@dataclass(frozen=True)
class EventEnvelope:
    event_id: str
    source_id: str
    event_date: str
    title: str
    body: str
    legacy_event_id: str | None = None
    primary_category: str | None = None
    secondary_categories: tuple[str, ...] = field(default_factory=tuple)
    entities: tuple[str, ...] = field(default_factory=tuple)
    tags: tuple[str, ...] = field(default_factory=tuple)
    related_event_ids: tuple[str, ...] = field(default_factory=tuple)

    def validate(self) -> None:
        if self.legacy_event_id:
            if not self.legacy_event_id.strip():
                raise ValueError("legacy_event_id cannot be blank")
        else:
            _validate_sha256_id("event_id", self.event_id)
        _validate_sha256_id("source_id", self.source_id)
        _validate_timestamp("event_date", self.event_date)
        if not self.event_id.strip() or not self.title.strip() or not self.body.strip():
            raise ValueError("event_id, title, and body are required")

    def render_markdown(self) -> str:
        self.validate()
        metadata = {
            "schema": "mark.crypto.event/v1",
            "event_id": self.event_id,
            "legacy_event_id": self.legacy_event_id,
            "source_id": self.source_id,
            "event_date": self.event_date,
            "primary_category": self.primary_category,
            "secondary_categories": list(self.secondary_categories),
            "entities": list(self.entities),
            "tags": list(self.tags),
            "related_event_ids": list(self.related_event_ids),
        }
        return (
            f"# {self.title.strip()}\n\n"
            f"## Provenance\n\n{_provenance_block(metadata)}\n\n"
            f"## Event\n\n{self.body.strip()}\n"
        )


@dataclass(frozen=True)
class IngestReceipt:
    status: Literal["created", "skipped", "updated", "failed"]
    source_id: str
    attempted_at: str
    event_ids: tuple[str, ...] = field(default_factory=tuple)
    openviking_uris: tuple[str, ...] = field(default_factory=tuple)
    error_class: str | None = None

    def validate(self) -> None:
        if self.status not in RECEIPT_STATUSES:
            raise ValueError(f"unsupported receipt status: {self.status}")
        _validate_sha256_id("source_id", self.source_id)
        _validate_timestamp("attempted_at", self.attempted_at)
        if self.status == "failed" and not self.error_class:
            raise ValueError("failed receipt requires error_class")
        if self.status != "failed" and self.error_class:
            raise ValueError("error_class is only valid for failed receipts")

    def as_dict(self) -> dict[str, object]:
        self.validate()
        return {
            "schema": "mark.crypto.ingest-receipt/v1",
            "status": self.status,
            "source_id": self.source_id,
            "attempted_at": self.attempted_at,
            "event_ids": list(self.event_ids),
            "openviking_uris": list(self.openviking_uris),
            "error_class": self.error_class,
        }


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def unique_ids(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(value for value in values if value))


def needs_create(resource_id: str, existing_ids: Iterable[str]) -> bool:
    """Return whether a deterministic resource ID is absent from the observed set."""

    normalized = resource_id.strip()
    if not normalized:
        raise ValueError("resource_id cannot be blank")
    return normalized not in set(unique_ids(existing_ids))
