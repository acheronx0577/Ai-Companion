from flask import Flask, render_template, request, jsonify, redirect, url_for, send_file
from google.adk.runners import InMemoryRunner
from google.genai import types
from dotenv import load_dotenv
import asyncio
import os
import io
import wave
from pathlib import Path
from threading import Lock

from auth import auth_bp, init_auth, user_is_authenticated
from usage_limit import (
    DAILY_MESSAGE_LIMIT,
    increment_usage_for_current_request,
    rate_limit_message,
    rate_limit_status_for_current_request,
    usage_status_for_current_request,
)

try:
    from piper.voice import PiperVoice
except ImportError:
    PiperVoice = None

app = Flask(__name__)
init_auth(app)
app.register_blueprint(auth_bp)

API_JSON_PREFIXES = ('/chat', '/tts', '/voices/', '/usage/', '/auth/')


def is_api_json_request():
    path = request.path or ''
    return any(path == prefix or path.startswith(prefix) for prefix in API_JSON_PREFIXES)


@app.errorhandler(404)
def api_not_found(_error):
    if is_api_json_request():
        return jsonify({'error': 'API route not found. Restart the Flask server.', 'response': ''}), 404
    return _error


@app.errorhandler(405)
def api_method_not_allowed(_error):
    if is_api_json_request():
        return jsonify({'error': 'Method not allowed for this API route.', 'response': ''}), 405
    return _error


@app.errorhandler(500)
def api_server_error(_error):
    if is_api_json_request():
        return jsonify({
            'error': 'Server error. Check the terminal running app.py for details.',
            'response': '',
        }), 500
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


def message_for_response_language(message: str, language: str) -> str:
    lang = (language or "en").lower()
    if lang.startswith("ja"):
        return (
            "【重要】次の返答は日本語のみで書いてください。"
            "音声読み上げ向けに、短く自然な日本語で答えてください。"
            "英語は使わないでください。\n\n"
            f"{message}"
        )
    return message


runner = None
character_exists = os.path.exists('character.py')
voice_lock = Lock()
cached_piper_voice = None
piper_model_path = Path("voices/en_US-hfc_female-medium.onnx")
piper_config_path = Path("voices/en_US-hfc_female-medium.onnx.json")

if character_exists:
    import character
    runner = InMemoryRunner(
        agent=character.root_agent,
        app_name="Demo App",
    )

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/favicon.ico')
def favicon():
    return redirect(url_for('static', filename='images/char-mouth-closed.png'))


def trial_limit_message() -> str:
    return (
        f"Meow... you've used all {DAILY_MESSAGE_LIMIT} trial messages for today! "
        "Your chat limit resets tomorrow — please come back then and try again. "
        "See you soon!"
    )


@app.route('/usage/status')
def usage_status():
    return jsonify(usage_status_for_current_request())


@app.route('/voices/status')
def voices_status():
    try:
        piper_available = get_piper_voice() is not None
    except Exception:
        app.logger.exception('Piper status check failed')
        piper_available = False
    return jsonify({
        'piperAvailable': piper_available,
        'piperLabel': 'Piper Natural Female (en-US)' if piper_available else None,
    })


@app.route('/chat', methods=['POST'])
async def chat():
    payload = request.get_json(silent=True) or {}
    user_message = (payload.get('message') or '').strip()
    session_id = payload.get('session_id', 'default_session')
    language = (payload.get('language') or 'en').strip()

    if not user_message:
        return jsonify({'error': 'Message is required', 'response': ''}), 400

    if not user_is_authenticated():
        return jsonify({
            'error': 'Authentication required.',
            'response': (
                'Meow! Please sign in with Google from the sidebar profile section '
                'before we can chat.'
            ),
            'authRequired': True,
        }), 401

    usage = usage_status_for_current_request()
    if not usage["allowed"]:
        return jsonify({
            'error': 'Daily trial limit reached for this connection.',
            'response': trial_limit_message(),
            'usage': usage,
            'limitReached': True,
        }), 429

    rate = rate_limit_status_for_current_request()
    if not rate["allowed"]:
        usage = usage_status_for_current_request()
        return jsonify({
            'error': 'Too many messages sent too quickly.',
            'response': rate_limit_message(rate["retryAfterSeconds"]),
            'usage': usage,
            'rateLimit': rate,
            'rateLimited': True,
        }), 429

    if not character_exists:
        usage = increment_usage_for_current_request()
        return jsonify({'response': user_message, 'usage': usage})

    if not gemini_api_key_configured():
        return jsonify({
            'error': (
                'Gemini API key is missing. Set GEMINI_API_KEY in your environment '
                'or save your key to gemini_key.txt next to the project (see README).'
            ),
            'response': '',
            'usage': usage,
        }), 503

    usage = increment_usage_for_current_request()

    try:
        adk_session = await runner.session_service.get_session(
            app_name=runner.app_name, user_id="inapp_user", session_id=session_id
        )
        if adk_session is None:
            adk_session = await runner.session_service.create_session(
                app_name=runner.app_name, user_id="inapp_user", session_id=session_id
            )

        model_message = message_for_response_language(user_message, language)
        content = types.Content(role="user", parts=[types.Part(text=model_message)])
        response_text = ""
        async for event in runner.run_async(
            user_id=adk_session.user_id,
            session_id=adk_session.id,
            new_message=content,
        ):
            if event.content and event.content.parts and event.content.parts[0].text:
                response_text += event.content.parts[0].text

        return jsonify({'response': response_text, 'usage': usage})
    except Exception:
        app.logger.exception('Chat request failed')
        return jsonify({
            'error': (
                'The AI could not respond. Check your API key, billing, and quota '
                'in Google AI Studio, then restart the server.'
            ),
            'response': '',
            'usage': usage,
        }), 500


def get_piper_voice():
    global cached_piper_voice
    if PiperVoice is None:
        return None
    if not (piper_model_path.exists() and piper_config_path.exists()):
        return None
    if cached_piper_voice is not None:
        return cached_piper_voice
    with voice_lock:
        if cached_piper_voice is None:
            cached_piper_voice = PiperVoice.load(
                model_path=piper_model_path,
                config_path=piper_config_path,
                use_cuda=False,
                download_dir=Path("voices"),
            )
    return cached_piper_voice


@app.route('/tts', methods=['POST'])
def tts():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Missing text"}), 400

    voice = get_piper_voice()
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


if __name__ == '__main__':
    app.run(debug=True)
