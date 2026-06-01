"""Tests for sidebar system stats."""

import os
import unittest

from system_stats import system_stats_payload


class SystemStatsTests(unittest.TestCase):
    def test_payload_shape(self):
        data = system_stats_payload(piper_model_loaded=True, piper_synthesis_busy=False)
        self.assertIn("memoryMb", data)
        self.assertIn("memoryPercent", data)
        self.assertIn("memoryLimitMb", data)
        self.assertIn("uptimeSec", data)
        self.assertTrue(data["piperModelLoaded"])
        self.assertGreaterEqual(data["memoryMb"], 0)

    def test_route_returns_json(self):
        os.environ.setdefault("GROQ_API_KEY", "test-key-for-health-check")
        from app import app

        client = app.test_client()
        response = client.get("/system/stats")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("cpuPercent", data)
        self.assertIn("memoryMb", data)


if __name__ == "__main__":
    unittest.main()
