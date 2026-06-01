"""Railway entrypoint: read numeric PORT from env (never shell ${PORT} syntax)."""
import os
import re
import sys


def resolve_port() -> str:
    raw = os.environ.get("PORT", "8080")
    text = str(raw).strip()
    if re.fullmatch(r"\d+", text):
        return text
    # Railway/dashboard sometimes injects literal "${PORT}" or "$PORT" — ignore it.
    print(
        f"railway_serve: invalid PORT env {text!r}, using 8080",
        file=sys.stderr,
        flush=True,
    )
    return "8080"


def main() -> None:
    port = resolve_port()
    print(f"railway_serve: binding gunicorn to 0.0.0.0:{port}", flush=True)
    argv = [
        sys.executable,
        "-m",
        "gunicorn",
        "app:app",
        "--bind",
        f"0.0.0.0:{port}",
        "--workers",
        "1",
        "--threads",
        "4",
        "--worker-class",
        "gthread",
        "--timeout",
        "120",
    ]
    os.execv(sys.executable, argv)


if __name__ == "__main__":
    main()
