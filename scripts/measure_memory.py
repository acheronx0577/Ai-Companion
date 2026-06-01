#!/usr/bin/env python3
"""Rough RSS estimate for Flask + English Piper (run from repo root with venv)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)


def rss_mb() -> float:
    try:
        import psutil

        return psutil.Process(os.getpid()).memory_info().rss / (1024**2)
    except ImportError:
        # Linux/Docker only
        with open("/proc/self/status", encoding="utf-8") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1024
        return 0.0


def main() -> None:
    onnx = ROOT / "voices" / "en_US-hfc_female-medium.onnx"
    if onnx.is_file():
        print(f"English ONNX on disk: {onnx.stat().st_size / (1024**2):.1f} MB")
    else:
        print("English ONNX on disk: (missing — run npm run download:piper-voices)")

    print(f"{'Stage':<32} {'RSS MB':>8}")
    print("-" * 42)

    def line(label: str) -> None:
        print(f"{label:<32} {rss_mb():>8.1f}")

    line("Python start")
    import importlib

    flask_mod = importlib.import_module("app")
    _ = flask_mod.app
    line("After Flask app import")
    from piper_voices import (
        get_piper_voice,
        synthesize_text_to_wav,
        voice_files_present,
    )

    line("After piper_voices import")
    if voice_files_present("en_US-hfc_female-medium"):
        voice = get_piper_voice("en_US-hfc_female-medium")
        line("After English Piper load")
        synthesize_text_to_wav(voice, "Memory check.")
        line("After one /tts synthesis")
    else:
        print("(skipped Piper load — no model file)")

    print()
    print("Render Free tier limit: 512 MB RAM per instance")
    print("Gunicorn: 1 worker, 4 threads (serve.py)")


if __name__ == "__main__":
    main()
