"""Persistent total page-view counter for the sidebar metrics panel."""

from __future__ import annotations

import json
import random
from pathlib import Path
from threading import Lock

from .convex_usage import use_convex_views, get_convex_json_public, post_convex_json_public

SITE_VIEWS_PATH = Path("data/site_views.json")
VIEWS_PER_PAGE_LOAD_MIN = 1
VIEWS_PER_PAGE_LOAD_MAX = 1
site_views_lock = Lock()


def random_views_for_page_load() -> int:
    """Pick a varied bump per visit (always 1)."""
    return 1


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
    parent = SITE_VIEWS_PATH.parent
    parent.mkdir(parents=True, exist_ok=True)
    temp_path = parent / (SITE_VIEWS_PATH.name + ".tmp")
    try:
        temp_path.write_text(
            json.dumps({"total": max(0, total)}, indent=2),
            encoding="utf-8",
        )
        temp_path.replace(SITE_VIEWS_PATH)
    except OSError:
        # Fallback to direct write if atomic replace/rename fails
        SITE_VIEWS_PATH.write_text(
            json.dumps({"total": max(0, total)}, indent=2),
            encoding="utf-8",
        )
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def get_site_view_count() -> int:
    if use_convex_views():
        try:
            payload = get_convex_json_public("/api/site-views/get")
            if payload.get("ok"):
                return int(payload["count"])
        except Exception:
            pass
    with site_views_lock:
        return _load_total()


def record_site_view() -> int:
    """Increment the global view counter and return the new total."""
    if use_convex_views():
        try:
            payload = post_convex_json_public("/api/site-views/increment")
            if payload.get("ok"):
                return int(payload["count"])
        except Exception:
            pass
    with site_views_lock:
        total = _load_total() + random_views_for_page_load()
        _save_total(total)
        return total
