"""Daily message limits and chat rate limiting for Flask (file-backed until Convex Phase 5+)."""

import hashlib
import json
import os
import time
from datetime import date
from pathlib import Path
from threading import Lock

from flask import request, session

DAILY_MESSAGE_LIMIT = 10
CHAT_RATE_MAX_REQUESTS = 8
CHAT_RATE_WINDOW_SECONDS = 60
CHAT_RATE_MIN_INTERVAL_SECONDS = 2
USAGE_STORE_PATH = Path("data/daily_usage.json")
usage_lock = Lock()


def use_convex_usage() -> bool:
    """When true, Flask skips writing data/daily_usage.json (Convex owns counts from Phase 5+)."""
    return os.environ.get("USE_CONVEX_USAGE", "").lower() in ("1", "true", "yes")


rate_lock = Lock()
rate_buckets: dict[str, list[float]] = {}


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


def _prune_rate_timestamps(timestamps: list[float], now: float) -> list[float]:
    cutoff = now - CHAT_RATE_WINDOW_SECONDS
    return [stamp for stamp in timestamps if stamp > cutoff]


def rate_limit_status_for_current_request() -> dict:
    client_key = get_usage_client_key()
    now = time.monotonic()

    with rate_lock:
        timestamps = _prune_rate_timestamps(rate_buckets.get(client_key, []), now)
        rate_buckets[client_key] = timestamps

        retry_after_seconds = 0
        allowed = True

        if timestamps:
            since_last = now - timestamps[-1]
            if since_last < CHAT_RATE_MIN_INTERVAL_SECONDS:
                allowed = False
                retry_after_seconds = max(
                    1,
                    int(round(CHAT_RATE_MIN_INTERVAL_SECONDS - since_last)),
                )

        if len(timestamps) >= CHAT_RATE_MAX_REQUESTS:
            allowed = False
            window_retry = max(
                1, int(round(CHAT_RATE_WINDOW_SECONDS - (now - timestamps[0])))
            )
            retry_after_seconds = max(retry_after_seconds, window_retry)

        return {
            "allowed": allowed,
            "retryAfterSeconds": retry_after_seconds,
            "windowSeconds": CHAT_RATE_WINDOW_SECONDS,
            "maxPerWindow": CHAT_RATE_MAX_REQUESTS,
            "minIntervalSeconds": CHAT_RATE_MIN_INTERVAL_SECONDS,
            "requestsInWindow": len(timestamps),
        }


def record_rate_limit_hit_for_current_request() -> None:
    client_key = get_usage_client_key()
    now = time.monotonic()
    with rate_lock:
        timestamps = _prune_rate_timestamps(rate_buckets.get(client_key, []), now)
        timestamps.append(now)
        rate_buckets[client_key] = timestamps


def rate_limit_message(retry_after_seconds: int) -> str:
    wait = max(1, retry_after_seconds)
    return (
        f"Meow, you're sending messages too fast! "
        f"Please wait {wait} second{'s' if wait != 1 else ''} and try again."
    )


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
        "canSend": daily["allowed"] and rate["allowed"],
    }


def increment_usage_for_current_request() -> dict:
    client_key = get_usage_client_key()
    today = today_key()
    with usage_lock:
        store = _prune_old_days(_load_store())
        day_counts = store.get(today, {})
        if not isinstance(day_counts, dict):
            day_counts = {}
        day_counts[client_key] = int(day_counts.get(client_key, 0)) + 1
        store[today] = day_counts
        if not use_convex_usage():
            _save_store(store)
    record_rate_limit_hit_for_current_request()
    return usage_status_for_current_request()
