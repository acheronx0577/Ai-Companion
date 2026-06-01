"""Shared deploy constants (import-safe, no Flask)."""

import os

# Bump when static UI or voice catalog changes; passed to templates and /voices/status.
ASSET_VERSION = os.environ.get("ASSET_VERSION", "20260601c12")
