#!/usr/bin/env python3
"""Idempotently escrow OpenViking credentials in the owner-only master file.

The script deliberately never prints secret values. It reads secret material from
the owner-only OpenViking escrow directory and replaces one bounded section in
ALL-CREDENTIALS.txt while preserving mode 0600.
"""

from __future__ import annotations

import os
from pathlib import Path


CLIENT_ROOT = Path(__file__).resolve().parents[2]
SECRETS_ROOT = CLIENT_ROOT / ".secrets" / "credentials" / "new-vps"
OPENVIKING_ROOT = SECRETS_ROOT / "openviking"
MASTER_FILE = SECRETS_ROOT / "ALL-CREDENTIALS.txt"
START = "# BEGIN OPENVIKING NATIVE MEMORY SERVICE"
END = "# END OPENVIKING NATIVE MEMORY SERVICE"


def read_one_line(name: str) -> str:
    value = (OPENVIKING_ROOT / name).read_text(encoding="utf-8").strip()
    if not value or "\n" in value or "\r" in value:
        raise ValueError(f"Unexpected secret format in {name}")
    return value


def main() -> None:
    master = MASTER_FILE.read_text(encoding="utf-8")
    root_key = read_one_line("root-api-key")
    user_key = read_one_line("hermes-user-api-key")
    encryption_key = read_one_line("master.key")

    section = "\n".join(
        [
            START,
            "Owner: Mark Gerhart",
            "Deployment: OpenViking v0.4.11, private Docker service on the V2 VPS",
            "Public URL: none (private service only)",
            "Internal endpoint: http://openviking:1933",
            "Account: mark-gerhart",
            "Hermes user: hermes",
            "Hermes agent: hermes",
            f"Root API key: {root_key}",
            f"Hermes user API key: {user_key}",
            f"Encryption master key: {encryption_key}",
            "Secure config copy: .secrets/credentials/new-vps/openviking/ov.conf",
            "Secure master-key copy: .secrets/credentials/new-vps/openviking/master.key",
            "Status: active and verified",
            "Created: 2026-07-31",
            END,
        ]
    )

    if START in master or END in master:
        if START not in master or END not in master:
            raise ValueError("OpenViking section markers are incomplete")
        before, remainder = master.split(START, 1)
        _, after = remainder.split(END, 1)
        updated = before.rstrip() + "\n\n" + section + after
    else:
        updated = master.rstrip() + "\n\n" + section + "\n"

    tmp = MASTER_FILE.with_suffix(MASTER_FILE.suffix + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(updated)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, MASTER_FILE)
        os.chmod(MASTER_FILE, 0o600)
    finally:
        if tmp.exists():
            tmp.unlink()

    print("OpenViking credentials escrowed without displaying secret values.")


if __name__ == "__main__":
    main()
