import pytest

from hopwatch.api.stops.matching import matches_word_prefixes, normalize, words


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Železniki", "zelezniki"),
        ("KRANJ", "kranj"),
        ("Črnuče", "crnuce"),
        ("Đakovo", "dakovo"),
        ("Straße", "strasse"),
    ],
)
def test_normalize_ignores_case_and_accents(text, expected):
    assert normalize(text) == expected


def test_words_split_on_punctuation():
    assert words("Videm/Ljubljani") == ["videm", "ljubljani"]
    assert words("Lavrica(Železniški)") == ["lavrica", "zelezniski"]
    assert words("Sp.Kraše") == ["sp", "krase"]
    assert words("Lesce-Bled") == ["lesce", "bled"]


@pytest.mark.parametrize(
    ("name", "query"),
    [
        ("Kranj", "kranj"),
        ("Kranj AP", "KRANJ"),
        ("Ljubljana Železna", "lj zel"),
        ("Ljubljana Železna", "zelezna"),
        ("Lesce-Bled", "bled"),
        ("Ljubljana Črnuče", "crnuce"),
        ("Ljubljana Črnuče", "Črn"),
    ],
)
def test_matches_word_prefixes(name, query):
    assert matches_word_prefixes(name, query)


@pytest.mark.parametrize(
    ("name", "query"),
    [
        ("Lesce-Bled", "led"),
        ("Kranj", "kranjska"),
        ("Ljubljana Vič", "lj zel"),
        ("Kranj", ""),
        ("Kranj", " - "),
    ],
)
def test_does_not_match(name, query):
    assert not matches_word_prefixes(name, query)
