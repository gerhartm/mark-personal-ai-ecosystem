#!/usr/bin/env python3
"""Apply or back up one Coolify service without exposing its API token.

The token is read from an owner-only file and is never printed. Backup output
is treated as sensitive because a Coolify service response can contain runtime
configuration metadata.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def request(method: str, url: str, token: str, payload: dict | None = None) -> bytes:
    body = json.dumps(payload).encode() if payload is not None else None
    req = Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=120) as response:
            return response.read()
    except HTTPError as exc:
        # Do not print the response body: it can contain service metadata.
        raise SystemExit(f"Coolify API request failed: HTTP {exc.code}") from None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=("backup", "update", "start", "restart", "stop", "delete-env-keys"),
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api/v1")
    parser.add_argument("--service-uuid", required=True)
    parser.add_argument("--token-file", type=Path, required=True)
    parser.add_argument("--compose-file", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--env-key", action="append", default=[])
    args = parser.parse_args()

    token = args.token_file.read_text(encoding="utf-8").strip()
    if not token:
        raise SystemExit("Token file is empty")

    service_url = f"{args.base_url.rstrip('/')}/services/{args.service_uuid}"

    if args.command == "backup":
        if args.output is None:
            raise SystemExit("--output is required for backup")
        data = request("GET", service_url, token)
        args.output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.chmod(args.output, 0o600)
        print("backup=complete")
        return

    if args.command == "update":
        if args.compose_file is None:
            raise SystemExit("--compose-file is required for update")
        compose_raw = args.compose_file.read_bytes()
        payload = {
            "docker_compose_raw": base64.b64encode(compose_raw).decode("ascii"),
            "instant_deploy": False,
        }
        request("PATCH", service_url, token, payload)
        print("update=complete")
        return

    if args.command == "delete-env-keys":
        if not args.env_key:
            raise SystemExit("At least one --env-key is required")
        raw = request("GET", f"{service_url}/envs", token)
        envs = json.loads(raw)
        if not isinstance(envs, list):
            raise SystemExit("Unexpected Coolify environment response")
        by_key = {item.get("key"): item for item in envs if isinstance(item, dict)}
        missing = sorted(set(args.env_key) - set(by_key))
        if missing:
            raise SystemExit("Environment key not found: " + ", ".join(missing))
        for key in args.env_key:
            env_uuid = by_key[key].get("uuid")
            if not env_uuid:
                raise SystemExit(f"Environment UUID missing for {key}")
            request("DELETE", f"{service_url}/envs/{env_uuid}", token)
        print("deleted_env_keys=" + ",".join(sorted(args.env_key)))
        return

    request("POST", f"{service_url}/{args.command}", token, {})
    print(f"{args.command}=requested")


if __name__ == "__main__":
    main()
