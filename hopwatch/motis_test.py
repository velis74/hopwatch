import asyncio

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
