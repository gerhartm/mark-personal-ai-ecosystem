#!/usr/bin/env python3
"""Move Hermes dashboard credentials from environment variables into config.

Run this inside the Hermes container with the three required dashboard
variables already exported. The password is stored only as Hermes's native
scrypt hash; no credential value is written to stdout.
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml

from plugins.dashboard_auth.basic import hash_password


CONFIG_PATH = Path("/opt/data/config.yaml")
REQUIRED = (
    "HERMES_DASHBOARD_BASIC_AUTH_USERNAME",
    "HERMES_DASHBOARD_BASIC_AUTH_PASSWORD",
    "HERMES_DASHBOARD_BASIC_AUTH_SECRET",
)


def main() -> None:
    missing = [key for key in REQUIRED if not os.environ.get(key)]
    if missing:
        raise SystemExit("Missing required environment inputs: " + ", ".join(missing))

    original_stat = CONFIG_PATH.stat()
    config = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    dashboard = config.setdefault("dashboard", {})
    dashboard["basic_auth"] = {
        "username": os.environ["HERMES_DASHBOARD_BASIC_AUTH_USERNAME"],
        "password_hash": hash_password(
            os.environ["HERMES_DASHBOARD_BASIC_AUTH_PASSWORD"]
        ),
        "secret": os.environ["HERMES_DASHBOARD_BASIC_AUTH_SECRET"],
        "session_ttl_seconds": 43_200,
    }

    temporary = CONFIG_PATH.with_name(CONFIG_PATH.name + ".tmp")
    temporary.write_text(
        yaml.safe_dump(config, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    os.chmod(temporary, 0o600)
    os.chown(temporary, original_stat.st_uid, original_stat.st_gid)
    os.replace(temporary, CONFIG_PATH)

    stored = config["dashboard"]["basic_auth"]
    print("dashboard_auth_migration=complete")
    print("stored_fields=" + ",".join(sorted(stored)))
    print("password_storage=scrypt_hash")
    print("config_mode=0600")


if __name__ == "__main__":
    main()
