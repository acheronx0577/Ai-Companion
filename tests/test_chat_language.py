"""Chat language normalization and prompts."""

import unittest

from chat_language import (
    language_display_name,
    message_for_response_language,
    normalize_chat_language,
    system_language_rule,
)


class ChatLanguageTests(unittest.TestCase):
    """Voice tag → chat language mapping."""

    def test_normalize_bcp47_tags(self):
        self.assertEqual(normalize_chat_language("ja-JP"), "ja")
        self.assertEqual(normalize_chat_language("fr-FR"), "fr")
        self.assertEqual(normalize_chat_language("vi-VN"), "vi")
        self.assertEqual(normalize_chat_language("es-ES"), "en")
        self.assertEqual(normalize_chat_language("ko-KR"), "en")
        self.assertEqual(normalize_chat_language("en_US"), "en")
        self.assertEqual(normalize_chat_language("xx-YY"), "en")

    def test_japanese_user_prefix(self):
        wrapped = message_for_response_language("Hello", "ja-JP")
        self.assertIn("日本語", wrapped)
        self.assertTrue(wrapped.endswith("Hello"))

    def test_english_has_no_prefix(self):
        self.assertEqual(message_for_response_language("Hi", "en"), "Hi")

    def test_system_rule_for_french(self):
        rule = system_language_rule("fr")
        self.assertIsNotNone(rule)
        self.assertIn("French", rule)

    def test_display_name(self):
        self.assertEqual(language_display_name("ja"), "Japanese")


if __name__ == "__main__":
    unittest.main()
