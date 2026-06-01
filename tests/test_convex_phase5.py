"""Phase 5 Convex frontend bridge checks (stdlib unittest)."""

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ConvexPhase5LayoutTests(unittest.TestCase):
    """Static layout checks for Phase 5 frontend bridge."""

    def test_phase5_files_exist(self):
        for rel in (
            "static/convex_bridge.mjs",
            "convex/frontendInfo.ts",
            "scripts/verify_convex_phase5.mjs",
        ):
            self.assertTrue((ROOT / rel).is_file(), rel)

    def test_index_injects_waku_env(self):
        template = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
        self.assertIn("__WAKU_ENV__", template)
        self.assertIn("convex_bridge.mjs", template)

    def test_verify_script_exits_zero(self):
        result = subprocess.run(
            ["node", "scripts/verify_convex_phase5.mjs"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)


class ConvexPhase5FlaskTests(unittest.TestCase):
    """Flask session bridge for Convex Auth until Phase 6."""

    def test_convex_bridge_sets_session(self):
        from app import app

        client = app.test_client()
        response = client.post(
            "/auth/convex-bridge",
            json={
                "googleSub": "google-test-sub",
                "email": "test@example.com",
                "name": "Test User",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get("authenticated"))
        self.assertEqual(data["user"]["id"], "google-test-sub")

    def test_convex_bridge_requires_google_sub(self):
        from app import app

        client = app.test_client()
        response = client.post("/auth/convex-bridge", json={})
        self.assertEqual(response.status_code, 400)


class ConvexPhase5RuntimeTests(unittest.TestCase):
    """Convex CLI query for Phase 5 status."""

    @unittest.skipUnless(
        (ROOT / ".env.local").exists() and shutil.which("npx"),
        "requires .env.local and npx",
    )
    def test_phase5_status_query(self):
        command = "npx convex run frontendInfo:phase5Status"
        result = subprocess.run(
            command if sys.platform == "win32" else command.split(),
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
            shell=sys.platform == "win32",
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        data = json.loads(result.stdout.strip())
        self.assertEqual(data.get("phase"), 5)
        self.assertIn("usage.status", data.get("functions", []))


if __name__ == "__main__":
    unittest.main()
