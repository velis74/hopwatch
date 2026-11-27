"""Async client of the MOTIS API (stops, stop search, departures, trips)."""

import asyncio
import time
import weakref

from collections import OrderedDict
from collections.abc import Awaitable, Callable
from datetime import datetime, UTC
from typing import Any

import httpx

from fastapi_viewsets.exceptions import DfViewSetError
from fastapi_viewsets.response_classes import error_entry

ERROR_NAMESPACE = "hopwatch"

JsonObject = dict[str, Any]

DATA_ATTRIBUTION = (
    "Timetable and real-time data: Družba za upravljanje javnega potniškega prometa (DUJPP), nap.si "
    "(https://nap.si); SŽ – Potniški promet. Licence: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)."
)


class MotisUnavailableError(DfViewSetError):
    """MOTIS did not answer, or answered with an error the request cannot be served from."""

    def __init__(self, reason: str):
        super().__init__(
            502, "The timetable service is unavailable", f"{ERROR_NAMESPACE}.motis_unavailable", {"reason": reason}
        )


MOTIS_UNAVAILABLE_RESPONSE = error_entry(
    502,
    "MOTIS, the timetable service, did not answer: `hopwatch.motis_unavailable`.",
    MotisUnavailableError("ConnectError"),
)


class MotisNotFoundError(Exception):
    """MOTIS answered 404: the stop or trip it was asked about does not exist."""


def motis_time(moment: datetime) -> str:
    """`moment` in the form MOTIS parses: UTC, whole seconds, `Z` (fractional seconds make MOTIS ignore it)."""
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class MotisClient:
    """Reads the MOTIS API at `base_url`; every failure to get an answer raises `MotisUnavailableError`."""

    def __init__(self, base_url: str, *, timeout: float = 10.0, transport: httpx.AsyncBaseTransport | None = None):
        self._http = httpx.AsyncClient(base_url=base_url, timeout=timeout, transport=transport)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _get(self, path: str, params: dict[str, Any], *, not_found_ok: bool = False) -> Any:
        """GET `path`; a 404 raises `MotisNotFoundError` when `not_found_ok`, else `MotisUnavailableError`."""
        try:
            response = await self._http.get(path, params=params)
        except httpx.HTTPError as error:
            raise MotisUnavailableError(type(error).__name__) from error
        if response.status_code == 404 and not_found_ok:
            raise MotisNotFoundError(response.text)
        if response.is_error:
            raise MotisUnavailableError(f"http_{response.status_code}")
        try:
            return response.json()
        except ValueError as error:
            raise MotisUnavailableError("invalid_json") from error

    async def stops_in_box(self, lat_min: float, lon_min: float, lat_max: float, lon_max: float) -> list[JsonObject]:
        """Stops inside the bounding box (MOTIS `Place` objects)."""
        return await self._get("/api/v6/map/stops", {"min": f"{lat_min},{lon_min}", "max": f"{lat_max},{lon_max}"})

    async def geocode_stops(self, text: str, num_results: int) -> list[JsonObject]:
        """Stops whose name matches `text` (MOTIS `Match` objects, best first; may repeat a stop)."""
        return await self._get("/api/v1/geocode", {"text": text, "type": "STOP", "numResults": num_results})

    async def stop_times(self, stop_id: str, start: datetime, window_seconds: int) -> JsonObject:
        """
        Departures from `stop_id` from `start` on, with each trip's later stops (`nextStops`). MOTIS returns at least
        one departure, which may lie beyond the window. Raises `MotisNotFoundError` for an unknown stop.
        """
        return await self._get(
            "/api/v6/stoptimes",
            {
                "stopId": stop_id,
                "time": motis_time(start),
                "window": window_seconds,
                "n": 1,
                "fetchStops": "true",
                "withAlerts": "false",
            },
            not_found_ok=True,
        )

    async def trip(self, trip_id: str) -> JsonObject:
        """
        The trip as an itinerary (`legs[]` with `from`, `intermediateStops`, `to`). Raises `MotisNotFoundError` for an
        unknown trip.
        """
        return await self._get("/api/v6/trip", {"tripId": trip_id, "detailedLegs": "false"}, not_found_ok=True)


_clients: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, MotisClient]" = weakref.WeakKeyDictionary()


def get_motis() -> MotisClient:
    """The client for `settings.MOTIS_URL`, one per event loop."""
    from django.conf import settings

    loop = asyncio.get_running_loop()
    client = _clients.get(loop)
    if client is None:
        client = _clients[loop] = MotisClient(settings.MOTIS_URL)
    return client


class TtlCache:
    """In-memory cache of awaited values with a lifetime and a size bound (oldest entries evicted first)."""

    def __init__(self, ttl_seconds: float, max_entries: int, clock: Callable[[], float] = time.monotonic):
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._clock = clock
        self._entries: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    async def get_or_load(self, key: str, load: Callable[[], Awaitable[Any]]) -> Any:
        now = self._clock()
        entry = self._entries.get(key)
        if entry is not None and entry[0] > now:
            return entry[1]
        value = await load()
        self._entries[key] = (now + self.ttl_seconds, value)
        self._entries.move_to_end(key)
        while len(self._entries) > self.max_entries:
            self._entries.popitem(last=False)
        return value
