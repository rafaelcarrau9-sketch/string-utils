"""Tests for string_utils."""

from string_utils import reverse_string, is_palindrome, count_vowels


def test_reverse_string():
    assert reverse_string("hello") == "olleh"
    assert reverse_string("") == ""


def test_is_palindrome():
    assert is_palindrome("racecar") is True
    assert is_palindrome("A man a plan a canal Panama") is True
    assert is_palindrome("hello") is False

# NOTE: count_vowels has no test yet.
