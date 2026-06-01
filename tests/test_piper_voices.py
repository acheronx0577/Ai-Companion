"""Tests for Piper voice catalog helpers."""

import os
import unittest

from piper_voices import (
    PIPER_VOICE_CATALOG,
    _voice_cache,
    clear_piper_runtime_cache,
    default_piper_voice_id,
    list_available_piper_voices,
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

    def test_catalog_languages(self):
        langs = {entry["lang"] for entry in PIPER_VOICE_CATALOG}
        self.assertEqual(langs, {"en", "zh", "vi"})
        self.assertNotIn("es", langs)
        self.assertNotIn("ko", langs)

    def test_menu_lists_full_catalog(self):
        menu = list_piper_voice_menu()
        self.assertEqual(len(menu), len(PIPER_VOICE_CATALOG))
        self.assertTrue(all("available" in entry for entry in menu))

    def test_browser_menu_device_languages(self):
        menu = list_browser_voice_menu(hide_piper_languages=False)
        langs = {entry["lang"] for entry in menu}
        self.assertEqual(langs, {"en", "ja", "zh", "vi"})

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
        if not any(voice_files_present(entry["id"]) for entry in PIPER_VOICE_CATALOG):
            self.skipTest("No Piper models installed")
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
        self.assertIsInstance(data["piperVoices"], list)
        self.assertEqual(len(data["piperVoices"]), len(PIPER_VOICE_CATALOG))
        self.assertIn("browserVoiceMenu", data)
        device_langs = {entry.get("lang") for entry in data["browserVoiceMenu"]}
        self.assertNotIn("es", device_langs)
        self.assertNotIn("ko", device_langs)


if __name__ == "__main__":
    unittest.main()
