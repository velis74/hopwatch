"""Shared fixtures: the API under test with MOTIS answered from `motis/samples/`."""

import copy
import functools
import json
import re
import weakref

from collections.abc import Callable
from datetime import datetime, timedelta, UTC
from pathlib import Path
from typing import Any

import httpx
import pytest

from django.conf import settings

SAMPLES = Path(__file__).parents[1] / "motis" / "samples"
_ISO_TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$")

Answer = httpx.Response | Callable[[httpx.Request], httpx.Response] | Any


def sample(name: str) -> Any:
    return json.loads((SAMPLES / name).read_text(encoding="utf-8"))


def shift_times(data: Any, delta: timedelta) -> Any:
    """`data` with every ISO 8601 timestamp moved by `delta`, kept in UTC with a `Z` suffix."""
    if isinstance(data, dict):
        return {key: shift_times(value, delta) for key, value in data.items()}
    if isinstance(data, list):
        return [shift_times(value, delta) for value in data]
    if isinstance(data, str) and _ISO_TIME.match(data):
        moved = datetime.fromisoformat(data).astimezone(UTC) + delta
        return moved.strftime("%Y-%m-%dT%H:%M:%SZ")
    return data


def stop_times_from_now(first_departure_in: timedelta = timedelta(minutes=5)) -> dict:
    """The `stoptimes.json` sample moved so that its first scheduled departure is `first_departure_in` from now."""
    response = sample("stoptimes.json")
    first = min(datetime.fromisoformat(stop_time["place"]["scheduledDeparture"]) for stop_time in response["stopTimes"])
    return shift_times(response, datetime.now(UTC).replace(second=0, microsecond=0) + first_departure_in - first)


class FakeMotis:
    """MOTIS at `settings.MOTIS_URL`: answers the paths it is given and records every request."""

    def __init__(self):
        self.answers: dict[str, Answer] = {}
        self.requests: list[httpx.Request] = []
        self.unanswered: list[str] = []

    def answer(self, path: str, answer: Answer) -> None:
        """Answer GET `path` with a JSON body, an `httpx.Response` or a handler of the request."""
        self.answers[path] = answer

    def answer_by_param(self, path: str, param: str, answers: dict[str, Any]) -> None:
        """
        Answer GET `path` by the value of the query parameter `param`: the JSON body or `httpx.Response` of
        `answers[value]`, a 404 for a value not in `answers`.
        """

        def handler(request: httpx.Request) -> httpx.Response:
            value = request.url.params.get(param)
            if value not in answers:
                return httpx.Response(404, json={"error": f'Could not find timetable location "{value}"'})
            answer = answers[value]
            return answer if isinstance(answer, httpx.Response) else httpx.Response(200, json=copy.deepcopy(answer))

        self.answers[path] = handler

    def requests_to(self, path: str) -> list[httpx.Request]:
        return [request for request in self.requests if request.url.path == path]

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if not str(request.url).startswith(settings.MOTIS_URL) or request.url.path not in self.answers:
            self.unanswered.append(str(request.url))
            return httpx.Response(500, text="unexpected request")
        answer = self.answers[request.url.path]
        if callable(answer):
            return answer(request)
        if isinstance(answer, httpx.Response):
            return answer
        return httpx.Response(200, json=copy.deepcopy(answer))


@pytest.fixture
def motis(monkeypatch) -> FakeMotis:
    """MOTIS answered by a `FakeMotis`; the test fails if the API asks it for anything not answered."""
    import hopwatch.motis

    from hopwatch.api.departures import mapping

    fake = FakeMotis()
    transport = httpx.MockTransport(fake.handle)
    monkeypatch.setattr(hopwatch.motis, "_clients", weakref.WeakKeyDictionary())
    monkeypatch.setattr(
        hopwatch.motis, "MotisClient", functools.partial(hopwatch.motis.MotisClient, transport=transport)
    )
    monkeypatch.setattr(
        mapping.trip_stops_cache,
        "cache",
        hopwatch.motis.TtlCache(mapping.TRIP_STOPS_TTL_SECONDS, mapping.TRIP_STOPS_MAX_ENTRIES),
    )
    yield fake
    if fake.unanswered:
        pytest.fail(f"MOTIS was asked for unanswered URLs: {fake.unanswered}")


@pytest.fixture
def api():
    from fastapi.testclient import TestClient

    from hopwatch.api.main import app

    return TestClient(app)
