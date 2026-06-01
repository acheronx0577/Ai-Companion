"""Daily message limits (file-backed fallback when Convex usage is off)."""

import hashlib
import json
import os
from datetime import date
from pathlib import Path
from threading import Lock

from flask import request, session

DAILY_MESSAGE_LIMIT = 10
USAGE_STORE_PATH = Path("data/daily_usage.json")
usage_lock = Lock()


def use_convex_usage() -> bool:
    """When true, Flask skips local daily usage (Convex owns counts — see convex_usage.py)."""
    from convex_usage import use_convex_usage as _use_convex_usage

    return _use_convex_usage()


def get_client_ip() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.remote_addr or "unknown"


def hash_client_ip(ip: str) -> str:
    pepper = os.environ.get("USAGE_LIMIT_PEPPER", "wakuwaku-usage-pepper")
    digest = hashlib.sha256(f"{pepper}:{ip}".encode("utf-8")).hexdigest()
    return digest[:32]


def get_usage_client_key() -> str:
    user = session.get("user")
    if isinstance(user, dict) and user.get("id"):
        return f"user:{user['id']}"
    return f"ip:{hash_client_ip(get_client_ip())}"


def today_key() -> str:
    return date.today().isoformat()


def _load_store() -> dict:
    if not USAGE_STORE_PATH.exists():
        return {}
    try:
        data = json.loads(USAGE_STORE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_store(store: dict) -> None:
    USAGE_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    USAGE_STORE_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


def _prune_old_days(store: dict) -> dict:
    today = today_key()
    return {day: counts for day, counts in store.items() if day == today}


def get_usage_count_for_current_request() -> int:
    client_key = get_usage_client_key()
    today = today_key()
    with usage_lock:
        store = _prune_old_days(_load_store())
        day_counts = store.get(today, {})
        if not isinstance(day_counts, dict):
            day_counts = {}
        return int(day_counts.get(client_key, 0))


def rate_limit_status_for_current_request() -> dict:
    """Per-message rate limits disabled; daily cap only."""
    return {
        "allowed": True,
        "retryAfterSeconds": 0,
        "windowSeconds": 0,
        "maxPerWindow": 0,
        "minIntervalSeconds": 0,
        "requestsInWindow": 0,
    }


def usage_status_for_current_request() -> dict:
    used = get_usage_count_for_current_request()
    remaining = max(0, DAILY_MESSAGE_LIMIT - used)
    daily = {
        "limit": DAILY_MESSAGE_LIMIT,
        "used": used,
        "remaining": remaining,
        "allowed": remaining > 0,
    }
    rate = rate_limit_status_for_current_request()
    return {
        **daily,
        "rate": rate,
        "canSend": daily["allowed"],
    }


def increment_usage_for_current_request() -> dict:
    if use_convex_usage():
        return usage_status_for_current_request()
    client_key = get_usage_client_key()
    today = today_key()
    with usage_lock:
        store = _prune_old_days(_load_store())
        day_counts = store.get(today, {})
        if not isinstance(day_counts, dict):
            day_counts = {}
        day_counts[client_key] = int(day_counts.get(client_key, 0)) + 1
        store[today] = day_counts
        _save_store(store)
    return usage_status_for_current_request()
