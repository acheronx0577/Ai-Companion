import os
import secrets

from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from flask import Blueprint, jsonify, redirect, session, url_for

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")
_oauth_client = None


def load_auth_env() -> None:
    load_dotenv()


def google_oauth_configured() -> bool:
    load_auth_env()
    return bool(
        os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
        and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    )


def init_auth(app) -> None:
    global _oauth_client
    load_auth_env()

    secret = os.environ.get("FLASK_SECRET_KEY")
    if not secret:
        secret = secrets.token_hex(32)
        app.logger.warning(
            "FLASK_SECRET_KEY is not set. Sessions will reset when the server restarts."
        )
    app.secret_key = secret

    if not google_oauth_configured():
        _oauth_client = None
        return

    oauth = OAuth(app)
    _oauth_client = oauth.register(
        name="google",
        client_id=os.environ["GOOGLE_OAUTH_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


def get_google_client():
    return _oauth_client


def get_current_user() -> dict | None:
    user = session.get("user")
    return user if isinstance(user, dict) and user.get("id") else None


def user_is_authenticated() -> bool:
    return get_current_user() is not None


@auth_bp.route("/me")
def auth_me():
    user = get_current_user()
    return jsonify({
        "authenticated": user is not None,
        "oauthConfigured": google_oauth_configured(),
        "user": user,
    })


@auth_bp.route("/google")
def auth_google():
    if not google_oauth_configured():
        return (
            "Google sign-in is not configured. "
            "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in your environment.",
            503,
        )

    google = get_google_client()
    redirect_uri = url_for("auth.auth_google_callback", _external=True)
    return google.authorize_redirect(redirect_uri)


@auth_bp.route("/google/callback")
def auth_google_callback():
    google = get_google_client()
    token = google.authorize_access_token()
    user_info = token.get("userinfo")
    if not user_info:
        user_info = google.parse_id_token(token)

    session["user"] = {
        "id": user_info["sub"],
        "email": user_info.get("email"),
        "name": user_info.get("name") or user_info.get("email") or "Google user",
        "picture": user_info.get("picture"),
    }
    session.permanent = True
    return redirect(url_for("index"))


@auth_bp.route("/logout", methods=["POST"])
def auth_logout():
    session.pop("user", None)
    return jsonify({"authenticated": False, "user": None})
