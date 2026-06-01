"""Tests for Railway PORT handling."""
import os
import unittest
from unittest import mock

import railway_serve


class RailwayPortTests(unittest.TestCase):
    def test_resolve_port_from_env(self):
        with mock.patch.dict(os.environ, {"PORT": "3000"}, clear=False):
            self.assertEqual(railway_serve.resolve_port(), "3000")

    def test_resolve_port_rejects_template_literal(self):
        with mock.patch.dict(os.environ, {"PORT": "${PORT}"}, clear=False):
            self.assertEqual(railway_serve.resolve_port(), "8080")

    def test_resolve_port_rejects_dollar_port(self):
        with mock.patch.dict(os.environ, {"PORT": "$PORT"}, clear=False):
            self.assertEqual(railway_serve.resolve_port(), "8080")


if __name__ == "__main__":
    unittest.main()
