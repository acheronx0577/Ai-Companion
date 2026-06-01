"""Phase 6 — call Convex HTTP usage increment from Flask `/chat`."""

import json
import os
import urllib.error
import urllib.request

from dotenv import load_dotenv
from flask import Request


def _load_convex_env() -> None:
    load_dotenv(".env.local")
    load_dotenv()


def convex_site_url() -> str:
    _load_convex_env()
    return os.environ.get("CONVEX_SITE_URL", "").strip().rstrip("/")


def use_convex_usage() -> bool:
    """When true, daily usage is enforced via Convex (not data/daily_usage.json)."""
    explicit = os.environ.get("USE_CONVEX_USAGE", "").strip().lower()
    if explicit in ("0", "false", "no"):
        return False
    if explicit in ("1", "true", "yes"):
        return True
    _load_convex_env()
    return bool(os.environ.get("CONVEX_URL", "").strip())


def bearer_token_from_request(req: Request) -> str | None:
    auth_header = (req.headers.get("Authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        return token or None
    return (req.headers.get("X-Convex-Auth") or "").strip() or None


def increment_usage_via_convex(bearer_token: str) -> dict:
    """
    POST to Convex HTTP action; returns usage status dict (Flask shape).
    Raises ValueError on configuration or auth errors.
    """
    site = convex_site_url()
    if not site:
        raise ValueError("CONVEX_SITE_URL is not set. Run npm run convex:dev.")

    url = f"{site}/api/chat/increment-usage"
    request = urllib.request.Request(
        url,
        data=b"{}",
        method="POST",
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"error": body or error.reason}
        message = payload.get("error") or error.reason or "Convex usage request failed"
        if error.code == 401:
            raise ValueError("Convex authentication failed") from error
        raise ValueError(message) from error

    if not payload.get("ok"):
        raise ValueError(payload.get("error") or "Convex usage increment failed")

    usage = payload.get("usage")
    if not isinstance(usage, dict):
        raise ValueError("Convex usage response missing usage object")
    return usage
