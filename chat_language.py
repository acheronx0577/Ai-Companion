"""Map voice BCP-47 tags to chat reply languages."""

from __future__ import annotations

SUPPORTED_CHAT_LANGUAGES = frozenset(
    {
        "en",
        "ja",
        "fr",
        "de",
        "it",
        "pt",
        "zh",
        "vi",
        "nl",
        "pl",
        "ru",
        "hi",
        "ar",
    }
)

LANGUAGE_DISPLAY_NAMES: dict[str, str] = {
    "en": "English",
    "ja": "Japanese",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "zh": "Chinese",
    "vi": "Vietnamese",
    "nl": "Dutch",
    "pl": "Polish",
    "ru": "Russian",
    "hi": "Hindi",
    "ar": "Arabic",
}

_USER_PREFIXES: dict[str, str] = {
    "ja": (
        "【重要】次の返答は日本語のみで書いてください。"
        "音声読み上げ向けに、短く自然な日本語で答えてください。"
        "英語は使わないでください。\n\n"
    ),
    "fr": (
        "[Important] Réponds uniquement en français. Phrases courtes et naturelles "
        "pour la synthèse vocale. Pas d'anglais.\n\n"
    ),
    "de": (
        "[Wichtig] Antworte nur auf Deutsch. Kurze, natürliche Sätze für Sprachausgabe. "
        "Kein Englisch.\n\n"
    ),
    "it": (
        "[Importante] Rispondi solo in italiano. Frasi brevi e naturali per la voce. "
        "Niente inglese.\n\n"
    ),
    "pt": (
        "[Importante] Responda apenas em português. Frases curtas e naturais para voz. "
        "Sem inglês.\n\n"
    ),
    "zh": ("【重要】请只用中文回复。句子要简短自然，适合语音朗读。不要使用英文。\n\n"),
    "vi": (
        "[Quan trọng] Chỉ trả lời bằng tiếng Việt. Câu ngắn, tự nhiên, phù hợp đọc aloud. "
        "Không dùng tiếng Anh.\n\n"
    ),
    "nl": (
        "[Belangrijk] Antwoord alleen in het Nederlands. Korte, natuurlijke zinnen. "
        "Geen Engels.\n\n"
    ),
    "pl": (
        "[Ważne] Odpowiadaj tylko po polsku. Krótko i naturalnie pod nagłos. Bez angielskiego.\n\n"
    ),
    "ru": (
        "[Важно] Отвечай только по-русски. Коротко и естественно для озвучки. Без английского.\n\n"
    ),
    "hi": ("[महत्वपूर्ण] केवल हिंदी में जवाब दें। छोटे, प्राकृतिक वाक्य। अंग्रेज़ी नहीं।\n\n"),
    "ar": (
        "[مهم] أجب بالعربية فقط. جمل قصيرة وطبيعية للنطق. لا تستخدم الإنجليزية.\n\n"
    ),
}

_SYSTEM_LANGUAGE_RULES: dict[str, str] = {
    "ja": "Reply only in Japanese. Keep answers short (max 3 sentences), cat-like tone, natural meows.",
    "fr": "Reply only in French. Max 3 sentences, playful cat personality.",
    "de": "Reply only in German. Max 3 sentences, playful cat personality.",
    "it": "Reply only in Italian. Max 3 sentences, playful cat personality.",
    "pt": "Reply only in Portuguese. Max 3 sentences, playful cat personality.",
    "zh": "Reply only in Chinese. Max 3 sentences, playful cat personality.",
    "vi": "Reply only in Vietnamese. Max 3 sentences, playful cat personality.",
    "nl": "Reply only in Dutch. Max 3 sentences, playful cat personality.",
    "pl": "Reply only in Polish. Max 3 sentences, playful cat personality.",
    "ru": "Reply only in Russian. Max 3 sentences, playful cat personality.",
    "hi": "Reply only in Hindi. Max 3 sentences, playful cat personality.",
    "ar": "Reply only in Arabic. Max 3 sentences, playful cat personality.",
}


def normalize_chat_language(language: str) -> str:
    """Normalize voice tag or short code to a supported chat language."""
    raw = (language or "en").strip().lower().replace("_", "-")
    if not raw:
        return "en"
    primary = raw.split("-")[0]
    if primary in SUPPORTED_CHAT_LANGUAGES:
        return primary
    return "en"


def language_display_name(language: str) -> str:
    code = normalize_chat_language(language)
    return LANGUAGE_DISPLAY_NAMES.get(code, code.upper())


def message_for_response_language(message: str, language: str) -> str:
    """Prefix the user message so the model replies in the selected language."""
    code = normalize_chat_language(language)
    prefix = _USER_PREFIXES.get(code)
    if prefix:
        return f"{prefix}{message}"
    return message


def system_language_rule(language: str) -> str | None:
    """Extra system instruction for Groq (and similar) per chat language."""
    code = normalize_chat_language(language)
    return _SYSTEM_LANGUAGE_RULES.get(code)
