"""Tests for production PORT handling."""

import os
import unittest
from unittest import mock

import serve


class ServePortTests(unittest.TestCase):
    def test_resolve_port_from_env(self):
        with mock.patch.dict(os.environ, {"PORT": "10000"}, clear=False):
            self.assertEqual(serve.resolve_port(), "10000")

    def test_resolve_port_rejects_template_literal(self):
        with mock.patch.dict(os.environ, {"PORT": "${PORT}"}, clear=False):
            self.assertEqual(serve.resolve_port(), "10000")

    def test_resolve_port_rejects_dollar_port(self):
        with mock.patch.dict(os.environ, {"PORT": "$PORT"}, clear=False):
            self.assertEqual(serve.resolve_port(), "10000")


if __name__ == "__main__":
    unittest.main()
