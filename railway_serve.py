"""Railway entrypoint: expand PORT without shell (fallback if start.sh fails)."""
import os
import sys


def main() -> None:
    port = os.environ.get("PORT", "8080")
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
