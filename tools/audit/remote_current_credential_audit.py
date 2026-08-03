#!/usr/bin/env python3
"""Audit current VPS credentials without emitting any credential value."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def read_json(path: str) -> dict:
    return json.loads(Path(path).read_text())


def read_env(path: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip("\"'")
    return result


def nested(data: object, *keys: str) -> object | None:
    current = data
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def classify(value: str | None) -> str:
    if value is None:
        return "missing"
    if not value:
        return "empty"
    if re.fullmatch(r"\d{6,12}:[A-Za-z0-9_-]{20,}", value):
        return "telegram_bot_token"
    if value.startswith("sk-ant-"):
        return "anthropic_api_key"
    if value.startswith(("sk-", "sk-proj-")):
        return "openai_style_api_key"
    if value.count(".") == 2 and len(value) > 80:
        return "jwt_or_oauth_token"
    if re.fullmatch(r"[0-9a-fA-F-]{32,64}", value):
        return "uuid_or_hex_secret"
    if len(value) < 32:
        return "short_config_value"
    return "opaque_secret"


def http_status(
    url: str,
    headers: dict[str, str],
    *,
    method: str = "GET",
) -> tuple[str, bytes]:
    request = urllib.request.Request(url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return f"valid_http_{response.status}", response.read(131072)
    except urllib.error.HTTPError as error:
        error.read(131072)
        return f"http_{error.code}", b""
    except Exception as error:
        return f"check_error_{type(error).__name__}", b""


def telegram_check(value: str) -> tuple[str, str]:
    status, body = http_status(f"https://api.telegram.org/bot{value}/getMe", {})
    identity = "-"
    if status == "valid_http_200":
        try:
            payload = json.loads(body)
            result = payload.get("result", {})
            identity = f"@{result.get('username', 'unknown')}"
        except Exception:
            identity = "valid_identity_unreadable"
    return status, identity


def twitter_check(values: dict[str, str]) -> tuple[str, str]:
    required = {
        "TWITTER_API_KEY",
        "TWITTER_API_SECRET",
        "TWITTER_ACCESS_TOKEN",
        "TWITTER_ACCESS_SECRET",
    }
    if not required.issubset(values):
        return "missing_bundle_member", "-"

    url = "https://api.x.com/2/users/me"
    oauth = {
        "oauth_consumer_key": values["TWITTER_API_KEY"],
        "oauth_nonce": secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": values["TWITTER_ACCESS_TOKEN"],
        "oauth_version": "1.0",
    }

    def quote(value: str) -> str:
        return urllib.parse.quote(value, safe="~-._")

    parameter_string = "&".join(
        f"{quote(key)}={quote(value)}" for key, value in sorted(oauth.items())
    )
    base_string = "&".join((quote("GET"), quote(url), quote(parameter_string)))
    signing_key = (
        f"{quote(values['TWITTER_API_SECRET'])}&"
        f"{quote(values['TWITTER_ACCESS_SECRET'])}"
    )
    signature = base64.b64encode(
        hmac.new(
            signing_key.encode(),
            base_string.encode(),
            hashlib.sha1,
        ).digest()
    ).decode()
    oauth["oauth_signature"] = signature
    auth_header = "OAuth " + ", ".join(
        f'{quote(key)}="{quote(value)}"' for key, value in sorted(oauth.items())
    )
    status, body = http_status(url, {"Authorization": auth_header})
    identity = "-"
    if status == "valid_http_200":
        try:
            payload = json.loads(body)
            identity = f"@{payload.get('data', {}).get('username', 'unknown')}"
        except Exception:
            identity = "valid_identity_unreadable"
    return status, identity


def main() -> None:
    crypto = read_json("/root/.openclaw/openclaw.json")
    content = read_json("/root/.openclaw-content-intel/openclaw.json")
    sapphire = read_json("/root/.openclaw-sapphire-media/openclaw.json")
    crypto_auth = read_json(
        "/root/.openclaw/agents/main/agent/auth-profiles.json"
    )
    content_auth = read_json(
        "/root/.openclaw-content-intel/agents/main/agent/auth-profiles.json"
    )
    sapphire_auth = read_json(
        "/root/.openclaw-sapphire-media/agents/main/agent/auth-profiles.json"
    )
    crypto_models = read_json("/root/.openclaw/agents/main/agent/models.json")
    twitter = read_env("/root/crypto-intel/config/twitter-creds.env")
    cloudflare = read_json(
        "/root/.cloudflared/68e4f425-54d3-475b-8773-cdea15f98f9c.json"
    )
    claude = read_json("/root/.claude/.credentials.json")
    codex = read_json("/root/.codex/auth.json")

    records: list[dict[str, object]] = [
        {
            "name": "OpenAI API key",
            "value": nested(crypto, "env", "vars", "OPENAI_API_KEY"),
            "source": "/root/.openclaw/openclaw.json",
            "migration": "reuse_after_validation",
        },
        {
            "name": "Anthropic API key",
            "value": nested(crypto_auth, "profiles", "anthropic:default", "key"),
            "source": "/root/.openclaw/agents/main/agent/auth-profiles.json",
            "migration": "reuse_after_validation",
        },
        {
            "name": "Venice API key",
            "value": nested(crypto_auth, "profiles", "venice:default", "key"),
            "source": "/root/.openclaw/agents/main/agent/auth-profiles.json",
            "migration": "reuse_after_validation",
        },
        {
            "name": "Sapphire alternate Venice key",
            "value": nested(sapphire_auth, "profiles", "venice:default", "key"),
            "source": "/root/.openclaw-sapphire-media/agents/main/agent/auth-profiles.json",
            "migration": "do_not_migrate_for_crypto_v2",
        },
        {
            "name": "Crypto Telegram bot token",
            "value": nested(crypto, "channels", "telegram", "botToken"),
            "source": "/root/.openclaw/openclaw.json",
            "migration": "reuse_for_crypto_v2_at_cutover",
        },
        {
            "name": "Content Telegram bot token",
            "value": nested(content, "channels", "telegram", "botToken"),
            "source": "/root/.openclaw-content-intel/openclaw.json",
            "migration": "preserve_for_later",
        },
        {
            "name": "Sapphire Telegram bot token",
            "value": nested(sapphire, "channels", "telegram", "botToken"),
            "source": "/root/.openclaw-sapphire-media/openclaw.json",
            "migration": "preserve_for_later",
        },
        {
            "name": "Crypto OpenClaw gateway token",
            "value": nested(crypto, "gateway", "auth", "token"),
            "source": "/root/.openclaw/openclaw.json",
            "migration": "regenerate",
        },
        {
            "name": "Content OpenClaw gateway token",
            "value": nested(content, "gateway", "auth", "token"),
            "source": "/root/.openclaw-content-intel/openclaw.json",
            "migration": "regenerate_if_migrated",
        },
        {
            "name": "Sapphire OpenClaw gateway token",
            "value": nested(sapphire, "gateway", "auth", "token"),
            "source": "/root/.openclaw-sapphire-media/openclaw.json",
            "migration": "regenerate_if_migrated",
        },
        {
            "name": "Codex provider configuration value",
            "value": nested(crypto_models, "providers", "codex", "apiKey"),
            "source": "/root/.openclaw/agents/main/agent/models.json",
            "migration": "reauthenticate_in_hermes",
        },
        {
            "name": "Codex CLI OpenAI API key",
            "value": codex.get("OPENAI_API_KEY"),
            "source": "/root/.codex/auth.json",
            "migration": "reuse_only_if_api_mode_selected",
        },
        {
            "name": "Claude OAuth access token",
            "value": nested(claude, "claudeAiOauth", "accessToken"),
            "source": "/root/.claude/.credentials.json",
            "migration": "do_not_copy_reauthenticate",
        },
        {
            "name": "Claude OAuth refresh token",
            "value": nested(claude, "claudeAiOauth", "refreshToken"),
            "source": "/root/.claude/.credentials.json",
            "migration": "do_not_copy_reauthenticate",
        },
        {
            "name": "Cloudflare tunnel secret",
            "value": cloudflare.get("TunnelSecret"),
            "source": "/root/.cloudflared/68e4f425-54d3-475b-8773-cdea15f98f9c.json",
            "migration": "prefer_new_tunnel_or_controlled_cutover",
        },
    ]
    for name in (
        "TWITTER_API_KEY",
        "TWITTER_API_SECRET",
        "TWITTER_ACCESS_TOKEN",
        "TWITTER_ACCESS_SECRET",
    ):
        records.append(
            {
                "name": name,
                "value": twitter.get(name),
                "source": "/root/crypto-intel/config/twitter-creds.env",
                "migration": "reuse_after_validation",
            }
        )

    value_groups: dict[str, str] = {}
    group_counter = 0
    for record in records:
        value = record["value"]
        if isinstance(value, str) and value:
            if value not in value_groups:
                group_counter += 1
                value_groups[value] = f"C{group_counter:02d}"
            record["group"] = value_groups[value]
        else:
            record["group"] = "-"
        record["kind"] = classify(value if isinstance(value, str) else None)
        record["status"] = "present" if isinstance(value, str) and value else "missing"
        record["validation"] = "not_checked"
        record["identity"] = "-"

    by_name = {str(record["name"]): record for record in records}

    openai_value = by_name["OpenAI API key"]["value"]
    if isinstance(openai_value, str) and openai_value:
        status, _ = http_status(
            "https://api.openai.com/v1/models",
            {"Authorization": f"Bearer {openai_value}"},
        )
        by_name["OpenAI API key"]["validation"] = status

    anthropic_value = by_name["Anthropic API key"]["value"]
    if isinstance(anthropic_value, str) and anthropic_value:
        status, _ = http_status(
            "https://api.anthropic.com/v1/models",
            {
                "x-api-key": anthropic_value,
                "anthropic-version": "2023-06-01",
            },
        )
        by_name["Anthropic API key"]["validation"] = status

    venice_value = by_name["Venice API key"]["value"]
    if isinstance(venice_value, str) and venice_value:
        status, _ = http_status(
            "https://api.venice.ai/api/v1/models",
            {"Authorization": f"Bearer {venice_value}"},
        )
        by_name["Venice API key"]["validation"] = status

    for name in (
        "Crypto Telegram bot token",
        "Content Telegram bot token",
        "Sapphire Telegram bot token",
    ):
        value = by_name[name]["value"]
        if isinstance(value, str) and value:
            status, identity = telegram_check(value)
            by_name[name]["validation"] = status
            by_name[name]["identity"] = identity

    twitter_status, twitter_identity = twitter_check(twitter)
    for name in (
        "TWITTER_API_KEY",
        "TWITTER_API_SECRET",
        "TWITTER_ACCESS_TOKEN",
        "TWITTER_ACCESS_SECRET",
    ):
        by_name[name]["validation"] = twitter_status
        by_name[name]["identity"] = twitter_identity

    print(
        "NAME\tSTATUS\tKIND\tGROUP\tVALIDATION\tIDENTITY\tMIGRATION\tSOURCE"
    )
    for record in records:
        print(
            "\t".join(
                str(record[key])
                for key in (
                    "name",
                    "status",
                    "kind",
                    "group",
                    "validation",
                    "identity",
                    "migration",
                    "source",
                )
            )
        )


if __name__ == "__main__":
    main()
