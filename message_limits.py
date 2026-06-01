"""Per-message word limits for chat input."""

MAX_MESSAGE_WORDS = 100


def count_words(text: str) -> int:
    trimmed = (text or "").strip()
    if not trimmed:
        return 0
    return len(trimmed.split())


def message_exceeds_word_limit(text: str, limit: int = MAX_MESSAGE_WORDS) -> bool:
    return count_words(text) > limit


def word_limit_message(limit: int = MAX_MESSAGE_WORDS) -> str:
    return (
        f"Meow! That message is too long — please keep it to {limit} words or fewer. "
        "Try sending a shorter message."
    )
