#!/usr/bin/env python3
"""Create and validate the private OpenViking server configuration.

The script is intended to run inside the OpenViking container. It reads the
two secret inputs from temporary owner-only files, writes ``ov.conf``
atomically, and never prints credential values.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from openviking.server.config import ServerConfig
from openviking_cli.utils.config.encryption_config import EncryptionConfig
from openviking_cli.utils.config.open_viking_config import OpenVikingConfig


OPENAI_KEY_FILE = Path("/tmp/openviking-openai-api-key")
ROOT_KEY_FILE = Path("/tmp/openviking-root-api-key")
CONFIG_DIR = Path("/app/.openviking")
CONFIG_PATH = CONFIG_DIR / "ov.conf"


def read_secret(path: Path) -> str:
    value = path.read_text(encoding="utf-8").strip()
    if not value:
        raise SystemExit(f"Secret input is empty: {path.name}")
    return value


def main() -> None:
    openai_key = read_secret(OPENAI_KEY_FILE)
    root_api_key = read_secret(ROOT_KEY_FILE)

    config = {
        "default_account": "mark-gerhart",
        "default_user": "hermes",
        "storage": {
            "workspace": "/app/.openviking/data",
            "agfs": {"backend": "local"},
            "vectordb": {"name": "context", "backend": "local"},
        },
        "embedding": {
            "dense": {
                "provider": "openai",
                "backend": "openai",
                "model": "text-embedding-3-small",
                "api_key": openai_key,
                "api_base": "https://api.openai.com/v1",
                "dimension": 1536,
                "input": "text",
            },
            "max_concurrent": 4,
            "max_retries": 3,
        },
        "vlm": {
            "provider": "openai",
            "model": "gpt-5.4",
            "api_key": openai_key,
            "api_base": "https://api.openai.com/v1",
            "temperature": 0.0,
            "max_retries": 3,
            "max_concurrent": 4,
        },
        "server": {
            "host": "0.0.0.0",
            "port": 1933,
            "workers": 1,
            "auth_mode": "api_key",
            "root_api_key": root_api_key,
            "cors_origins": [],
            "with_bot": False,
        },
        "encryption": {
            "enabled": True,
            "provider": "local",
            "local": {"key_file": "/app/.openviking/master.key"},
            "api_key_hashing": {"enabled": True},
        },
        "allow_private_networks": False,
        "telemetry": {"tracer": {"enabled": False}},
    }

    # Validate every non-server section and the server schema before writing.
    OpenVikingConfig.model_validate({k: v for k, v in config.items() if k != "server"})
    ServerConfig.model_validate(config["server"])
    EncryptionConfig.model_validate(config["encryption"])

    CONFIG_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(CONFIG_DIR, 0o700)
    temporary = CONFIG_PATH.with_name(CONFIG_PATH.name + ".tmp")
    temporary.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, CONFIG_PATH)

    print("openviking_config=complete")
    print("configuration_validation=passed")
    print("exposure=private_container_network_only")
    print("storage=native_local_agfs_and_vectordb")
    print("encryption=native_local_aes_with_argon2id_api_key_hashing")


if __name__ == "__main__":
    main()
