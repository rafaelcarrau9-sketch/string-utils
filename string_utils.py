"""A tiny collection of string helper functions."""


def reverse_string(text):
    """Return the string reversed."""
    return text[::-1]


def is_palindrome(text):
    """Return True if text reads the same forwards and backwards.

    Comparison ignores case and spaces.
    """
    cleaned = text.replace(" ", "").lower()
    return cleaned == cleaned[::-1]


def count_vowels(text):
    """Return the number of vowels (a, e, i, o, u) in text."""
    return sum(1 for char in text.lower() if char in "aeiou")
