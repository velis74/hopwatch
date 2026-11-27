import asyncio

from datetime import datetime, timedelta, timezone

import httpx
import pytest

from django.conf import settings

from hopwatch.motis import get_motis, MotisClient, MotisNotFoundError, MotisUnavailableError


class RecordingTransport(httpx.MockTransport):
    def __init__(self, handler):
        super().__init__(handler)
        self.closed = False

    async def aclose(self) -> None:
        self.closed = True


def test_closing_the_client_closes_its_transport():
    transport = RecordingTransport(lambda _request: httpx.Response(200, json=[]))
    client = MotisClient("http://motis.test", transport=transport)

    async def scenario():
        assert await client.stops_in_box(46.0, 14.4, 46.1, 14.6) == []
        await client.aclose()

    asyncio.run(scenario())
    assert transport.closed


def test_unknown_trip_raises_not_found_and_other_errors_unavailable():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404 if request.url.path == "/api/v6/trip" else 502, text="error")

    client = MotisClient("http://motis.test", transport=httpx.MockTransport(handler))

    with pytest.raises(MotisNotFoundError):
        asyncio.run(client.trip("20261127_08:56_ijpp_0"))
    with pytest.raises(MotisUnavailableError) as error:
        asyncio.run(client.geocode_stops("ljub", 10))
    assert error.value.status_code == 502


def test_one_client_per_event_loop_for_the_configured_url(motis):
    motis.answer("/api/v6/map/stops", [])

    async def twice():
        first, second = get_motis(), get_motis()
        await first.stops_in_box(46.0, 14.4, 46.1, 14.6)
        return first, second

    first, second = asyncio.run(twice())
    other, _ = asyncio.run(twice())

    assert first is second
    assert other is not first
    assert all(str(request.url).startswith(f"{settings.MOTIS_URL}/api/v6/map/stops") for request in motis.requests)


def plan_client(requests: list[httpx.Request], status: int = 200) -> MotisClient:
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if status == 404:
            return httpx.Response(404, json={"error": 'Could not find timetable location "ijpp_0"'})
        return httpx.Response(status, json={"itineraries": []})

    return MotisClient("http://motis.test", transport=httpx.MockTransport(handler))


def test_plan_asks_for_the_places_time_and_page():
    requests: list[httpx.Request] = []
    client = plan_client(requests)

    answer = asyncio.run(
        client.plan(
            "46.0584,14.5127",
            "ijpp_1122816",
            at=datetime(2026, 11, 27, 17, 30, 15, 500, tzinfo=timezone(timedelta(hours=1))),
            arrive_by=True,
            page_cursor="LATER|1795797720",
        )
    )

    assert answer == {"itineraries": []}
    (request,) = requests
    assert request.url.path == "/api/v5/plan"
    assert dict(request.url.params) == {
        "fromPlace": "46.0584,14.5127",
        "toPlace": "ijpp_1122816",
        "arriveBy": "true",
        "time": "2026-11-27T16:30:15Z",
        "pageCursor": "LATER|1795797720",
    }


def test_plan_leaves_out_what_is_not_given():
    requests: list[httpx.Request] = []

    asyncio.run(plan_client(requests).plan("ijpp_1122804", "ijpp_1122816"))

    assert dict(requests[0].url.params) == {"fromPlace": "ijpp_1122804", "toPlace": "ijpp_1122816", "arriveBy": "false"}


def test_plan_of_an_unknown_stop_raises_not_found():
    with pytest.raises(MotisNotFoundError) as error:
        asyncio.run(plan_client([], status=404).plan("ijpp_0", "ijpp_1122816"))
    assert "ijpp_0" in str(error.value)
    with pytest.raises(MotisUnavailableError):
        asyncio.run(plan_client([], status=500).plan("ijpp_1122804", "ijpp_1122816"))
