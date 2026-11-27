import tomllib

from pathlib import Path

import hopwatch


def test_version_matches_pyproject():
    pyproject = tomllib.loads((Path(__file__).parent.parent / "pyproject.toml").read_text(encoding="utf-8"))
    assert hopwatch.__version__ == pyproject["project"]["version"]
