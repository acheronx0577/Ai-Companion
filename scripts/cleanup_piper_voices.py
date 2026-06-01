#!/usr/bin/env python3
"""Remove Piper ONNX files not used by WakuWaku (e.g. old male Spanish models)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from piper_voices import PIPER_VOICE_CATALOG, VOICES_DIR  # noqa: E402

# Retired male / duplicate Spanish models — safe to delete if still on disk.
DEPRECATED_VOICE_IDS: frozenset[str] = frozenset(
    {
        "es_ES-sharvard-medium",
        "es_ES-davefx-medium",
        "es_ES-mls_9972-low",
        "es_ES-mls_10246-low",
        "es_ES-carlfm-x_low",
        "es_AR-daniela-high",
        "zh_CN-huayan-medium",
        "vi_VN-25hours_single-low",
    }
)


def voice_id_from_filename(name: str) -> str | None:
    if name.endswith(".onnx.json"):
        return name[: -len(".onnx.json")]
    if name.endswith(".onnx"):
        return name[: -len(".onnx")]
    return None


def main() -> int:
    voices_dir = ROOT / VOICES_DIR
    if not voices_dir.is_dir():
        print("No voices/ directory.")
        return 0

    allowed = {entry["id"] for entry in PIPER_VOICE_CATALOG}
    removed: list[str] = []

    for path in voices_dir.iterdir():
        if not path.is_file():
            continue
        voice_id = voice_id_from_filename(path.name)
        if voice_id is None:
            continue
        if voice_id in allowed:
            continue
        path.unlink()
        removed.append(path.name)

    if removed:
        print("Removed:", ", ".join(sorted(removed)))
    else:
        print("Nothing to remove — voices/ only contains active Piper models.")
    print("Active:", ", ".join(sorted(allowed)))
    if DEPRECATED_VOICE_IDS - allowed:
        print("(Deprecated male Spanish IDs are never re-downloaded by the app.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
