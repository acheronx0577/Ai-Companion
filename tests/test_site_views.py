"""Tests for the public site view counter."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from wakuwaku import site_views


class SiteViewsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = Path(self.temp_dir.name) / "site_views.json"
        self.path_patch = mock.patch.object(site_views, "SITE_VIEWS_PATH", self.store)
        self.path_patch.start()

    def tearDown(self):
        self.path_patch.stop()
        self.temp_dir.cleanup()

    def test_starts_at_zero(self):
        self.assertEqual(site_views.get_site_view_count(), 0)

    def test_record_increments(self):
        self.assertEqual(site_views.record_site_view(), 1)
        self.assertEqual(site_views.record_site_view(), 2)
        self.assertEqual(site_views.get_site_view_count(), 2)

    def test_system_stats_includes_view_count(self):
        site_views.record_site_view()
        data = __import__(
            "wakuwaku.system_stats", fromlist=["system_stats_payload"]
        ).system_stats_payload(piper_model_loaded=False)
        self.assertEqual(data["viewCount"], 1)


if __name__ == "__main__":
    unittest.main()
