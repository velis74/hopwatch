"""Case- and accent-insensitive matching of stop names."""

import re
import unicodedata

# Letters without a Unicode decomposition to a base letter.
_EXTRA_FOLDS = str.maketrans({"đ": "d", "ł": "l", "ø": "o", "ħ": "h", "ı": "i"})
_WORD = re.compile(r"\w+")


def normalize(text: str) -> str:
    """`text` case-folded, decomposed (NFKD) and without combining marks: `Železniki` -> `zelezniki`."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    stripped = "".join(char for char in decomposed if not unicodedata.combining(char))
    return stripped.translate(_EXTRA_FOLDS)


def words(text: str) -> list[str]:
    """The normalised words of `text`; punctuation (`/`, `.`, `-`, `(`) separates words."""
    return _WORD.findall(normalize(text).replace("_", " "))


def matches_word_prefixes(name: str, query: str) -> bool:
    """
    Whether every word of `query` is the prefix of a word of `name`, ignoring case and accents:
    `kranj` matches `Kranj AP`, `lj zel` matches `Ljubljana Železna`, `bled` matches `Lesce-Bled`.
    A query without words matches nothing.
    """
    query_words = words(query)
    if not query_words:
        return False
    name_words = words(name)
    return all(any(word.startswith(prefix) for word in name_words) for prefix in query_words)
