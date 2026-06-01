"""Phase 4 Convex usage limit checks (stdlib unittest)."""

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ConvexPhase4LayoutTests(unittest.TestCase):
    """Static layout checks for Phase 4 usage modules."""

    def test_usage_files_exist(self):
        for rel in (
            "convex/usageLogic.ts",
            "convex/usageTypes.ts",
            "convex/usageInfo.ts",
        ):
            self.assertTrue((ROOT / rel).is_file(), rel)

    def test_schema_has_chat_rate_state(self):
        schema = (ROOT / "convex" / "schema.ts").read_text(encoding="utf-8")
        self.assertIn("chatRateState", schema)

    def test_flask_convex_usage_flag(self):
        usage_py = (ROOT / "usage_limit.py").read_text(encoding="utf-8")
        self.assertIn("def use_convex_usage", usage_py)

    def test_verify_script_exits_zero(self):
        result = subprocess.run(
            ["node", "scripts/verify_convex_phase4.mjs"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)


class ConvexPhase4RuntimeTests(unittest.TestCase):
    """Convex CLI queries for usage limit behavior."""

    def _convex_run(self, function: str, args_json: str | None = None) -> dict:
        if sys.platform == "win32":
            command = f"npx convex run {function}"
            if args_json is not None:
                command = f'{command} "{args_json}"'
            result = subprocess.run(
                command,
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
                shell=True,
            )
        else:
            cmd = ["npx", "convex", "run", function]
            if args_json is not None:
                cmd.append(args_json)
            result = subprocess.run(
                cmd,
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        return json.loads(result.stdout.strip())

    @unittest.skipUnless(
        (ROOT / ".env.local").exists() and shutil.which("npx"),
        "requires .env.local and npx",
    )
    def test_phase4_status_query(self):
        data = self._convex_run("usageInfo:phase4Status")
        self.assertEqual(data.get("phase"), 4)
        self.assertIn("usage.increment", data.get("functions", []))

    @unittest.skipUnless(
        (ROOT / ".env.local").exists() and shutil.which("npx"),
        "requires .env.local and npx",
    )
    def test_daily_limit_blocks_eleventh_message(self):
        """10 used => no remaining; mirrors rejecting an 11th chat message."""
        at_nine = self._convex_run("usage:checkDailyLimit", '{"used": 9}')
        self.assertTrue(at_nine["allowed"])
        self.assertEqual(at_nine["remaining"], 1)

        at_ten = self._convex_run("usage:checkDailyLimit", '{"used": 10}')
        self.assertFalse(at_ten["allowed"])
        self.assertEqual(at_ten["remaining"], 0)

    @unittest.skipUnless(
        (ROOT / ".env.local").exists() and shutil.which("npx"),
        "requires .env.local and npx",
    )
    def test_guest_status_query(self):
        data = self._convex_run("usage:status")
        self.assertEqual(data.get("limit"), 10)
        self.assertEqual(data.get("used"), 0)
        self.assertTrue(data.get("canSend"))


if __name__ == "__main__":
    unittest.main()
