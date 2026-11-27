"""Departures from a stop, mapped from MOTIS stop times."""

import asyncio

from datetime import datetime, timedelta, UTC
from enum import StrEnum
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field

from hopwatch.api.stops.matching import matches_word_prefixes, words
from hopwatch.motis import JsonObject, MotisClient, MotisNotFoundError, TtlCache

# Trip stop lists change only with real-time cancellations of single stops; a short lifetime keeps them current.
TRIP_STOPS_TTL_SECONDS = 300
TRIP_STOPS_MAX_ENTRIES = 5000
TRIP_FETCH_CONCURRENCY = 8

_RAIL_MODES = {
    "RAIL",
    "HIGHSPEED_RAIL",
    "LONG_DISTANCE",
    "NIGHT_RAIL",
    "REGIONAL_FAST_RAIL",
    "REGIONAL_RAIL",
    "SUBURBAN",
}
_BUS_MODES = {"BUS", "COACH"}


class TransportMode(StrEnum):
    """Kind of vehicle."""

    RAIL = "rail"
    BUS = "bus"
    TRAM = "tram"
    OTHER = "other"


class DelaySource(StrEnum):
    """Where a delay comes from: the operator's real-time data, riders' shared positions, or an estimate."""

    OFFICIAL = "official"
    RIDERS = "riders"
    ESTIMATE = "estimate"


class Departure(BaseModel):
    """One departure of a vehicle from the stop."""

    trip_id: str = Field(description="MOTIS trip id; contains the service date, so it is valid for that day only.")
    mode: TransportMode = Field(description="Kind of vehicle.")
    line: str = Field(description="Line or train name and number as the operator shows it (`EC 214`, `LPV 2415`).")
    headsign: str = Field(description="Destination shown on the vehicle.")
    scheduled_departure: datetime = Field(description="Departure time in the timetable, in the stop's time zone.")
    expected_departure: datetime | None = Field(
        description="Departure time expected from real-time data, in the stop's time zone; null without real-time data."
    )
    delay_minutes: int | None = Field(
        description="Expected minus scheduled departure in whole minutes (negative when early); null when unknown."
    )
    delay_source: DelaySource | None = Field(description="Source of `delay_minutes`; null when it is null.")
    platform: str | None = Field(description="Platform or track; null when the timetable publishes none.")
    next_stops: list[str] = Field(description="Names of the later stops where passengers may alight, in order.")


def transport_mode(route_type: int | None, motis_mode: str | None) -> TransportMode:
    """Kind of vehicle from the GTFS route type (basic or extended), else from the MOTIS mode."""
    if route_type is not None:
        if route_type == 2 or 100 <= route_type < 200:
            return TransportMode.RAIL
        if route_type in (3, 11) or 200 <= route_type < 300 or 700 <= route_type < 900:
            return TransportMode.BUS
        if route_type == 0 or 900 <= route_type < 1000:
            return TransportMode.TRAM
        return TransportMode.OTHER
    if motis_mode in _RAIL_MODES:
        return TransportMode.RAIL
    if motis_mode in _BUS_MODES:
        return TransportMode.BUS
    if motis_mode == "TRAM":
        return TransportMode.TRAM
    return TransportMode.OTHER


def _zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name) if name else ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _time(value: str | None, zone: ZoneInfo) -> datetime | None:
    return datetime.fromisoformat(value).astimezone(zone) if value else None


def _alights(place: JsonObject) -> bool:
    return place.get("dropoffType") != "NOT_ALLOWED" and not place.get("cancelled", False)


def stop_names(places: list[JsonObject]) -> list[str]:
    """Names of the places where passengers may alight."""
    return [place["name"] for place in places if _alights(place)]


def trip_stops(trip: JsonObject) -> list[JsonObject]:
    """Every stop of a MOTIS trip itinerary in order: each leg's `from`, `intermediateStops` and `to`, once."""
    stops: list[JsonObject] = []
    for leg in trip.get("legs", []):
        for place in (leg["from"], *leg.get("intermediateStops", []), leg["to"]):
            last = stops[-1] if stops else None
            if last is None or last.get("stopId") != place.get("stopId"):
                stops.append(place)
    return stops


def stops_after(stops: list[JsonObject], stop_id: str, scheduled_departure: str | None) -> list[JsonObject]:
    """
    The stops after the visit of `stop_id` that departs at `scheduled_departure` (a trip may call at a stop twice);
    after the first visit when no visit departs then, and none when the trip does not call at `stop_id`.
    """
    visits = [index for index, place in enumerate(stops) if place.get("stopId") == stop_id]
    if not visits:
        return []
    timed = [index for index in visits if stops[index].get("scheduledDeparture") == scheduled_departure]
    return stops[(timed or visits)[0] + 1 :]


def departure_from(stop_time: JsonObject, next_stops: list[str]) -> Departure | None:
    """The departure of a MOTIS stop time; None for a cancelled one or one without a departure time."""
    place = stop_time["place"]
    if stop_time.get("cancelled") or stop_time.get("tripCancelled") or place.get("cancelled"):
        return None
    zone = _zone(place.get("tz"))
    scheduled = _time(place.get("scheduledDeparture"), zone)
    if scheduled is None:
        return None
    expected = _time(place.get("departure"), zone) if stop_time.get("realTime") else None
    delay = round((expected - scheduled).total_seconds() / 60) if expected else None
    return Departure(
        trip_id=stop_time["tripId"],
        mode=transport_mode(stop_time.get("routeType"), stop_time.get("mode")),
        line=stop_time.get("displayName") or stop_time.get("routeShortName") or stop_time.get("tripShortName") or "",
        headsign=stop_time.get("headsign") or (stop_time.get("tripTo") or {}).get("name") or "",
        scheduled_departure=scheduled,
        expected_departure=expected,
        delay_minutes=delay,
        delay_source=DelaySource.OFFICIAL if delay is not None else None,
        platform=place.get("track") or place.get("scheduledTrack") or None,
        next_stops=next_stops,
    )


def departure_time(departure: Departure) -> datetime:
    """The expected departure, else the scheduled one."""
    return departure.expected_departure or departure.scheduled_departure


def calls_at(departure: Departure, destination: str) -> bool:
    """Whether a later stop of the departure matches `destination` word by word, ignoring case and accents."""
    return any(matches_word_prefixes(name, destination) for name in departure.next_stops)


class TripStops:
    """Stop lists of trips read from MOTIS, cached for `TRIP_STOPS_TTL_SECONDS`."""

    def __init__(self, cache: TtlCache | None = None):
        self.cache = cache or TtlCache(TRIP_STOPS_TTL_SECONDS, TRIP_STOPS_MAX_ENTRIES)

    async def of(self, motis: MotisClient, trip_id: str) -> list[JsonObject]:
        async def load() -> list[JsonObject]:
            try:
                return trip_stops(await motis.trip(trip_id))
            except MotisNotFoundError:
                return []

        return await self.cache.get_or_load(trip_id, load)


trip_stops_cache = TripStops()


async def later_stops(motis: MotisClient, stop_times: list[JsonObject], trips: TripStops) -> list[list[str]]:
    """
    Names of the later stops of every stop time: from its `nextStops`, or, when MOTIS left them out, from the trip's
    stop list.
    """
    semaphore = asyncio.Semaphore(TRIP_FETCH_CONCURRENCY)

    async def names(stop_time: JsonObject) -> list[str]:
        if stop_time.get("nextStops") is not None:
            return stop_names(stop_time["nextStops"])
        async with semaphore:
            stops = await trips.of(motis, stop_time["tripId"])
        place = stop_time["place"]
        return stop_names(stops_after(stops, place.get("stopId"), place.get("scheduledDeparture")))

    return list(await asyncio.gather(*(names(stop_time) for stop_time in stop_times)))


async def departures(
    motis: MotisClient,
    stop_id: str,
    *,
    destination: str | None,
    window_minutes: int,
    now: datetime | None = None,
    trips: TripStops = trip_stops_cache,
) -> list[Departure]:
    """
    Departures from `stop_id` in the next `window_minutes`, in order of departure, optionally only those calling at
    `destination` later. Raises `MotisNotFoundError` for an unknown stop.
    """
    now = now or datetime.now(UTC)
    response: dict[str, Any] = await motis.stop_times(stop_id, now, window_minutes * 60)
    stop_times = response.get("stopTimes", [])
    end = now + timedelta(minutes=window_minutes)
    found = []
    for stop_time, next_stops in zip(stop_times, await later_stops(motis, stop_times, trips), strict=True):
        departure = departure_from(stop_time, next_stops)
        if departure is not None and departure_time(departure) <= end:
            found.append(departure)
    if destination and words(destination):
        found = [departure for departure in found if calls_at(departure, destination)]
    return sorted(found, key=lambda departure: (departure_time(departure), departure.scheduled_departure))
