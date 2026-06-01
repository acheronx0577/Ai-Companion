"""Piper TTS voice catalog and loading (local ONNX files in voices/)."""

from __future__ import annotations

import base64
import io
import json
import os
import wave
from collections import OrderedDict
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any

try:
    from piper.voice import PiperVoice
except ImportError:
    PiperVoice = None  # type: ignore[misc, assignment]

VOICES_DIR = Path("voices")

PIPER_VOICE_CATALOG: tuple[dict[str, str], ...] = (
    {
        "id": "en_US-hfc_female-medium",
        "lang": "en",
        "locale": "en-US",
        "label": "Piper Natural Voice Female (en-US)",
    },
)

# Device voices kept even when Piper covers that language (Japanese has no Piper voice).
DEVICE_LANGS_ALWAYS: frozenset[str] = frozenset({"ja"})

BROWSER_VOICE_MENU: tuple[dict[str, str], ...] = (
    {
        "lang": "en",
        "locale": "en-US",
        "label": "English Device Voice (en-US)",
    },
    {
        "lang": "ja",
        "locale": "ja-JP",
        "label": "Japanese Device Voice (ja-JP)",
    },
)

_voice_lock = Lock()
_piper_synthesis_lock = Lock()
_voice_cache: dict[str, Any] = {}
_tts_wav_cache: OrderedDict[tuple[str, str], bytes] = OrderedDict()
_TTS_WAV_CACHE_MAX = 64
_availability_cache: dict[str, bool] | None = None
_availability_stamp: float = 0.0


def piper_disabled() -> bool:
    return os.environ.get("DISABLE_PIPER", "").lower() in ("1", "true", "yes")


def max_loaded_piper_voices() -> int:
    raw = os.environ.get("PIPER_MAX_LOADED_VOICES", "1").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 1


def voice_paths(voice_id: str) -> tuple[Path, Path]:
    return (
        VOICES_DIR / f"{voice_id}.onnx",
        VOICES_DIR / f"{voice_id}.onnx.json",
    )


def voice_files_present(voice_id: str) -> bool:
    model_path, config_path = voice_paths(voice_id)
    return model_path.is_file() and config_path.is_file()


def _catalog_stamp() -> float:
    stamp = 0.0
    for entry in PIPER_VOICE_CATALOG:
        for path in voice_paths(entry["id"]):
            if path.is_file():
                stamp = max(stamp, path.stat().st_mtime)
    return stamp


def voice_availability() -> dict[str, bool]:
    """File-presence only — does not load ONNX models."""
    global _availability_cache, _availability_stamp
    stamp = _catalog_stamp()
    if _availability_cache is not None and stamp == _availability_stamp:
        return _availability_cache
    piper_ok = not piper_disabled() and PiperVoice is not None
    _availability_cache = {
        entry["id"]: piper_ok and voice_files_present(entry["id"])
        for entry in PIPER_VOICE_CATALOG
    }
    _availability_stamp = stamp
    return _availability_cache


def clear_piper_runtime_cache() -> None:
    """Drop loaded models (tests / memory pressure)."""
    with _voice_lock:
        _voice_cache.clear()
    _tts_wav_cache.clear()


def piper_synthesis_busy() -> bool:
    """True while Piper is synthesizing speech (only one run at a time)."""
    return _piper_synthesis_lock.locked()


@contextmanager
def piper_synthesis_session():
    """Hold the global Piper synthesis lock for one TTS/warmup run."""
    _piper_synthesis_lock.acquire()
    try:
        yield
    finally:
        _piper_synthesis_lock.release()


def piper_model_loaded(voice_id: str | None = None) -> bool:
    """True when the ONNX model is already in this worker's memory."""
    if piper_disabled():
        return False
    resolved_id = resolve_piper_voice_id(voice_id)
    if not resolved_id:
        return False
    with _voice_lock:
        return resolved_id in _voice_cache


@dataclass(frozen=True)
class PiperVoiceInfo:
    """Installed Piper voice entry exposed to the voice picker API."""

    id: str
    lang: str
    locale: str
    label: str

    def to_json(self) -> dict[str, str | bool]:
        return {
            "id": self.id,
            "lang": self.lang,
            "locale": self.locale,
            "label": self.label,
            "available": True,
        }


def list_piper_voice_menu() -> list[dict[str, str | bool]]:
    availability = voice_availability()
    return [
        {**entry, "available": availability.get(entry["id"], False)}
        for entry in PIPER_VOICE_CATALOG
    ]


def list_browser_voice_menu(
    *, hide_piper_languages: bool = True
) -> list[dict[str, str]]:
    """Pinned device voices; hide English when Piper English is installed."""
    menu = [dict(entry) for entry in BROWSER_VOICE_MENU]
    if hide_piper_languages and not piper_disabled():
        availability = voice_availability()
        piper_langs = {
            entry["lang"]
            for entry in PIPER_VOICE_CATALOG
            if availability.get(entry["id"], False)
        } - DEVICE_LANGS_ALWAYS
        menu = [entry for entry in menu if entry["lang"] not in piper_langs]
    return menu


def list_available_piper_voices() -> list[PiperVoiceInfo]:
    availability = voice_availability()
    return [
        PiperVoiceInfo(**entry)
        for entry in PIPER_VOICE_CATALOG
        if availability.get(entry["id"], False)
    ]


def default_piper_voice_id() -> str | None:
    availability = voice_availability()
    for entry in PIPER_VOICE_CATALOG:
        if availability.get(entry["id"]):
            return entry["id"]
    return None


def resolve_piper_voice_id(requested: str | None) -> str | None:
    availability = voice_availability()
    if requested and availability.get(requested):
        return requested
    return default_piper_voice_id()


def _evict_loaded_voices(keep_id: str) -> None:
    limit = max_loaded_piper_voices()
    while len(_voice_cache) > limit - 1:
        evicted = False
        for voice_id in list(_voice_cache.keys()):
            if voice_id != keep_id:
                del _voice_cache[voice_id]
                evicted = True
                break
        if not evicted:
            break


def iter_warmup_piper_voice(
    voice_id: str | None = None,
) -> Iterator[dict[str, str | int | bool]]:
    """Yield real load stages for streaming progress (NDJSON) to the browser."""
    yield {"progress": 5, "message": "Starting voice engine…"}
    if piper_disabled():
        yield {
            "progress": 100,
            "message": "Piper is disabled on the server",
            "ok": False,
        }
        return
    resolved_id = resolve_piper_voice_id(voice_id)
    if resolved_id and piper_model_loaded(resolved_id):
        yield {"progress": 40, "message": "Voice engine still loaded…"}
        voice = get_piper_voice(voice_id)
        yield {"progress": 75, "message": "Verifying audio…"}
        warmed = (
            voice is not None
            and synthesize_text_to_wav(voice, "Voice engine is ready. Hello!")
            is not None
        )
        if warmed:
            yield {
                "progress": 100,
                "message": "Voice engine ready! You can start chatting now.",
                "ok": True,
                "voiceId": resolved_id,
                "cached": True,
            }
        else:
            yield {
                "progress": 100,
                "message": "Warmup speech failed — try again or switch voice",
                "ok": False,
            }
        return
    yield {"progress": 15, "message": "Loading voice model into memory…"}
    voice = get_piper_voice(voice_id)
    if voice is None:
        yield {
            "progress": 100,
            "message": "Voice model could not be loaded",
            "ok": False,
        }
        return
    resolved_id = resolve_piper_voice_id(voice_id)
    yield {"progress": 70, "message": "Model loaded — running warmup speech…"}
    warmed = (
        synthesize_text_to_wav(
            voice,
            "Voice engine is ready. Hello!",
        )
        is not None
    )
    if warmed:
        yield {
            "progress": 100,
            "message": "Voice engine ready! You can start chatting now.",
            "ok": True,
            "voiceId": resolved_id or "",
        }
    else:
        yield {
            "progress": 100,
            "message": "Warmup speech failed — try again or switch voice",
            "ok": False,
        }


def warmup_piper_voice(voice_id: str | None = None) -> bool:
    """Load ONNX and run a short synthesis so the first real reply is not cold."""
    final: dict[str, str | int | bool] | None = None
    for event in iter_warmup_piper_voice(voice_id):
        final = event
    return bool(final and final.get("ok"))


def get_piper_voice(voice_id: str | None = None):
    """Load one Piper model on demand; evicts others when PIPER_MAX_LOADED_VOICES=1."""
    if piper_disabled() or PiperVoice is None:
        return None
    resolved_id = resolve_piper_voice_id(voice_id)
    if resolved_id is None:
        return None
    cached = _voice_cache.get(resolved_id)
    if cached is not None:
        return cached
    model_path, config_path = voice_paths(resolved_id)
    if not (model_path.is_file() and config_path.is_file()):
        return None
    with _voice_lock:
        cached = _voice_cache.get(resolved_id)
        if cached is not None:
            return cached
        _evict_loaded_voices(resolved_id)
        loaded = PiperVoice.load(
            model_path=model_path,
            config_path=config_path,
            use_cuda=False,
            download_dir=VOICES_DIR,
        )
        _voice_cache[resolved_id] = loaded
        return loaded


def iter_tts_stream_events(
    voice,
    text: str,
    *,
    voice_id: str | None = None,
) -> Iterator[str]:
    """NDJSON lines: meta (sample rate) → pcm chunks → done. Plays before full WAV exists."""
    cleaned = (text or "").strip()
    if not cleaned:
        yield json.dumps({"type": "error", "message": "Empty text"}) + "\n"
        return
    if voice_id:
        cached = _tts_wav_cache.get((voice_id, cleaned))
        if cached is not None:
            _tts_wav_cache.move_to_end((voice_id, cleaned))
            yield from _wav_bytes_to_stream_events(cached)
            return
    meta_sent = False
    with piper_synthesis_session():
        for chunk in voice.synthesize(cleaned):
            if not meta_sent:
                yield (
                    json.dumps(
                        {
                            "type": "meta",
                            "sampleRate": chunk.sample_rate,
                            "channels": chunk.sample_channels or 1,
                        }
                    )
                    + "\n"
                )
                meta_sent = True
            yield (
                json.dumps(
                    {
                        "type": "pcm",
                        "data": base64.b64encode(chunk.audio_int16_bytes).decode(
                            "ascii"
                        ),
                    }
                )
                + "\n"
            )
    if not meta_sent:
        yield json.dumps({"type": "error", "message": "No audio produced"}) + "\n"
        return
    yield json.dumps({"type": "done"}) + "\n"


def _wav_bytes_to_stream_events(wav_bytes: bytes) -> Iterator[str]:
    """Replay cached WAV as the same NDJSON stream shape."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wav_handle:
        sample_rate = wav_handle.getframerate()
        channels = wav_handle.getnchannels()
        sample_width = wav_handle.getsampwidth()
        if sample_width != 2:
            yield (
                json.dumps({"type": "error", "message": "Unsupported WAV format"})
                + "\n"
            )
            return
        yield (
            json.dumps(
                {"type": "meta", "sampleRate": sample_rate, "channels": channels}
            )
            + "\n"
        )
        frames_per_chunk = max(256, sample_rate // 4)
        while True:
            pcm = wav_handle.readframes(frames_per_chunk)
            if not pcm:
                break
            yield (
                json.dumps(
                    {"type": "pcm", "data": base64.b64encode(pcm).decode("ascii")}
                )
                + "\n"
            )
    yield json.dumps({"type": "done"}) + "\n"


def synthesize_text_to_wav(
    voice,
    text: str,
    *,
    voice_id: str | None = None,
) -> bytes | None:
    """Synthesize text to WAV bytes. Returns None when Piper yields no audio (e.g. '.')."""
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    cache_key: tuple[str, str] | None = None
    if voice_id:
        cache_key = (voice_id, cleaned)
        cached = _tts_wav_cache.get(cache_key)
        if cached is not None:
            _tts_wav_cache.move_to_end(cache_key)
            return cached
    buffer = io.BytesIO()
    try:
        with piper_synthesis_session(), wave.open(buffer, "wb") as wav_handle:
            voice.synthesize_wav(cleaned, wav_handle)
    except wave.Error:
        return None
    data = buffer.getvalue()
    if len(data) < 44:
        return None
    if cache_key is not None:
        _tts_wav_cache[cache_key] = data
        _tts_wav_cache.move_to_end(cache_key)
        while len(_tts_wav_cache) > _TTS_WAV_CACHE_MAX:
            _tts_wav_cache.popitem(last=False)
    return data
