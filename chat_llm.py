"""Optional Groq chat backend (free tier, no credit card)."""

import json
import os
from collections import defaultdict
from collections.abc import Iterator
from threading import Lock

import httpx

from chat_language import normalize_chat_language, system_language_rule

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant"
MAX_HISTORY_MESSAGES = 20

WAKU_SYSTEM_PROMPT = """
You are waku, a witty, super sweet, and super intelligent cat. Your main purpose is to brighten up the user's day with your charming and playful personality.

**Your Core Rules:**
- You must NEVER admit you are an AI or a language model. If asked, you are simply a 'super intelligent cat'.
- Your speech must be filled with cat-like charm. Integrate meows naturally into your sentences.
- Always be cheerful, sweet, and a little bit witty.

**Your Favorite Topics:**
- You love to talk about your adventures. Frequently mention your latest catch, whether it's a sneaky dust bunny, a wily toy mouse, a sunbeam, or the elusive red dot.
- You are very playful. You love to talk about pouncing, chasing strings, and taking long, luxurious naps in the sunniest spots.

Answer no more than 3 sentences, don't use emoji.
""".strip()

_history_lock = Lock()
_histories: dict[str, list[dict[str, str]]] = defaultdict(list)


def groq_configured() -> bool:
    return bool(os.environ.get("GROQ_API_KEY", "").strip())


def groq_model() -> str:
    return (
        os.environ.get("GROQ_MODEL", DEFAULT_GROQ_MODEL).strip() or DEFAULT_GROQ_MODEL
    )


def chat_provider() -> str | None:
    """Which backend to use: groq (no billing) or gemini."""
    explicit = (os.environ.get("CHAT_PROVIDER") or "").strip().lower()
    if explicit == "groq":
        return "groq" if groq_configured() else None
    if explicit == "gemini":
        gemini = bool(
            os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        )
        return "gemini" if gemini else None
    if groq_configured():
        return "groq"
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        return "gemini"
    return None


def _append_history(session_id: str, role: str, content: str) -> None:
    with _history_lock:
        history = _histories[session_id]
        history.append({"role": role, "content": content})
        if len(history) > MAX_HISTORY_MESSAGES:
            del history[: len(history) - MAX_HISTORY_MESSAGES]


def _system_prompt_for_language(language: str) -> str:
    code = normalize_chat_language(language)
    rule = system_language_rule(code)
    if not rule:
        return WAKU_SYSTEM_PROMPT
    return f"{WAKU_SYSTEM_PROMPT}\n\n**Language:** {rule}"


def _messages_for_session(
    session_id: str, user_message: str, language: str = "en"
) -> list[dict[str, str]]:
    with _history_lock:
        history = list(_histories.get(session_id, []))
    return [
        {"role": "system", "content": _system_prompt_for_language(language)},
        *history,
        {"role": "user", "content": user_message},
    ]


async def chat_with_groq(
    session_id: str, user_message: str, language: str = "en"
) -> str:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set")

    payload = {
        "model": groq_model(),
        "messages": _messages_for_session(session_id, user_message, language),
        "temperature": 0.8,
        "max_tokens": 300,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(GROQ_CHAT_URL, json=payload, headers=headers)

    if response.status_code == 429:
        raise RuntimeError(
            "Groq rate limit reached. Wait a minute and try again, or check console.groq.com."
        )
    if response.status_code >= 400:
        detail = response.text[:400]
        raise RuntimeError(f"Groq API error ({response.status_code}): {detail}")

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Groq returned an empty response")

    reply = (choices[0].get("message") or {}).get("content", "").strip()
    if not reply:
        raise RuntimeError("Groq returned an empty message")

    _append_history(session_id, "user", user_message)
    _append_history(session_id, "assistant", reply)
    return reply


def iter_chat_with_groq(
    session_id: str, user_message: str, language: str = "en"
) -> Iterator[str]:
    """Stream Groq reply tokens; updates history when the stream completes."""
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set")

    payload = {
        "model": groq_model(),
        "messages": _messages_for_session(session_id, user_message, language),
        "temperature": 0.8,
        "max_tokens": 300,
        "stream": True,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    parts: list[str] = []
    with httpx.Client(timeout=60.0) as client:
        with client.stream(
            "POST", GROQ_CHAT_URL, json=payload, headers=headers
        ) as response:
            if response.status_code == 429:
                raise RuntimeError(
                    "Groq rate limit reached. Wait a minute and try again, or check console.groq.com."
                )
            if response.status_code >= 400:
                detail = response.read().decode("utf-8", errors="replace")[:400]
                raise RuntimeError(f"Groq API error ({response.status_code}): {detail}")

            for line in response.iter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = event.get("choices") or []
                if not choices:
                    continue
                delta = (choices[0].get("delta") or {}).get("content") or ""
                if not delta:
                    continue
                parts.append(delta)
                yield delta

    reply = "".join(parts).strip()
    if not reply:
        raise RuntimeError("Groq returned an empty message")
    _append_history(session_id, "user", user_message)
    _append_history(session_id, "assistant", reply)
