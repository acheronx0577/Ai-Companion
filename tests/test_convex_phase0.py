"""Phase 0 Convex bootstrap checks (stdlib unittest)."""

import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ConvexPhase0LayoutTests(unittest.TestCase):
    def test_required_convex_files_exist(self):
        required = [
            "convex/schema.ts",
            "convex/auth.ts",
            "convex/users.ts",
            "convex/usage.ts",
            "convex/http.ts",
            "convex/tsconfig.json",
        ]
        for rel in required:
            self.assertTrue((ROOT / rel).is_file(), f"missing {rel}")

    def test_package_json_has_convex_scripts(self):
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertIn("convex", pkg.get("dependencies", {}))
        scripts = pkg.get("scripts", {})
        self.assertIn("convex:dev", scripts)
        self.assertIn("test:convex-phase0", scripts)

    def test_verify_script_exits_zero(self):
        result = subprocess.run(
            ["node", "scripts/verify_convex_phase0.mjs"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(
            result.returncode,
            0,
            msg=result.stdout + result.stderr,
        )


if __name__ == "__main__":
    unittest.main()
