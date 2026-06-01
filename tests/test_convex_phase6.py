"""Phase 6 Flask /chat + Convex HTTP usage bridge checks."""

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class ConvexPhase6LayoutTests(unittest.TestCase):
    """Static layout checks for Phase 6 chat bridge."""

    def test_phase6_files_exist(self):
        for rel in (
            "convex/chatHttp.ts",
            "convex/chatBridgeInfo.ts",
            "convex_usage.py",
            "scripts/verify_convex_phase6.mjs",
        ):
            self.assertTrue((ROOT / rel).is_file(), rel)

    def test_verify_script_exits_zero(self):
        result = subprocess.run(
            ["node", "scripts/verify_convex_phase6.mjs"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)


class ConvexPhase6FlaskTests(unittest.TestCase):
    """Flask chat route uses Convex usage when configured."""

    def test_use_convex_usage_defaults_on_with_convex_url(self):
        from convex_usage import use_convex_usage

        with patch.dict(
            "os.environ",
            {"USE_CONVEX_USAGE": "", "CONVEX_URL": "http://127.0.0.1:3210"},
            clear=False,
        ):
            self.assertTrue(use_convex_usage())

    def test_bearer_token_from_authorization_header(self):
        from convex_usage import bearer_token_from_request

        class FakeRequest:
            """Minimal request stub for bearer header parsing."""

            headers = {"Authorization": "Bearer test-token-123"}

        self.assertEqual(bearer_token_from_request(FakeRequest()), "test-token-123")

    @patch("convex_usage.increment_usage_via_convex")
    @patch("convex_usage.use_convex_usage", return_value=True)
    @patch("app.user_is_authenticated", return_value=True)
    def test_chat_requires_convex_token_when_enabled(
        self, _auth, _convex_flag, _increment
    ):
        from app import app

        client = app.test_client()
        response = client.post("/chat", json={"message": "hello"})
        self.assertEqual(response.status_code, 401)
        _increment.assert_not_called()

    @patch("convex_usage.increment_usage_via_convex")
    @patch("convex_usage.use_convex_usage", return_value=True)
    @patch("app.user_is_authenticated", return_value=True)
    def test_chat_calls_convex_increment_with_token(
        self, _auth, _convex_flag, mock_increment
    ):
        from app import app

        mock_increment.return_value = {
            "limit": 10,
            "used": 1,
            "remaining": 9,
            "allowed": True,
            "canSend": True,
            "rate": {"allowed": True, "retryAfterSeconds": 0},
        }
        client = app.test_client()
        response = client.post(
            "/chat",
            json={"message": "hello"},
            headers={"Authorization": "Bearer fake-token"},
        )
        self.assertIn(response.status_code, (200, 503))
        mock_increment.assert_called_once_with("fake-token")


class ConvexPhase6RuntimeTests(unittest.TestCase):
    """Convex CLI query for Phase 6 status."""

    @unittest.skipUnless(
        (ROOT / ".env.local").exists() and shutil.which("npx"),
        "requires .env.local and npx",
    )
    def test_phase6_status_query(self):
        command = "npx convex run chatBridgeInfo:phase6Status"
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
        self.assertEqual(data.get("phase"), 6)


if __name__ == "__main__":
    unittest.main()
