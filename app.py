"""WakuWaku AI Companion — Flask web app."""

import hashlib
import io
import json
import os
import re
from collections import OrderedDict
from pathlib import Path
from threading import Lock
from urllib.parse import quote

from dotenv import load_dotenv
from flask import (
    abort,
    Flask,
    Response,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    stream_with_context,
    url_for,
)

from wakuwaku.auth import (
    auth_bp,
    ensure_authenticated_session,
    get_current_user,
    init_auth,
    user_is_authenticated,
)
from wakuwaku.chat_llm import chat_provider, chat_with_groq, iter_chat_with_groq
from wakuwaku import convex_usage
from wakuwaku.chat_language import message_for_response_language
from wakuwaku.message_limits import (
    MAX_MESSAGE_WORDS,
    message_exceeds_word_limit,
    word_limit_message,
)
from wakuwaku.usage_limit import (
    DAILY_MESSAGE_LIMIT,
    increment_usage_for_current_request,
    usage_status_for_current_request,
)
from wakuwaku.request_security import check_rate_limit, same_origin_request_allowed

from wakuwaku import app_config
from wakuwaku.site_views import get_site_view_count, record_site_view
from wakuwaku.system_stats import system_stats_payload
from wakuwaku.piper_voices import (
    DEVICE_LANGS_ALWAYS,
    default_piper_voice_id,
    get_piper_voice,
    iter_tts_stream_events,
    iter_warmup_piper_voice,
    list_available_piper_voices,
    list_browser_voice_menu,
    list_piper_voice_menu,
    max_loaded_piper_voices,
    piper_disabled,
    piper_model_loaded,
    piper_synthesis_busy,
    synthesize_text_to_wav,
    voice_files_present,
    resolve_piper_voice_id,
    warmup_piper_voice,
)

# Piper models live in voices/ next to this file — keep cwd stable for Convex/npm dev.
_APP_ROOT = Path(__file__).resolve().parent
os.chdir(_APP_ROOT)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

MAX_CHAT_MESSAGE_CHARS = 4_000
MAX_CHAT_SESSION_ID_CHARS = 128
MAX_TTS_CHARS = 2_000
MAX_VOICE_ID_CHARS = 128
CHAT_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def is_production_hosting() -> bool:
    return bool(
        os.environ.get("PRODUCTION")
        or os.environ.get("RENDER")  # Render sets RENDER=true
        or os.environ.get("RENDER_EXTERNAL_URL")
    )


def configure_deployment(flask_app: Flask) -> None:
    """HTTPS behind reverse proxy; secure session cookies in production."""
    if not is_production_hosting():
        return
    from werkzeug.middleware.proxy_fix import ProxyFix

    flask_app.wsgi_app = ProxyFix(
        flask_app.wsgi_app,
        x_for=1,
        x_proto=1,
        x_host=1,
    )
    flask_app.config["SESSION_COOKIE_SECURE"] = True
    flask_app.config["SESSION_COOKIE_SAMESITE"] = "Lax"


configure_deployment(app)
init_auth(app)
app.register_blueprint(auth_bp)


@app.after_request
def production_cache_headers(response):
    """Set deployment cache policy and browser hardening headers."""
    if not is_production_hosting():
        return response
    path = request.path or ""
    if path in ("/", "/convex-auth-test") or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    elif path.startswith("/static/") and request.args.get("v"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; base-uri 'self'; object-src 'none'; "
        "frame-ancestors 'none'; script-src 'self'; "
        "style-src 'self' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https:; media-src 'self' blob:; "
        "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud "
        "https://*.convex.site; worker-src 'self' blob:; "
        "form-action 'self' https://*.convex.site; upgrade-insecure-requests"
    )
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


API_JSON_PREFIXES = ("/chat", "/tts", "/voices/", "/usage/", "/auth/", "/system/")


def is_api_json_request():
    path = request.path or ""
    return any(
        path == prefix or path.startswith(prefix) for prefix in API_JSON_PREFIXES
    )


@app.errorhandler(404)
def api_not_found(_error):
    if is_api_json_request():
        return jsonify(
            {"error": "API route not found. Restart the Flask server.", "response": ""}
        ), 404
    return _error


@app.errorhandler(405)
def api_method_not_allowed(_error):
    if is_api_json_request():
        return jsonify(
            {"error": "Method not allowed for this API route.", "response": ""}
        ), 405
    return _error


@app.errorhandler(413)
def api_request_too_large(_error):
    if is_api_json_request():
        return jsonify({"error": "Request body is too large.", "response": ""}), 413
    return _error


@app.errorhandler(500)
def api_server_error(_error):
    if is_api_json_request():
        return jsonify(
            {
                "error": "Server error. Check the terminal running app.py for details.",
                "response": "",
            }
        ), 500
    return _error


def load_gemini_api_key():
    load_dotenv()
    for key_path in (
        Path("gemini_key.txt"),
        Path("../gemini_key.txt"),
        Path("../../gemini_key.txt"),
    ):
        if not key_path.exists():
            continue
        key = key_path.read_text(encoding="utf-8").strip()
        if not key:
            continue
        os.environ.setdefault("GEMINI_API_KEY", key)
        os.environ.setdefault("GOOGLE_API_KEY", key)
        return


load_gemini_api_key()


def gemini_api_key_configured():
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


def chat_backend_configured():
    return chat_provider() is not None


gemini_client = None
gemini_history_lock = Lock()
gemini_histories: OrderedDict[str, list] = OrderedDict()
MAX_GEMINI_HISTORY_MESSAGES = 20
MAX_GEMINI_HISTORY_SESSIONS = 256
character_exists = (_APP_ROOT / "wakuwaku" / "character.py").is_file()
DEFAULT_PIPER_VOICE_ID = "en_US-hfc_female-medium"


def get_gemini_client():
    """Lazy-load the direct Gemini client only when Gemini is active."""
    global gemini_client  # noqa: PLW0603
    if gemini_client is not None:
        return gemini_client
    if not character_exists or chat_provider() != "gemini":
        return None
    try:
        from google import genai
    except ImportError:
        app.logger.exception("Gemini dependency not installed (use requirements.txt)")
        return None
    gemini_client = genai.Client(
        api_key=os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    )
    return gemini_client


def convex_frontend_enabled() -> bool:
    load_dotenv(".env.local")
    convex_url = os.environ.get("CONVEX_URL", "").strip()
    if not convex_url:
        return False
    flag = os.environ.get("USE_CONVEX_FRONTEND", "1").lower()
    return flag not in ("0", "false", "no")


@app.route("/")
def index():
    load_dotenv(".env.local")
    convex_url = os.environ.get("CONVEX_URL", "").strip()
    view_rate = check_rate_limit(
        "site-view", max_requests=120, window_seconds=3600, include_user=False
    )
    if view_rate.allowed:
        site_view_count = record_site_view()
    else:
        site_view_count = get_site_view_count()
    return render_template(
        "index.html",
        convex_url=convex_url,
        convex_enabled=convex_frontend_enabled(),
        authenticated=user_is_authenticated(),
        asset_version=app_config.ASSET_VERSION,
        github_repo_url=app_config.GITHUB_REPO_URL,
        site_view_count=site_view_count,
    )


@app.route("/convex-auth-test")
def convex_auth_test():
    """Debug page for Convex Auth and usage (optional; main app is /)."""
    if is_production_hosting() and os.environ.get(
        "ENABLE_DEBUG_ROUTES", ""
    ).lower() not in ("1", "true", "yes"):
        abort(404)
    load_dotenv(".env.local")
    convex_site_url = os.environ.get("CONVEX_SITE_URL", "").strip().rstrip("/")
    convex_url = os.environ.get("CONVEX_URL", "").strip()
    redirect_to = f"{request.url_root.rstrip('/')}/convex-auth-test"
    sign_in_url = ""
    if convex_site_url:
        sign_in_url = (
            f"{convex_site_url}/api/auth/signin/google"
            f"?redirectTo={quote(redirect_to, safe='')}"
        )
    return render_template(
        "convex_auth_test.html",
        convex_site_url=convex_site_url,
        convex_url=convex_url,
        sign_in_url=sign_in_url,
        asset_version=app_config.ASSET_VERSION,
    )


@app.route("/favicon.ico")
def favicon():
    return redirect(url_for("static", filename="images/favicon.png"))


@app.route("/health")
def health():
    """Lightweight health check for hosting (no auth, no AI call)."""
    load_dotenv(".env.local")
    piper_files = voice_files_present(DEFAULT_PIPER_VOICE_ID)
    convex_url = os.environ.get("CONVEX_URL", "").strip()
    convex_site = os.environ.get("CONVEX_SITE_URL", "").strip().rstrip("/")
    render_url = (os.environ.get("RENDER_EXTERNAL_URL") or "").strip().rstrip("/")
    return jsonify(
        {
            "status": "ok",
            "chatConfigured": chat_backend_configured(),
            "googleOAuthConfigured": bool(
                os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
                and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
            ),
            "convex": {
                "urlConfigured": bool(convex_url),
                "siteUrlConfigured": bool(convex_site),
                "frontendEnabled": convex_frontend_enabled(),
                "usageViaConvex": convex_usage.use_convex_usage(),
                "expectedGoogleCallback": (
                    f"{convex_site}/api/auth/callback/google" if convex_site else None
                ),
            },
            "flaskGoogleCallback": (
                f"{render_url}/auth/google/callback" if render_url else None
            ),
            "piper": {
                "disabled": piper_disabled(),
                "modelPresent": piper_files,
                "modelLoaded": piper_model_loaded(),
                "voiceCount": len(list_available_piper_voices()),
            },
        }
    )


def trial_limit_message() -> str:
    return (
        f"Meow... you've used all {DAILY_MESSAGE_LIMIT} trial messages for today! "
        "Your chat limit resets tomorrow — please come back then and try again. "
        "See you soon!"
    )


@app.route("/usage/status")
def usage_status():
    return jsonify(usage_status_for_current_request())


@app.route("/system/stats")
def system_stats():
    """Process CPU/RAM for the sidebar metrics panel (polled by the client)."""
    rate = check_rate_limit(
        "system-stats", max_requests=60, window_seconds=60, include_user=False
    )
    if not rate.allowed:
        return _rate_limit_error(rate.retry_after_seconds)
    response = jsonify(
        system_stats_payload(
            piper_model_loaded=piper_model_loaded(),
            piper_synthesis_busy=piper_synthesis_busy(),
        )
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/voices/status")
def voices_status():
    try:
        piper_menu = list_piper_voice_menu()
        piper_ready = list_available_piper_voices()
    except Exception:
        app.logger.exception("Piper status check failed")
        piper_menu = []
        piper_ready = []
    response = jsonify(
        {
            "piperAvailable": len(piper_ready) > 0,
            "piperModelLoaded": piper_model_loaded(),
            "piperSynthesisBusy": piper_synthesis_busy(),
            "piperVoices": piper_menu,
            "browserVoiceMenu": list_browser_voice_menu(),
            "piperLabel": piper_ready[0].label if piper_ready else None,
            "deviceLangsAlways": sorted(DEVICE_LANGS_ALWAYS),
            "lazyLoad": True,
            "maxLoadedVoices": max_loaded_piper_voices(),
            "voiceCatalogVersion": app_config.ASSET_VERSION,
        }
    )
    if is_production_hosting():
        response.headers["Cache-Control"] = "private, max-age=60"
    else:
        response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/voices/warmup", methods=["POST"])
def voices_warmup():
    """Load Piper ONNX and synthesize a short phrase; stream NDJSON progress for the UI."""
    guard_error = _protect_api_request("tts", max_requests=20, window_seconds=60)
    if guard_error is not None:
        return guard_error
    if piper_disabled():
        return jsonify({"ok": False, "error": "Piper disabled"}), 503
    payload = request.get_json(silent=True) or {}
    voice_id = _payload_string(payload, "voice") or None
    if voice_id and len(voice_id) > MAX_VOICE_ID_CHARS:
        return jsonify({"error": "Voice identifier is too long."}), 400
    accept = request.headers.get("Accept", "")
    if "application/x-ndjson" in accept:

        def generate():
            for event in iter_warmup_piper_voice(voice_id):
                yield json.dumps(event) + "\n"

        return Response(
            stream_with_context(generate()),
            mimetype="application/x-ndjson",
            headers={"Cache-Control": "no-store"},
        )
    if not warmup_piper_voice(voice_id):
        return jsonify({"ok": False, "error": "Piper voice unavailable"}), 503
    return jsonify({"ok": True, "voiceId": resolve_piper_voice_id(voice_id)})


def _payload_string(payload: dict, key: str, default: str = "") -> str:
    if not isinstance(payload, dict):
        return default
    value = payload.get(key, default)
    return value.strip() if isinstance(value, str) else default


def _rate_limit_error(retry_after_seconds: int):
    response = jsonify({"error": "Too many requests. Try again shortly."})
    response.headers["Retry-After"] = str(retry_after_seconds)
    return response, 429


def _protect_api_request(
    scope: str,
    *,
    max_requests: int,
    window_seconds: int,
    require_same_origin: bool = True,
):
    if require_same_origin and not same_origin_request_allowed():
        return jsonify({"error": "Cross-origin request rejected"}), 403
    rate = check_rate_limit(
        scope, max_requests=max_requests, window_seconds=window_seconds
    )
    if not rate.allowed:
        return _rate_limit_error(rate.retry_after_seconds)
    if not ensure_authenticated_session():
        return jsonify(
            {
                "error": "Authentication required.",
                "response": (
                    "Meow! Please sign in with Google from the sidebar profile section "
                    "before we can continue."
                ),
                "authRequired": True,
            }
        ), 401
    return None


def _parse_chat_payload(payload: dict) -> tuple[str, str, str]:
    user_message = _payload_string(payload, "message")
    session_id = _payload_string(payload, "session_id", "default_session")
    language = _payload_string(payload, "language", "en")
    return user_message, session_id, language


def _limit_reached_response(usage: dict):
    return jsonify(
        {
            "error": "Daily trial limit reached for this connection.",
            "response": trial_limit_message(),
            "usage": usage,
            "limitReached": True,
        }
    ), 429


def _resolve_chat_usage() -> tuple[dict, bool, tuple | None]:
    """Return (usage, usage_from_convex, error_response). error_response is None when allowed."""
    usage_from_convex = False
    usage = usage_status_for_current_request()
    error_response = None

    if convex_usage.use_convex_usage():
        token = convex_usage.bearer_token_from_request(request)
        if not token:
            error_response = (
                jsonify(
                    {
                        "error": "Convex session required.",
                        "response": (
                            "Meow! Please sign in again with Google so your chat limit "
                            "can sync with Convex."
                        ),
                        "authRequired": True,
                    }
                ),
                401,
            )
        else:
            try:
                usage = convex_usage.increment_usage_via_convex(token)
                usage_from_convex = True
                if not usage.get("canSend", False):
                    error_response = _limit_reached_response(usage)
            except ValueError as exc:
                message = str(exc)
                if "authentication" in message.lower():
                    error_response = (
                        jsonify(
                            {
                                "error": message,
                                "response": (
                                    "Meow! Your sign-in expired — please sign out and "
                                    "sign in with Google again."
                                ),
                                "authRequired": True,
                            }
                        ),
                        401,
                    )
                else:
                    error_response = (
                        jsonify(
                            {
                                "error": message,
                                "response": (
                                    "Meow! I could not verify your message limit. Try again."
                                ),
                            }
                        ),
                        503,
                    )
    elif not usage["allowed"]:
        error_response = _limit_reached_response(usage)

    return usage, usage_from_convex, error_response


def _chat_request_precheck(user_message: str, session_id: str):
    guard_error = _protect_api_request("chat", max_requests=12, window_seconds=60)
    if guard_error is not None:
        return guard_error
    if not user_message:
        return jsonify({"error": "Message is required", "response": ""}), 400
    if len(user_message) > MAX_CHAT_MESSAGE_CHARS:
        return jsonify(
            {
                "error": "Message exceeds character limit.",
                "response": word_limit_message(),
                "messageTooLong": True,
                "maxChars": MAX_CHAT_MESSAGE_CHARS,
            }
        ), 400
    if len(session_id) > MAX_CHAT_SESSION_ID_CHARS or not CHAT_SESSION_ID_RE.fullmatch(
        session_id
    ):
        return jsonify(
            {"error": "Invalid chat session identifier.", "response": ""}
        ), 400
    if message_exceeds_word_limit(user_message):
        return jsonify(
            {
                "error": f"Message exceeds {MAX_MESSAGE_WORDS} word limit.",
                "response": word_limit_message(),
                "messageTooLong": True,
                "maxWords": MAX_MESSAGE_WORDS,
            }
        ), 400
    return None


def _chat_user_namespace() -> str:
    user = get_current_user()
    if not user:
        raise RuntimeError("Authenticated session is missing a user identifier")
    return hashlib.sha256(str(user["id"]).encode("utf-8")).hexdigest()[:32]


def _provider_session_id(user_namespace: str, session_id: str) -> str:
    return f"{user_namespace}:{session_id}"


async def _gemini_chat_response(
    user_namespace: str, session_id: str, model_message: str, usage: dict
):
    client = get_gemini_client()
    if client is None:
        return jsonify(
            {
                "error": "Gemini backend is not ready. Restart the server after setting GEMINI_API_KEY.",
                "response": "",
                "usage": usage,
            }
        ), 503

    from wakuwaku import character
    from google.genai import types

    provider_session_id = _provider_session_id(user_namespace, session_id)
    with gemini_history_lock:
        history = list(gemini_histories.get(provider_session_id, []))
    user_content = types.UserContent(parts=[types.Part(text=model_message)])
    response = await client.aio.models.generate_content(
        model=character.GEMINI_MODEL,
        contents=[*history, user_content],
        config=character.gemini_generate_config(),
    )
    response_text = (response.text or "").strip()
    if not response_text:
        raise RuntimeError("Gemini returned an empty response")
    model_content = types.ModelContent(parts=[types.Part(text=response_text)])
    with gemini_history_lock:
        updated_history = gemini_histories.setdefault(provider_session_id, [])
        updated_history.extend((user_content, model_content))
        if len(updated_history) > MAX_GEMINI_HISTORY_MESSAGES:
            del updated_history[: len(updated_history) - MAX_GEMINI_HISTORY_MESSAGES]
        gemini_histories.move_to_end(provider_session_id)
        while len(gemini_histories) > MAX_GEMINI_HISTORY_SESSIONS:
            gemini_histories.popitem(last=False)
    return jsonify({"response": response_text, "usage": usage})


async def _run_chat_provider(
    user_namespace: str,
    session_id: str,
    model_message: str,
    language: str,
    usage: dict,
):
    provider = chat_provider()
    try:
        if provider == "groq":
            response_text = await chat_with_groq(
                _provider_session_id(user_namespace, session_id),
                model_message,
                language,
            )
            return jsonify({"response": response_text, "usage": usage})
        return await _gemini_chat_response(
            user_namespace, session_id, model_message, usage
        )
    except Exception as exc:
        app.logger.exception("Chat request failed")
        message = str(exc or "")
        if provider == "groq":
            # Treat missing/invalid Groq configuration as a 503 (deploy config issue),
            # not a generic 500. This avoids confusing users on production.
            lowered = message.lower()
            if (
                "groq_api_key is not set" in lowered
                or "unauthorized" in lowered
                or "invalid api key" in lowered
            ):
                return jsonify(
                    {
                        "error": message
                        or "Groq is not configured. Set GROQ_API_KEY in your environment.",
                        "response": (
                            "Meow! Chat isn’t configured on the server yet. "
                            "Set GROQ_API_KEY (or GEMINI_API_KEY) and try again."
                        ),
                        "usage": usage,
                    }
                ), 503

            hint = (
                message
                or "Check GROQ_API_KEY at console.groq.com (free tier, no card)."
            )
        else:
            hint = (
                "The AI could not respond. Check GEMINI_API_KEY, billing, and quota "
                "in Google AI Studio, or switch to GROQ_API_KEY (free)."
            )
        return jsonify(
            {
                "error": hint,
                "response": "",
                "usage": usage,
            }
        ), 500


@app.route("/chat", methods=["POST"])
async def chat():
    payload = request.get_json(silent=True) or {}
    user_message, session_id, language = _parse_chat_payload(payload)

    precheck_error = _chat_request_precheck(user_message, session_id)
    if precheck_error is not None:
        return precheck_error

    usage, usage_from_convex, usage_error = _resolve_chat_usage()
    if usage_error is not None:
        return usage_error

    if not character_exists:
        if not usage_from_convex:
            usage = increment_usage_for_current_request()
        return jsonify({"response": user_message, "usage": usage})

    if not chat_backend_configured():
        return jsonify(
            {
                "error": (
                    "No chat API configured. Set GROQ_API_KEY (free, no credit card) or "
                    "GEMINI_API_KEY in .env — see README."
                ),
                "response": "",
                "usage": usage,
            }
        ), 503

    if not usage_from_convex:
        usage = increment_usage_for_current_request()
    model_message = message_for_response_language(user_message, language)
    return await _run_chat_provider(
        _chat_user_namespace(), session_id, model_message, language, usage
    )


@app.route("/chat/stream", methods=["POST"])
async def chat_stream():
    """Stream Groq tokens as NDJSON; falls back to one-shot JSON when not using Groq."""
    payload = request.get_json(silent=True) or {}
    user_message, session_id, language = _parse_chat_payload(payload)

    precheck_error = _chat_request_precheck(user_message, session_id)
    if precheck_error is not None:
        return precheck_error

    usage, usage_from_convex, usage_error = _resolve_chat_usage()
    if usage_error is not None:
        return usage_error

    if not character_exists:
        if not usage_from_convex:
            usage = increment_usage_for_current_request()
        return jsonify({"response": user_message, "usage": usage})

    if not chat_backend_configured():
        return jsonify(
            {
                "error": (
                    "No chat API configured. Set GROQ_API_KEY (free, no credit card) or "
                    "GEMINI_API_KEY in .env — see README."
                ),
                "response": "",
                "usage": usage,
            }
        ), 503

    if not usage_from_convex:
        usage = increment_usage_for_current_request()
    model_message = message_for_response_language(user_message, language)

    if chat_provider() != "groq":
        provider_result = await _run_chat_provider(
            _chat_user_namespace(), session_id, model_message, language, usage
        )
        if isinstance(provider_result, tuple):
            body, status = provider_result
            data = body.get_json()
        else:
            body = provider_result
            data = body.get_json()
            status = 200

        def fallback_once():
            yield (
                json.dumps(
                    {
                        "delta": data.get("response") or "",
                        "done": True,
                        "usage": data.get("usage") or usage,
                        "error": data.get("error"),
                        "httpStatus": status,
                    }
                )
                + "\n"
            )

        return Response(
            stream_with_context(fallback_once()),
            mimetype="application/x-ndjson",
            headers={"Cache-Control": "no-store"},
        )

    def generate():
        try:
            provider_session_id = _provider_session_id(
                _chat_user_namespace(), session_id
            )
            for delta in iter_chat_with_groq(
                provider_session_id, model_message, language
            ):
                yield json.dumps({"delta": delta}) + "\n"
            yield json.dumps({"done": True, "usage": usage}) + "\n"
        except Exception as exc:
            app.logger.exception("Chat stream failed")
            yield json.dumps({"error": str(exc), "done": True}) + "\n"

    return Response(
        stream_with_context(generate()),
        mimetype="application/x-ndjson",
        headers={"Cache-Control": "no-store"},
    )


@app.route("/tts", methods=["POST"])
def tts():
    guard_error = _protect_api_request("tts", max_requests=20, window_seconds=60)
    if guard_error is not None:
        return guard_error
    payload = request.get_json(silent=True) or {}
    text = _payload_string(payload, "text")
    voice_id = _payload_string(payload, "voice") or default_piper_voice_id()
    if not text:
        return jsonify({"error": "Missing text"}), 400
    if len(text) > MAX_TTS_CHARS:
        return jsonify({"error": "Text exceeds TTS character limit."}), 400
    if voice_id and len(voice_id) > MAX_VOICE_ID_CHARS:
        return jsonify({"error": "Voice identifier is too long."}), 400

    voice = get_piper_voice(voice_id)
    if voice is None:
        return jsonify({"error": "Piper voice unavailable"}), 503

    try:
        wav_bytes = synthesize_text_to_wav(voice, text, voice_id=voice_id)
    except Exception:
        app.logger.exception("Piper synthesis failed for voice %s", voice_id)
        return jsonify({"error": "Piper synthesis failed"}), 503

    if not wav_bytes:
        return jsonify({"error": "Piper produced no audio for this text"}), 400

    return send_file(
        io.BytesIO(wav_bytes),
        mimetype="audio/wav",
        as_attachment=False,
        download_name="tts.wav",
    )


@app.route("/tts/stream", methods=["POST"])
def tts_stream():
    """Stream Piper PCM as NDJSON so playback can start before synthesis finishes."""
    guard_error = _protect_api_request("tts", max_requests=20, window_seconds=60)
    if guard_error is not None:
        return guard_error
    payload = request.get_json(silent=True) or {}
    text = _payload_string(payload, "text")
    voice_id = _payload_string(payload, "voice") or default_piper_voice_id()
    if not text:
        return jsonify({"error": "Missing text"}), 400
    if len(text) > MAX_TTS_CHARS:
        return jsonify({"error": "Text exceeds TTS character limit."}), 400
    if voice_id and len(voice_id) > MAX_VOICE_ID_CHARS:
        return jsonify({"error": "Voice identifier is too long."}), 400

    voice = get_piper_voice(voice_id)
    if voice is None:
        return jsonify({"error": "Piper voice unavailable"}), 503

    def generate():
        try:
            for line in iter_tts_stream_events(voice, text, voice_id=voice_id):
                yield line
        except Exception:
            app.logger.exception("Piper stream synthesis failed for voice %s", voice_id)
            yield (
                json.dumps({"type": "error", "message": "Piper synthesis failed"})
                + "\n"
            )

    return Response(
        stream_with_context(generate()),
        mimetype="application/x-ndjson",
        headers={"Cache-Control": "no-store"},
    )


def log_deploy_hints() -> None:
    base = (os.environ.get("RENDER_EXTERNAL_URL") or "").strip().rstrip("/")
    if base:
        app.logger.info(
            "Production URL %s — OAuth redirect URI: %s/auth/google/callback",
            base,
            base,
        )
    elif is_production_hosting():
        app.logger.info(
            "Production hosting: add OAuth redirect URI in Google Cloud "
            "for your public HTTPS URL."
        )


log_deploy_hints()


def _preload_piper_async() -> None:
    if piper_disabled():
        return
    import threading

    def _run() -> None:
        try:
            if warmup_piper_voice():
                app.logger.info("Piper English model preloaded")
        except Exception:
            app.logger.exception("Piper background preload failed")

    threading.Thread(target=_run, name="piper-preload", daemon=True).start()


_preload_piper_async()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=port, debug=debug)
