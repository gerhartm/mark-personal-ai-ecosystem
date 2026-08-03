#!/usr/bin/env python3
"""Configure Hermes's native OpenViking provider without logging secrets.

Run inside the Hermes container after placing the user API key at the temporary
path below. The provider connection is stored in Hermes's supported ``.env``
file with owner-only permissions. ``memory.provider`` is enabled separately
through ``hermes config set``.
"""

from __future__ import annotations

import os
from pathlib import Path


KEY_FILE = Path("/tmp/openviking-hermes-user-api-key")
HERMES_HOME = Path(os.environ.get("HERMES_HOME", "/opt/data"))
ENV_FILE = HERMES_HOME / ".env"
MANAGED_KEYS = {
    "OPENVIKING_ENDPOINT": "http://openviking:1933",
    "OPENVIKING_API_KEY": "",
    "OPENVIKING_ACCOUNT": "mark-gerhart",
    "OPENVIKING_USER": "hermes",
    "OPENVIKING_AGENT": "hermes",
}


def line_safe(value: str) -> str:
    return "".join(value.replace("\x00", "").splitlines())


def main() -> None:
    api_key = KEY_FILE.read_text(encoding="utf-8").strip()
    if not api_key:
        raise SystemExit("OpenViking user API key input is empty")
    updates = dict(MANAGED_KEYS)
    updates["OPENVIKING_API_KEY"] = api_key

    existing = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
    output: list[str] = []
    written: set[str] = set()
    for line in existing:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in updates:
            output.append(f"{key}={line_safe(updates[key])}")
            written.add(key)
        else:
            output.append(line)
    for key, value in updates.items():
        if key not in written:
            output.append(f"{key}={line_safe(value)}")

    HERMES_HOME.mkdir(mode=0o700, parents=True, exist_ok=True)
    reference = (HERMES_HOME / "config.yaml").stat()
    temporary = ENV_FILE.with_name(ENV_FILE.name + ".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write("\n".join(output) + "\n")
    os.chmod(temporary, 0o600)
    os.chown(temporary, reference.st_uid, reference.st_gid)
    os.replace(temporary, ENV_FILE)

    print("hermes_openviking_env=complete")
    print("managed_keys=" + ",".join(sorted(updates)))
    print("secret_file_mode=0600")


if __name__ == "__main__":
    main()
