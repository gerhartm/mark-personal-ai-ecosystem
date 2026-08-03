#!/usr/bin/env python3
"""Inventory credential metadata without printing secret values.

Run this script on a trusted Linux host. It emits tab-separated records with
source locations, credential identifiers, value presence, and an ephemeral
duplicate-group ID. Raw values are never written to stdout.
"""

from __future__ import annotations

import json
import os
import re
import stat
import sys
from collections import defaultdict
from pathlib import Path


SCAN_ROOTS = (
    Path("/root/.openclaw"),
    Path("/root/.openclaw-content-intel"),
    Path("/root/.openclaw-content-intel-home"),
    Path("/root/.openclaw-sapphire-media"),
    Path("/root/.openclaw-sapphire-media-home"),
    Path("/root/.cloudflared"),
    Path("/root/.config"),
    Path("/root/crypto-intel/config"),
    Path("/root/crypto-intel-dashboard"),
    Path("/root/content-intel/config"),
    Path("/root/sapphire-media/config"),
    Path("/root/config-backups-2026-05-19"),
    Path("/etc/systemd/system"),
    Path("/etc/cloudflared"),
    Path("/var/lib/cloudflared"),
)

EXPLICIT_FILES = (
    Path("/root/.bash_history"),
    Path("/root/.bashrc"),
    Path("/root/.profile"),
    Path("/root/.claude/.credentials.json"),
    Path("/root/.codex/auth.json"),
    Path("/root/content-intel/cookies.txt"),
    Path("/root/content-intel/instagram-cookies.txt"),
)

SKIP_DIR_NAMES = {
    ".git",
    ".npm",
    ".cache",
    "__pycache__",
    "node_modules",
    "uploads",
    "media",
    "memory",
    "workspace",
    "transcripts",
    "content",
    "archive",
    "conversation-archive",
    "techniques",
    "skillpaths",
    "annotations",
    "events",
    "briefings",
    "quizzes",
    "delivery-queue",
    "tasks",
    "dist",
    "build",
    "logs",
}

MAX_FILE_SIZE = 2 * 1024 * 1024

ARTIFACT_NAME_RE = re.compile(
    r"(?:^|[._-])(?:"
    r"\.env|env|secret|credential|auth|token|cookie|"
    r"service[_-]?account|oauth|tunnel"
    r")(?:$|[._-])",
    re.IGNORECASE,
)

PLACEHOLDER_RE = re.compile(
    r"^(?:"
    r"|null|none|false|true|changeme|change[_-]?me|"
    r"your[_-].*|example.*|sample.*|xxx+|redacted|"
    r"<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\}"
    r")$",
    re.IGNORECASE,
)

ASSIGNMENT_RE = re.compile(
    r"""^\s*(?:export\s+|Environment\s*=\s*["']?)?
        ["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?
        \s*[:=]\s*(.*?)\s*["']?\s*,?\s*$""",
    re.VERBOSE,
)

FLAG_RE = re.compile(
    r"--([A-Za-z][A-Za-z0-9_-]*(?:key|token|secret|password|credential))"
    r"(?:=|\s+)([^\s\"']+)",
    re.IGNORECASE,
)


def is_secret_name(name: str, context: str = "") -> bool:
    canonical = re.sub(r"[^a-z0-9]", "", name.lower())
    if not canonical:
        return False
    if canonical in {
        "passwordauthentication",
        "privatekeypath",
        "privatekeyfile",
        "credentialfile",
        "secretfile",
    }:
        return False
    if canonical.endswith(("tokens", "tokencount", "tokenlimit", "tokenbudget")):
        return False
    if "apikey" in canonical:
        return True
    if canonical.endswith(("secret", "password", "passwd", "credential", "credentials")):
        return True
    if canonical.endswith("token"):
        return True
    if canonical in {"accesskey", "privatekey", "accounttag", "tunnelsecret"}:
        return True
    return canonical in {"key", "value"} and bool(
        re.search(r"(?:auth|credential|provider|profile|secret|token)", context, re.I)
    )


def normalize_value(raw: object) -> tuple[str, str | None]:
    if raw is None:
        return "empty", None
    if isinstance(raw, (dict, list)):
        return "container", None
    value = str(raw).strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1].strip()
    value = value.rstrip(",").strip()
    if not value:
        return "empty", None
    if PLACEHOLDER_RE.fullmatch(value):
        return "placeholder_or_reference", None
    if value.startswith(("/", "./", "../")) and len(value.split()) == 1:
        return "file_reference", None
    return "present", value


class Inventory:
    def __init__(self) -> None:
        self.records: set[tuple[str, str, str, str]] = set()
        self.value_groups: dict[str, str] = {}
        self.group_counter = 0

    def group_for(self, value: str | None) -> str:
        if value is None:
            return "-"
        if value not in self.value_groups:
            self.group_counter += 1
            self.value_groups[value] = f"S{self.group_counter:03d}"
        return self.value_groups[value]

    def add(self, source: str, name: str, status: str, value: str | None = None) -> None:
        group = self.group_for(value)
        self.records.add((source, name, status, group))

    def emit(self) -> None:
        print("SOURCE\tIDENTIFIER\tSTATUS\tDUPLICATE_GROUP")
        for record in sorted(self.records):
            print("\t".join(record))


def parse_json_object(
    inventory: Inventory, source: str, obj: object, path: tuple[str, ...] = ()
) -> None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            key_text = str(key)
            context = ".".join((*path, key_text))
            if is_secret_name(key_text, context):
                status, normalized = normalize_value(value)
                inventory.add(source, context, status, normalized)
            parse_json_object(inventory, source, value, (*path, key_text))
    elif isinstance(obj, list):
        for index, value in enumerate(obj):
            parse_json_object(inventory, source, value, (*path, f"[{index}]"))


def scan_text(inventory: Inventory, path: Path, text: str) -> None:
    source = str(path)

    if path.suffix.lower() == ".json":
        try:
            parse_json_object(inventory, source, json.loads(text))
            return
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", ";", "//")):
            continue

        match = ASSIGNMENT_RE.match(line)
        if match:
            name, raw_value = match.groups()
            if is_secret_name(name):
                status, normalized = normalize_value(raw_value)
                inventory.add(source, name, status, normalized)

        for flag_match in FLAG_RE.finditer(line):
            name, raw_value = flag_match.groups()
            status, normalized = normalize_value(raw_value)
            inventory.add(source, f"--{name}", status, normalized)


def should_skip_directory(path: Path) -> bool:
    return path.name in SKIP_DIR_NAMES


def scan_files(inventory: Inventory) -> None:
    visited: set[tuple[int, int]] = set()

    for root in SCAN_ROOTS:
        if not root.exists():
            continue

        for current_root, dir_names, file_names in os.walk(root, followlinks=False):
            current_path = Path(current_root)
            dir_names[:] = [
                name
                for name in dir_names
                if not should_skip_directory(current_path / name)
            ]

            for file_name in file_names:
                path = current_path / file_name
                try:
                    file_stat = path.stat()
                except (FileNotFoundError, PermissionError, OSError):
                    continue
                if not stat.S_ISREG(file_stat.st_mode):
                    continue
                inode_key = (file_stat.st_dev, file_stat.st_ino)
                if inode_key in visited:
                    continue
                visited.add(inode_key)

                if ARTIFACT_NAME_RE.search(file_name):
                    inventory.add(str(path), "(credential-bearing artifact)", "file_present")

                if file_stat.st_size > MAX_FILE_SIZE:
                    continue
                try:
                    raw = path.read_bytes()
                except (PermissionError, OSError):
                    continue
                if b"\x00" in raw[:8192]:
                    continue
                try:
                    text = raw.decode("utf-8")
                except UnicodeDecodeError:
                    continue
                scan_text(inventory, path, text)

    for path in EXPLICIT_FILES:
        if not path.exists():
            continue
        try:
            file_stat = path.stat()
            raw = path.read_bytes()
        except (FileNotFoundError, PermissionError, OSError):
            continue
        if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_size > MAX_FILE_SIZE:
            continue
        if ARTIFACT_NAME_RE.search(path.name):
            inventory.add(str(path), "(credential-bearing artifact)", "file_present")
        if b"\x00" in raw[:8192]:
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        scan_text(inventory, path, text)


def scan_process_environments(inventory: Inventory) -> None:
    proc_root = Path("/proc")
    if not proc_root.exists():
        return

    seen_by_process: set[tuple[str, str, str]] = set()
    for entry in proc_root.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            process_name = (entry / "comm").read_text(errors="replace").strip()
            environ = (entry / "environ").read_bytes()
        except (FileNotFoundError, PermissionError, ProcessLookupError, OSError):
            continue

        for item in environ.split(b"\0"):
            if b"=" not in item:
                continue
            raw_name, raw_value = item.split(b"=", 1)
            name = raw_name.decode("utf-8", errors="replace")
            if not is_secret_name(name):
                continue
            value = raw_value.decode("utf-8", errors="replace")
            status, normalized = normalize_value(value)
            dedupe_key = (process_name, name, status)
            if dedupe_key in seen_by_process:
                continue
            seen_by_process.add(dedupe_key)
            inventory.add(f"process:{process_name}", name, status, normalized)


def main() -> int:
    inventory = Inventory()
    scan_files(inventory)
    scan_process_environments(inventory)
    inventory.emit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
