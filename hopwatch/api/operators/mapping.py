"""
Operators of the timetable. The timetable answers name the operator of each trip but list no operators, so the
list is read from the `agency.txt` of the timetable feeds (`settings.TIMETABLE_FEEDS`) and completed with every
operator an answer named since the process started.
"""

import asyncio
import csv
import io
import zipfile

from collections.abc import Callable, Iterable
from pathlib import Path

from pydantic import BaseModel, Field

from hopwatch.motis import JsonObject

# Bound on operators collected from answers; a feed holds a few dozen.
MAX_REMEMBERED = 1000


class Operator(BaseModel):
    """A transport operator: the company that runs a trip."""

    id: str = Field(description="Operator id as the timetable publishes it (`1161`); stable across timetable updates.")
    name: str = Field(description="Name of the operator as the timetable publishes it.")
    url: str | None = Field(description="Web site of the operator; null when the timetable publishes none.")


def operator_from(record: JsonObject) -> Operator | None:
    """The operator of a stop time or itinerary leg (`agencyId`, `agencyName`, `agencyUrl`); None without an id."""
    operator_id = record.get("agencyId")
    if not operator_id:
        return None
    operator_id = str(operator_id)
    return Operator(id=operator_id, name=record.get("agencyName") or operator_id, url=record.get("agencyUrl") or None)


def feed_operators(path: Path) -> list[Operator]:
    """Operators in the `agency.txt` of the GTFS feed at `path`; [] for a missing or unreadable feed."""
    try:
        with zipfile.ZipFile(path) as feed, feed.open("agency.txt") as agency:
            rows = list(csv.DictReader(io.TextIOWrapper(agency, encoding="utf-8-sig")))
    except (OSError, KeyError, zipfile.BadZipFile, UnicodeDecodeError, csv.Error):
        return []
    return [
        Operator(
            id=row["agency_id"].strip(),
            name=(row.get("agency_name") or "").strip() or row["agency_id"].strip(),
            url=(row.get("agency_url") or "").strip() or None,
        )
        for row in rows
        if (row.get("agency_id") or "").strip()
    ]


def feed_files(entries: Iterable[str]) -> list[Path]:
    """The feed files of `entries`: each entry is a GTFS zip file, or a directory whose `*.zip` files are feeds."""
    files: list[Path] = []
    for entry in entries:
        path = Path(entry)
        files.extend(sorted(path.glob("*.zip")) if path.is_dir() else [path])
    return files


class Operators:
    """
    Operators of the feeds `feeds()` names, each feed re-read when its file changes, merged with the operators
    passed to `remember`; a remembered operator replaces a feed's operator with the same id.
    """

    def __init__(self, feeds: Callable[[], Iterable[str]]):
        self._feeds = feeds
        self._read: dict[Path, tuple[float, list[Operator]]] = {}
        self._remembered: dict[str, Operator] = {}

    def remember(self, operators: Iterable[Operator | None]) -> None:
        for operator in operators:
            if operator is not None and (operator.id in self._remembered or len(self._remembered) < MAX_REMEMBERED):
                self._remembered[operator.id] = operator

    def _from_feeds(self) -> list[Operator]:
        found: list[Operator] = []
        for path in feed_files(self._feeds()):
            try:
                mtime = path.stat().st_mtime
            except OSError:
                continue
            cached = self._read.get(path)
            if cached is None or cached[0] != mtime:
                cached = self._read[path] = (mtime, feed_operators(path))
            found.extend(cached[1])
        return found

    async def all(self) -> list[Operator]:
        """Every known operator, each id once, unordered."""
        operators = {operator.id: operator for operator in await asyncio.to_thread(self._from_feeds)}
        operators.update(self._remembered)
        return list(operators.values())


def _settings_feeds() -> list[str]:
    from django.conf import settings

    return settings.TIMETABLE_FEEDS


known_operators = Operators(_settings_feeds)
