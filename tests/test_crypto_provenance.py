from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from crypto_intelligence.provenance import (
    EventEnvelope,
    IngestReceipt,
    SourceEnvelope,
    event_id,
    file_source_id,
    label_source_id,
    normalize_url,
    needs_create,
    text_source_id,
    url_source_id,
)


class UrlIdentityTests(unittest.TestCase):
    def test_tracking_and_fragment_do_not_change_identity(self) -> None:
        clean = "https://example.com/report?a=1&b=2"
        noisy = "HTTPS://EXAMPLE.COM:443/report/?b=2&utm_source=x&a=1#section"
        self.assertEqual(normalize_url(noisy), clean)
        self.assertEqual(url_source_id(noisy), url_source_id(clean))

    def test_material_query_parameters_are_preserved(self) -> None:
        first = url_source_id("https://example.com/search?q=bitcoin")
        second = url_source_id("https://example.com/search?q=ethereum")
        self.assertNotEqual(first, second)

    def test_non_http_url_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            normalize_url("file:///tmp/source.txt")


class ContentIdentityTests(unittest.TestCase):
    def test_file_hash_is_byte_stable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "one.bin"
            second = Path(directory) / "two.bin"
            first.write_bytes(b"same bytes")
            second.write_bytes(b"same bytes")
            self.assertEqual(file_source_id(first), file_source_id(second))

    def test_text_hash_ignores_trailing_whitespace(self) -> None:
        self.assertEqual(text_source_id("alpha  \nbeta\n"), text_source_id("alpha\nbeta"))

    def test_legacy_label_identity_is_case_and_space_stable(self) -> None:
        self.assertEqual(label_source_id(" Panel  Talk "), label_source_id("panel talk"))

    def test_derived_event_identity_is_deterministic(self) -> None:
        source = text_source_id("source")
        self.assertEqual(
            event_id(source, "a   material event", "2026-07-31"),
            event_id(source, "a material event", "2026-07-31"),
        )

    def test_existing_identity_is_skipped_before_storage(self) -> None:
        source = text_source_id("source")
        self.assertFalse(needs_create(source, [source]))
        self.assertTrue(needs_create(text_source_id("new source"), [source]))


class EnvelopeTests(unittest.TestCase):
    def test_source_render_contains_provenance(self) -> None:
        url = normalize_url("https://example.com/article?utm_campaign=x")
        envelope = SourceEnvelope(
            source_id=url_source_id(url),
            source_type="article",
            source_url=url,
            captured_at="2026-07-31T17:00:00Z",
            extraction_method="hermes.web_extract",
            extraction_status="complete",
            title="Fixture article",
            body="Fixture body.",
            tags=("fixture", "crypto"),
        )
        rendered = envelope.render_markdown()
        self.assertFalse(rendered.startswith("---"))
        self.assertIn("## Provenance", rendered)
        self.assertIn('schema: "mark.crypto.source/v1"', rendered)
        self.assertIn("source_id:", rendered)
        self.assertIn("Fixture body.", rendered)

    def test_failed_source_can_have_empty_body(self) -> None:
        source = text_source_id("failed fixture")
        SourceEnvelope(
            source_id=source,
            source_type="note",
            captured_at="2026-07-31T17:00:00Z",
            extraction_method="fixture",
            extraction_status="failed",
            title="Failed fixture",
            body="",
        ).validate()

    def test_legacy_source_label_is_visible(self) -> None:
        label = "Legacy channel label"
        rendered = SourceEnvelope(
            source_id=label_source_id(label),
            source_type="note",
            source_label=label,
            captured_at="2026-07-31T17:00:00Z",
            extraction_method="legacy.fixture",
            extraction_status="complete",
            title="Legacy fixture",
            body="Preserved body.",
        ).render_markdown()
        self.assertIn('source_label: "Legacy channel label"', rendered)

    def test_multiple_events_can_link_to_one_source(self) -> None:
        source = text_source_id("one source")
        first = EventEnvelope(
            event_id="legacy-001",
            legacy_event_id="legacy-001",
            source_id=source,
            event_date="2026-07-30",
            title="First insight",
            body="First body",
        )
        second = EventEnvelope(
            event_id="legacy-002",
            legacy_event_id="legacy-002",
            source_id=source,
            event_date="2026-07-30",
            title="Second insight",
            body="Second body",
        )
        first.validate()
        second.validate()
        self.assertNotEqual(first.event_id, second.event_id)
        self.assertEqual(first.source_id, second.source_id)

    def test_failed_receipt_requires_error_class(self) -> None:
        with self.assertRaises(ValueError):
            IngestReceipt(
                status="failed",
                source_id=text_source_id("source"),
                attempted_at="2026-07-31T17:00:00Z",
            ).validate()

    def test_failed_receipt_has_no_false_success_uri(self) -> None:
        receipt = IngestReceipt(
            status="failed",
            source_id=text_source_id("failed source"),
            attempted_at="2026-07-31T17:00:00Z",
            error_class="fixture-extraction-failed",
        ).as_dict()
        self.assertEqual(receipt["status"], "failed")
        self.assertEqual(receipt["openviking_uris"], [])


if __name__ == "__main__":
    unittest.main()
