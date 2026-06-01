#!/usr/bin/env python3
"""Download official Piper voices used by WakuWaku into voices/."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from piper_voices import PIPER_VOICE_CATALOG, VOICES_DIR  # noqa: E402


def main() -> None:
    voices_dir = ROOT / VOICES_DIR
    voices_dir.mkdir(parents=True, exist_ok=True)
    voice_ids = [entry["id"] for entry in PIPER_VOICE_CATALOG]
    cmd = [
        sys.executable,
        "-m",
        "piper.download_voices",
        *voice_ids,
        "--download-dir",
        str(voices_dir),
    ]
    print("Downloading:", ", ".join(voice_ids))
    subprocess.check_call(cmd, cwd=ROOT)
    print(
        "\nDone. Piper voices are ready in voices/.\n"
        "Korean (ko) has no compatible Piper model in piper-tts; "
        "WakuWaku uses your browser's Korean voice when you select Korean."
    )


if __name__ == "__main__":
    main()
