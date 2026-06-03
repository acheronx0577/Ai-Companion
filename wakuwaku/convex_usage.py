"""Call Convex HTTP usage increment from Flask `/chat`."""

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


def _post_convex_json(path: str, bearer_token: str) -> dict:
    """POST to a Convex HTTP action with the user's verified bearer token."""
    site = convex_site_url()
    if not site:
        raise ValueError("CONVEX_SITE_URL is not set. Run npm run convex:dev.")

    url = f"{site}{path}"
    convex_request = urllib.request.Request(
        url,
        data=b"{}",
        method="POST",
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(convex_request, timeout=30) as response:
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
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ValueError("Convex request failed") from error

    if not payload.get("ok"):
        raise ValueError(payload.get("error") or "Convex request failed")
    return payload


def increment_usage_via_convex(bearer_token: str) -> dict:
    """
    Increment daily usage through Convex and return the Flask usage-status shape.
    Raises ValueError on configuration or auth errors.
    """
    payload = _post_convex_json("/api/chat/increment-usage", bearer_token)

    usage = payload.get("usage")
    if not isinstance(usage, dict):
        raise ValueError("Convex usage response missing usage object")
    return usage


def fetch_verified_profile_via_convex(bearer_token: str) -> dict:
    """Resolve a Flask-session profile from a Convex-verified bearer token."""
    payload = _post_convex_json("/api/auth/session-profile", bearer_token)
    user = payload.get("user")
    if not isinstance(user, dict) or not user.get("id"):
        raise ValueError("Convex profile response missing user object")
    return user


def use_convex_views() -> bool:
    """When true, we try to store page views in Convex instead of local JSON."""
    import sys
    # Avoid real network requests during unit testing
    if "unittest" in sys.argv[0] or "pytest" in sys.modules:
        return False
    _load_convex_env()
    return bool(os.environ.get("CONVEX_SITE_URL", "").strip())


def get_convex_json_public(path: str) -> dict:
    """GET public JSON from a Convex HTTP action without a bearer token."""
    site = convex_site_url()
    if not site:
        raise ValueError("CONVEX_SITE_URL is not set.")
    url = f"{site}{path}"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as error:
        raise ValueError(f"Convex public GET request failed: {error}") from error


def post_convex_json_public(path: str, body: dict | None = None) -> dict:
    """POST public JSON to a Convex HTTP action without a bearer token."""
    site = convex_site_url()
    if not site:
        raise ValueError("CONVEX_SITE_URL is not set.")
    url = f"{site}{path}"
    data = json.dumps(body or {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as error:
        raise ValueError(f"Convex public POST request failed: {error}") from error
