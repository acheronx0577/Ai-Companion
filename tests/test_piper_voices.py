"""Tests for Piper voice catalog helpers."""

import os
import unittest

from piper_voices import (
    BROWSER_VOICE_MENU,
    DEVICE_LANGS_ALWAYS,
    PIPER_VOICE_CATALOG,
    _voice_cache,
    clear_piper_runtime_cache,
    default_piper_voice_id,
    list_browser_voice_menu,
    list_piper_voice_menu,
    max_loaded_piper_voices,
    resolve_piper_voice_id,
    synthesize_text_to_wav,
    voice_availability,
    voice_files_present,
)


class PiperVoiceCatalogTests(unittest.TestCase):
    """Unit tests for piper_voices catalog helpers."""

    def test_catalog_is_english_only(self):
        langs = {entry["lang"] for entry in PIPER_VOICE_CATALOG}
        self.assertEqual(langs, {"en"})
        ids = {entry["id"] for entry in PIPER_VOICE_CATALOG}
        self.assertEqual(ids, {"en_US-hfc_female-medium"})

    def test_browser_menu_english_and_japanese(self):
        langs = {entry["lang"] for entry in BROWSER_VOICE_MENU}
        self.assertEqual(langs, {"en", "ja"})
        self.assertEqual(DEVICE_LANGS_ALWAYS, frozenset({"ja"}))

    def test_browser_menu_hides_english_when_piper_installed(self):
        if not voice_files_present("en_US-hfc_female-medium"):
            self.skipTest("English Piper model not installed")
        menu = list_browser_voice_menu()
        langs = {entry["lang"] for entry in menu}
        self.assertNotIn("en", langs)
        self.assertIn("ja", langs)

    def test_menu_lists_full_catalog(self):
        menu = list_piper_voice_menu()
        self.assertEqual(len(menu), len(PIPER_VOICE_CATALOG))
        self.assertTrue(all("available" in entry for entry in menu))

    def test_availability_cache_does_not_load_models(self):
        clear_piper_runtime_cache()
        before = len(_voice_cache)
        voice_availability()
        voice_availability()
        self.assertEqual(len(_voice_cache), before)

    def test_max_loaded_voices_defaults_to_one(self):
        self.assertGreaterEqual(max_loaded_piper_voices(), 1)

    def test_resolve_unknown_falls_back_to_first_available(self):
        if not any(voice_files_present(entry["id"]) for entry in PIPER_VOICE_CATALOG):
            self.skipTest("No Piper models installed")
        resolved = resolve_piper_voice_id("not-a-real-voice")
        self.assertEqual(resolved, default_piper_voice_id())

    def test_synthesize_dot_returns_none(self):
        if not voice_files_present("en_US-hfc_female-medium"):
            self.skipTest("English Piper model not installed")
        from piper_voices import get_piper_voice

        voice = get_piper_voice(default_piper_voice_id())
        self.assertIsNone(synthesize_text_to_wav(voice, "."))
        self.assertTrue(synthesize_text_to_wav(voice, "Hi"))


class PiperVoicesStatusRouteTests(unittest.TestCase):
    """Flask route tests for /voices/status."""

    def setUp(self):
        os.environ.setdefault("GROQ_API_KEY", "test-key-for-health-check")
        from app import app

        self.client = app.test_client()

    def test_voices_status_json_shape(self):
        response = self.client.get("/voices/status")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("piperAvailable", data)
        self.assertIn("piperVoices", data)
        self.assertEqual(len(data["piperVoices"]), 1)
        self.assertEqual(data["piperVoices"][0]["id"], "en_US-hfc_female-medium")
        device_langs = {entry.get("lang") for entry in data["browserVoiceMenu"]}
        self.assertIn("ja", device_langs)
        if data.get("piperAvailable"):
            self.assertNotIn("en", device_langs)


if __name__ == "__main__":
    unittest.main()
