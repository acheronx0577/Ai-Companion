"""Phase 1 Convex schema checks (stdlib unittest)."""

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

EXPECTED_LIMITS = {
    "dailyMessageLimit": 10,
}

EXPECTED_TABLES = {"users", "dailyUsage", "chatSessions", "chatMessages"}


class ConvexPhase1SchemaFileTests(unittest.TestCase):
    """Static checks for Convex schema and constants alignment."""

    def test_schema_defines_all_tables(self):
        schema = (ROOT / "convex" / "schema.ts").read_text(encoding="utf-8")
        for table in EXPECTED_TABLES:
            self.assertIn(f"{table}: defineTable", schema)

    def test_constants_match_usage_limit_py(self):
        constants = (ROOT / "convex" / "constants.ts").read_text(encoding="utf-8")
        usage = (ROOT / "usage_limit.py").read_text(encoding="utf-8")
        pairs = [
            ("DAILY_MESSAGE_LIMIT = 10", "DAILY_MESSAGE_LIMIT = 10"),
        ]
        for in_constants, in_usage in pairs:
            self.assertIn(in_constants, constants)
            self.assertIn(in_usage, usage)

    def test_verify_script_exits_zero(self):
        result = subprocess.run(
            ["node", "scripts/verify_convex_phase1.mjs"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)


class ConvexPhase1RuntimeTests(unittest.TestCase):
    """Skipped when Convex CLI is unavailable; run via phase:gate locally."""

    @unittest.skipUnless(
        (ROOT / ".env.local").exists() and shutil.which("npx"),
        "requires .env.local and npx on PATH",
    )
    def test_phase1_status_query(self):
        command = "npx convex run schemaInfo:phase1Status"
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
        self.assertEqual(data.get("phase"), 1)
        self.assertEqual(set(data.get("tables", [])), EXPECTED_TABLES)
        self.assertEqual(data.get("limits"), EXPECTED_LIMITS)


if __name__ == "__main__":
    unittest.main()
