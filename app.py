"""WakuWaku AI Companion — Flask web app."""

import io
import os
import wave
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_file

from auth import auth_bp, init_auth, user_is_authenticated
from chat_llm import chat_provider, chat_with_groq
import convex_usage
from chat_language import message_for_response_language
from message_limits import (
    MAX_MESSAGE_WORDS,
    message_exceeds_word_limit,
    word_limit_message,
)
from usage_limit import (
    DAILY_MESSAGE_LIMIT,
    increment_usage_for_current_request,
    usage_status_for_current_request,
)

from piper_voices import (
    default_piper_voice_id,
    get_piper_voice,
    list_available_piper_voices,
    list_browser_voice_menu,
    list_piper_voice_menu,
    max_loaded_piper_voices,
    piper_disabled,
    voice_files_present,
)

app = Flask(__name__)


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

API_JSON_PREFIXES = ("/chat", "/tts", "/voices/", "/usage/", "/auth/")


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


runner = None
character_exists = os.path.exists("character.py")
DEFAULT_PIPER_VOICE_ID = "en_US-hfc_female-medium"


def get_gemini_runner():
    """Lazy-load Gemini ADK only when GEMINI is the active provider."""
    global runner  # noqa: PLW0603
    if runner is not None:
        return runner
    if not character_exists or chat_provider() != "gemini":
        return None
    try:
        from google.adk.runners import InMemoryRunner
        import character
    except ImportError:
        app.logger.exception(
            "Gemini dependencies not installed (use requirements.txt locally)"
        )
        return None
    runner = InMemoryRunner(
        agent=character.root_agent,
        app_name="Demo App",
    )
    return runner


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
    return render_template(
        "index.html",
        convex_url=convex_url,
        convex_enabled=convex_frontend_enabled(),
        authenticated=user_is_authenticated(),
    )


@app.route("/convex-auth-test")
def convex_auth_test():
    """Debug page for Convex Auth and usage (optional; main app is /)."""
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
    )


@app.route("/favicon.ico")
def favicon():
    return redirect(url_for("static", filename="images/char-mouth-closed.png"))


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
            "piperVoices": piper_menu,
            "browserVoiceMenu": list_browser_voice_menu(),
            "piperLabel": piper_ready[0].label if piper_ready else None,
            "koreanUsesBrowserTts": True,
            "lazyLoad": True,
            "maxLoadedVoices": max_loaded_piper_voices(),
        }
    )
    response.headers["Cache-Control"] = "private, max-age=60"
    return response


def _parse_chat_payload(payload: dict) -> tuple[str, str, str]:
    user_message = (payload.get("message") or "").strip()
    session_id = payload.get("session_id", "default_session")
    language = (payload.get("language") or "en").strip()
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


def _chat_request_precheck(user_message: str):
    if not user_message:
        return jsonify({"error": "Message is required", "response": ""}), 400
    if message_exceeds_word_limit(user_message):
        return jsonify(
            {
                "error": f"Message exceeds {MAX_MESSAGE_WORDS} word limit.",
                "response": word_limit_message(),
                "messageTooLong": True,
                "maxWords": MAX_MESSAGE_WORDS,
            }
        ), 400
    if not user_is_authenticated():
        return jsonify(
            {
                "error": "Authentication required.",
                "response": (
                    "Meow! Please sign in with Google from the sidebar profile section "
                    "before we can chat."
                ),
                "authRequired": True,
            }
        ), 401
    return None


async def _gemini_chat_response(session_id: str, model_message: str, usage: dict):
    gemini_runner = get_gemini_runner()
    if gemini_runner is None:
        return jsonify(
            {
                "error": "Gemini backend is not ready. Restart the server after setting GEMINI_API_KEY.",
                "response": "",
                "usage": usage,
            }
        ), 503

    from google.genai import types

    adk_session = await gemini_runner.session_service.get_session(
        app_name=gemini_runner.app_name, user_id="inapp_user", session_id=session_id
    )
    if adk_session is None:
        adk_session = await gemini_runner.session_service.create_session(
            app_name=gemini_runner.app_name,
            user_id="inapp_user",
            session_id=session_id,
        )

    content = types.Content(role="user", parts=[types.Part(text=model_message)])
    response_text = ""
    async for event in gemini_runner.run_async(
        user_id=adk_session.user_id,
        session_id=adk_session.id,
        new_message=content,
    ):
        if event.content and event.content.parts and event.content.parts[0].text:
            response_text += event.content.parts[0].text

    return jsonify({"response": response_text, "usage": usage})


async def _run_chat_provider(
    session_id: str, model_message: str, language: str, usage: dict
):
    provider = chat_provider()
    try:
        if provider == "groq":
            response_text = await chat_with_groq(session_id, model_message, language)
            return jsonify({"response": response_text, "usage": usage})
        return await _gemini_chat_response(session_id, model_message, usage)
    except Exception as exc:
        app.logger.exception("Chat request failed")
        message = str(exc or "")
        if provider == "groq":
            # Treat missing/invalid Groq configuration as a 503 (deploy config issue),
            # not a generic 500. This avoids confusing users on production.
            lowered = message.lower()
            if "groq_api_key is not set" in lowered or "unauthorized" in lowered:
                return jsonify(
                    {
                        "error": message
                        or "Groq is not configured. Set GROQ_API_KEY in your environment.",
                        "response": (
                            "Meow! 서버에 채팅 키가 아직 설정되지 않았어요. "
                            "관리자가 GROQ_API_KEY(또는 GEMINI_API_KEY)를 설정한 뒤 다시 시도해 주세요."
                            if (language or "").strip().lower().startswith("ko")
                            else (
                                "Meow! Chat isn’t configured on the server yet. "
                                "Set GROQ_API_KEY (or GEMINI_API_KEY) and try again."
                            )
                        ),
                        "usage": usage,
                    }
                ), 503

            hint = message or "Check GROQ_API_KEY at console.groq.com (free tier, no card)."
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

    precheck_error = _chat_request_precheck(user_message)
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
    return await _run_chat_provider(session_id, model_message, language, usage)


@app.route("/tts", methods=["POST"])
def tts():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    voice_id = (payload.get("voice") or "").strip() or default_piper_voice_id()
    if not text:
        return jsonify({"error": "Missing text"}), 400

    voice = get_piper_voice(voice_id)
    if voice is None:
        return jsonify({"error": "Piper voice unavailable"}), 503

    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file)
    wav_buffer.seek(0)

    return send_file(
        wav_buffer,
        mimetype="audio/wav",
        as_attachment=False,
        download_name="tts.wav",
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=port, debug=debug)
