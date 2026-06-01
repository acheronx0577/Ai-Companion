"""Message word limit helpers."""

import unittest

from message_limits import (
    MAX_MESSAGE_WORDS,
    count_words,
    message_exceeds_word_limit,
    word_limit_message,
)


class MessageLimitsTests(unittest.TestCase):
    """Word-count helpers for the per-message cap."""

    def test_count_words_empty(self):
        self.assertEqual(count_words(""), 0)
        self.assertEqual(count_words("   "), 0)

    def test_count_words_simple(self):
        self.assertEqual(count_words("hi hi how are you"), 5)

    def test_limit_boundary(self):
        text = " ".join(["word"] * MAX_MESSAGE_WORDS)
        self.assertFalse(message_exceeds_word_limit(text))
        self.assertTrue(message_exceeds_word_limit(f"{text} extra"))

    def test_word_limit_message_mentions_cap(self):
        self.assertIn(str(MAX_MESSAGE_WORDS), word_limit_message())


if __name__ == "__main__":
    unittest.main()
