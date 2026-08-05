from __future__ import annotations

import json
import re
import sqlite3
import tempfile
import unittest
from pathlib import Path

from build_legacy_crypto_packets import build
from build_complete_crypto_handoff import build as build_complete_handoff
from apply_crypto_packets import execute, load_manifest
from verify_legacy_crypto_packets import verify
from verify_crypto_dashboard_handoff import verify as verify_dashboard_handoff


EVENT_COLUMNS = [
    "id",
    "timestamp",
    "source_type",
    "source_channel",
    "source_url",
    "raw_text",
    "summary",
    "primary_category",
    "secondary_categories",
    "entities",
    "significance",
    "business_signal",
    "connections",
    "underlying_principle",
    "my_notes",
    "detailed_content",
    "tags",
    "video_metadata",
    "transcript_path",
    "key_insights",
    "detailed_notes",
    "ingested_at",
    "discussed_dates",
    "posted_date",
]


class LegacyPacketBuilderTests(unittest.TestCase):
    def make_export(self, root: Path) -> Path:
        export = root / "export"
        crypto = export / "root" / "crypto-intel"
        transcript = crypto / "transcripts" / "fixture.txt"
        transcript.parent.mkdir(parents=True)
        transcript.write_text("Preserved synthetic transcript.", encoding="utf-8")
        database = (
            export
            / "database-snapshots"
            / "root"
            / "crypto-intel-dashboard"
            / "data"
            / "intel.db"
        )
        database.parent.mkdir(parents=True)
        connection = sqlite3.connect(database)
        declarations = [f'"{name}" TEXT' for name in EVENT_COLUMNS]
        connection.execute(f"CREATE TABLE events ({', '.join(declarations)})")
        base = {name: "" for name in EVENT_COLUMNS}
        base.update(
            {
                "timestamp": "2026-07-31T10:00:00Z",
                "source_type": "video_youtube",
                "source_channel": "Synthetic channel",
                "raw_text": "Synthetic source text at /root/crypto-intel/archive/file.mp3.",
                "primary_category": "fixture",
                "secondary_categories": "[]",
                "entities": "[]",
                "connections": "[]",
                "tags": '["fixture"]',
                "video_metadata": "{}",
                "key_insights": "[]",
                "ingested_at": "2026-07-31T10:05:00Z",
                "discussed_dates": "[]",
                "posted_date": "2026-07-31",
            }
        )
        first = dict(base)
        first.update(
            {
                "id": "fixture-event-1",
                "source_url": "HTTPS://EXAMPLE.COM:443/watch/?v=1&utm_source=test#fragment",
                "summary": "First synthetic event",
                "transcript_path": "/root/crypto-intel/transcripts/fixture.txt",
            }
        )
        second = dict(base)
        second.update(
            {
                "id": "fixture-event-2",
                "source_url": "https://example.com/watch?v=1",
                "summary": "Second synthetic event",
                "transcript_path": "",
            }
        )
        placeholders = ",".join("?" for _ in EVENT_COLUMNS)
        columns = ",".join(f'"{name}"' for name in EVENT_COLUMNS)
        for row in (first, second):
            connection.execute(
                f"INSERT INTO events ({columns}) VALUES ({placeholders})",
                [row[name] for name in EVENT_COLUMNS],
            )
        connection.commit()
        connection.close()
        return export

    def test_builds_one_source_and_two_events_without_v2_write(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            export = self.make_export(root)
            output = root / "packets"
            report = build(export, output_dir=output)
            self.assertFalse(report["openviking_write_performed"])
            self.assertEqual(report["counts"]["source_create"], 1)
            self.assertEqual(report["counts"]["event_create"], 2)
            self.assertEqual(report["counts"]["packet_create"], 3)
            self.assertEqual(report["counts"]["transcript_references_resolved"], 1)
            self.assertEqual(report["counts"]["transcript_text_extracted"], 1)
            source_path = next((output / "sources").glob("*.md"))
            source = source_path.read_text(encoding="utf-8")
            self.assertFalse(source.startswith("---"))
            self.assertIn("## Provenance", source)
            self.assertIn('source_url: "https://example.com/watch?v=1"', source)
            self.assertIn("Preserved synthetic transcript.", source)
            self.assertIsNone(
                re.search(r"(?<!legacy-export:/)/root/crypto-intel/|~/crypto-intel/", source)
            )
            self.assertIn("legacy-export://root/crypto-intel/archive/file.mp3", source)
            self.assertEqual(len(list((output / "events").glob("*.md"))), 2)
            verification = verify(export, output)
            self.assertTrue(verification["verified"])
            self.assertEqual(verification["total_packets"], 3)

    def test_existing_ids_skip_all_packets(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            export = self.make_export(root)
            first_output = root / "first"
            build(export, output_dir=first_output)
            manifest = json.loads((first_output / "manifest.json").read_text(encoding="utf-8"))
            existing = root / "existing.json"
            existing.write_text(
                json.dumps(
                    {
                        "source_ids": [item["source_id"] for item in manifest["source_packets"]],
                        "event_ids": [item["event_id"] for item in manifest["event_packets"]],
                    }
                ),
                encoding="utf-8",
            )
            report = build(export, existing, root / "second")
            self.assertEqual(report["counts"]["packet_create"], 0)
            self.assertEqual(report["counts"]["source_skip"], 1)
            self.assertEqual(report["counts"]["event_skip"], 2)

    def test_native_executor_creates_once_then_skips_replay(self) -> None:
        class FakeProvider:
            def __init__(self) -> None:
                self.resources: dict[str, str] = {}
                self.transient_stat_errors = 1
                self.stat_paths: list[str] = []

            def handle_tool_call(self, name: str, args: dict) -> str:
                if name == "viking_read":
                    uri = args["uri"]
                    if uri not in self.resources:
                        return json.dumps({"error": "NOT_FOUND: fixture"})
                    return json.dumps({"content": self.resources[uri]})
                if name == "viking_browse":
                    if args["action"] != "stat":
                        raise AssertionError(args)
                    path = args["path"]
                    self.stat_paths.append(path)
                    if self.transient_stat_errors:
                        self.transient_stat_errors -= 1
                        return json.dumps({"error": "temporary provider fixture error"})
                    children = [uri for uri in self.resources if uri.startswith(path + "/")]
                    if not children:
                        return json.dumps({"error": "NOT_FOUND: fixture"})
                    return json.dumps(
                        {"isDir": True, "isLocked": False, "count": len(children)}
                    )
                if name == "viking_add_resource":
                    target = args["to"].rstrip("/")
                    filename = target.rsplit("/", 1)[-1]
                    raw_uri = target + "/" + filename.removesuffix(".md") + "_generated.md"
                    self.resources[raw_uri] = Path(args["url"]).read_text(encoding="utf-8")
                    return json.dumps({"status": "added", "root_uri": target})
                raise AssertionError(name)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            export = self.make_export(root)
            output = root / "packets"
            build(export, output_dir=output)
            manifest = load_manifest(output)
            provider = FakeProvider()
            first = execute(output, manifest, provider, root / "first.jsonl", poll_interval=0)
            self.assertEqual(first["created"], 3)
            self.assertEqual(first["skipped"], 0)
            self.assertEqual(len(provider.resources), 3)
            second = execute(output, manifest, provider, root / "second.jsonl", poll_interval=0)
            self.assertEqual(second["created"], 0)
            self.assertEqual(second["skipped"], 3)
            self.assertEqual(len(provider.resources), 3)
            expected_scopes = {
                item["target_uri"]
                for item in manifest["source_packets"] + manifest["event_packets"]
            }
            self.assertEqual(set(provider.stat_paths), expected_scopes)

    def test_complete_handoff_preserves_memory_and_dashboard_layers(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            export = self.make_export(root)
            packets = root / "complete-packets"
            handoff = root / "dashboard-handoff"
            report = build_complete_handoff(export, packets, handoff)
            self.assertFalse(report["memory"]["openviking_write_performed"])
            self.assertEqual(report["memory"]["counts"]["packet_create"], 3)
            self.assertEqual(report["dashboard"]["database"]["counts"]["sources"], 1)
            self.assertEqual(report["dashboard"]["database"]["counts"]["events"], 2)
            self.assertEqual(report["dashboard"]["database"]["counts"]["media_assets"], 1)
            database = handoff / "crypto-dashboard-v2.db"
            connection = sqlite3.connect(database)
            self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            connection.close()
            verification = verify(export, packets)
            self.assertEqual(verification["total_packets"], 3)
            dashboard_verification = verify_dashboard_handoff(
                handoff, export / "root" / "crypto-intel"
            )
            self.assertTrue(dashboard_verification["verified"])
            self.assertEqual(dashboard_verification["media_files_checksum_verified"], 1)


if __name__ == "__main__":
    unittest.main()
