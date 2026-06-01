#!/usr/bin/env python3
"""Check required env vars before cloud deploy. Run: python scripts/check_deploy_env.py"""

import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
env_file = root / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())

REQUIRED = (
    "GROQ_API_KEY",
    "FLASK_SECRET_KEY",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
)

OPTIONAL = (
    "GROQ_MODEL",
    "CHAT_PROVIDER",
    "DISABLE_PIPER",
    "CONVEX_URL",
    "USAGE_LIMIT_PEPPER",
    "PRODUCTION",
)


def main() -> int:
    missing = [name for name in REQUIRED if not os.environ.get(name, "").strip()]
    if missing:
        print("Missing required variables (set in Render or .env):")
        for name in missing:
            print(f"  - {name}")
        return 1

    print("Required variables: OK")
    for name in OPTIONAL:
        value = os.environ.get(name, "").strip()
        if value:
            print(f"  {name}: set")
        else:
            print(f"  {name}: (optional, not set)")

    render_url = os.environ.get("RENDER_EXTERNAL_URL", "").strip()
    if render_url:
        print(
            f"\nProduction OAuth redirect URI:\n  {render_url.rstrip('/')}/auth/google/callback"
        )
    else:
        print(
            "\nLocal OAuth redirect URI:\n  http://127.0.0.1:5000/auth/google/callback"
        )
        print(
            "(After Render deploy, add https://YOUR-SERVICE.onrender.com/auth/google/callback)"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
