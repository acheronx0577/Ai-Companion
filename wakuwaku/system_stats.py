"""Lightweight process stats for the sidebar metrics panel."""

from __future__ import annotations

import os
import sys
import time
from typing import Any

from .site_views import get_site_view_count

_PROCESS_START = time.monotonic()
_PREV_CPU: tuple[int, float] | None = None


def _memory_rss_mb() -> float:
    try:
        import psutil

        return psutil.Process().memory_info().rss / (1024**2)
    except ImportError:
        pass
    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF)
        rss = usage.ru_maxrss
        if sys.platform == "win32":
            return rss / (1024**2)
        return rss / 1024
    except ImportError:
        return 0.0


def _memory_limit_mb() -> float:
    raw = os.environ.get("RENDER_INSTANCE_MEMORY_MB", "512").strip()
    try:
        return max(64.0, float(raw))
    except ValueError:
        return 512.0


def _linux_process_cpu_percent() -> float | None:
    global _PREV_CPU
    if sys.platform == "win32":
        return None
    try:
        clk_tck = os.sysconf("SC_CLK_TCK")
    except (AttributeError, OSError, ValueError):
        clk_tck = 100
    try:
        with open("/proc/self/stat", encoding="utf-8") as handle:
            fields = handle.read().split()
        utime = int(fields[13])
        stime = int(fields[14])
    except (OSError, IndexError, ValueError):
        return None

    now_ticks = utime + stime
    now_wall = time.monotonic()
    if _PREV_CPU is None:
        _PREV_CPU = (now_ticks, now_wall)
        return 0.0

    prev_ticks, prev_wall = _PREV_CPU
    _PREV_CPU = (now_ticks, now_wall)
    delta_wall = now_wall - prev_wall
    if delta_wall <= 0:
        return 0.0
    delta_ticks = now_ticks - prev_ticks
    percent = (delta_ticks / clk_tck / delta_wall) * 100.0
    return round(min(100.0, max(0.0, percent)), 1)


def _cpu_percent() -> float | None:
    try:
        import psutil

        return round(psutil.cpu_percent(interval=None), 1)
    except ImportError:
        return _linux_process_cpu_percent()


def system_stats_payload(
    *,
    piper_model_loaded: bool,
    piper_synthesis_busy: bool = False,
) -> dict[str, Any]:
    rss_mb = round(_memory_rss_mb(), 1)
    limit_mb = _memory_limit_mb()
    memory_percent = (
        round(min(100.0, (rss_mb / limit_mb) * 100.0), 1) if limit_mb else 0.0
    )
    cpu = _cpu_percent()
    uptime_sec = int(time.monotonic() - _PROCESS_START)

    return {
        "viewCount": get_site_view_count(),
        "cpuPercent": cpu,
        "memoryMb": rss_mb,
        "memoryLimitMb": limit_mb,
        "memoryPercent": memory_percent,
        "piperModelLoaded": piper_model_loaded,
        "piperSynthesisBusy": piper_synthesis_busy,
        "uptimeSec": uptime_sec,
    }
