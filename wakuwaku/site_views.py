"""Persistent total page-view counter for the sidebar metrics panel."""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock

SITE_VIEWS_PATH = Path("data/site_views.json")
site_views_lock = Lock()


def _load_total() -> int:
    if not SITE_VIEWS_PATH.exists():
        return 0
    try:
        data = json.loads(SITE_VIEWS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0
    if not isinstance(data, dict):
        return 0
    try:
        return max(0, int(data.get("total", 0)))
    except (TypeError, ValueError):
        return 0


def _save_total(total: int) -> None:
    SITE_VIEWS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SITE_VIEWS_PATH.write_text(
        json.dumps({"total": max(0, int(total))}, indent=2),
        encoding="utf-8",
    )


def get_site_view_count() -> int:
    with site_views_lock:
        return _load_total()


def record_site_view() -> int:
    """Increment the global view counter and return the new total."""
    with site_views_lock:
        total = _load_total() + 1
        _save_total(total)
        return total
