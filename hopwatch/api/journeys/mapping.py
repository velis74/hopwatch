"""Journeys between two places, mapped from MOTIS plan itineraries."""

import hashlib

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from hopwatch.api.departures.mapping import DelaySource, transport_mode
from hopwatch.api.operators.mapping import Operator, operator_from
from hopwatch.motis import JsonObject

ITINERARY_ID_LENGTH = 16


class LegMode(StrEnum):
    """How a leg is travelled: a kind of vehicle, or on foot."""

    RAIL = "rail"
    BUS = "bus"
    TRAM = "tram"
    OTHER = "other"
    WALK = "walk"


class LegStop(BaseModel):
    """Where a leg starts or ends."""

    id: str | None = Field(description="Stop id; null for a position that is not a stop (the start of a walk).")
    name: str = Field(description="Name of the stop or place.")
    lat: float = Field(description="Latitude (WGS 84).")
    lon: float = Field(description="Longitude (WGS 84).")
    scheduled: datetime = Field(description="Departure (at the start) or arrival (at the end) in the timetable, UTC.")
    expected: datetime | None = Field(
        description="That time expected from real-time data, UTC; null without real-time data."
    )
    platform: str | None = Field(description="Platform or track; null when the timetable publishes none.")


class Leg(BaseModel):
    """One part of a journey: a ride on one vehicle, or a walk."""

    mode: LegMode = Field(description="Kind of vehicle, or `walk`.")
    line: str | None = Field(description="Line or train name and number (`LPV 2420`); null for a walk.")
    headsign: str | None = Field(description="Destination shown on the vehicle; null for a walk.")
    operator: Operator | None = Field(
        description="Operator that runs the trip; null for a walk and when the timetable names none."
    )
    trip_id: str | None = Field(description="Trip id, valid for its service day; null for a walk.")
    from_: LegStop = Field(alias="from", description="Where the leg starts.")
    to: LegStop = Field(description="Where the leg ends.")
    delay_minutes: int | None = Field(
        description=(
            "Expected minus scheduled departure in whole minutes (the arrival where the departure has no real-time "
            "data; negative when early); null when unknown and for a walk."
        )
    )
    delay_source: DelaySource | None = Field(description="Source of `delay_minutes`; null when it is null.")
    intermediate_stops: list[str] = Field(description="Names of the stops between `from` and `to`, in order.")
    geometry: list[tuple[float, float]] = Field(description="Path of the leg as `[lat, lon]` points.")
    distance_m: int | None = Field(description="Length of a walk in metres; null for a ride.")
    ticket_url: str | None = Field(description="Web page where a ticket for the ride can be bought; null when none.")

    model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True)


class Itinerary(BaseModel):
    """One way of getting from the start to the destination."""

    id: str = Field(description="Identifier of the itinerary; the same for the same trips between the same stops.")
    scheduled_departure: datetime = Field(description="Departure from the start in the timetable, UTC.")
    expected_departure: datetime | None = Field(
        description="Departure expected from real-time data, UTC; null when no leg has real-time data."
    )
    scheduled_arrival: datetime = Field(description="Arrival at the destination in the timetable, UTC.")
    expected_arrival: datetime | None = Field(
        description="Arrival expected from real-time data, UTC; null when no leg has real-time data."
    )
    duration_minutes: int = Field(
        description="Time from departure to arrival in whole minutes, by the expected times where known."
    )
    transfers: int = Field(description="Number of changes between vehicles.")
    legs: list[Leg] = Field(description="The legs in order.")


class Journeys(BaseModel):
    """A page of itineraries."""

    itineraries: list[Itinerary] = Field(description="The itineraries in order of departure.")
    earlier_cursor: str | None = Field(
        description="`page_cursor` of the page with earlier itineraries; null when there is none."
    )
    later_cursor: str | None = Field(
        description="`page_cursor` of the page with later itineraries; null when there is none."
    )


def decode_polyline(encoded: str, precision: int = 5) -> list[tuple[float, float]]:
    """`[lat, lon]` points of a Google encoded polyline whose coordinates are scaled by `10 ** precision`."""
    points: list[tuple[float, float]] = []
    factor = 10**precision
    index = lat = lon = 0
    length = len(encoded)
    while index < length:
        deltas = []
        for _ in range(2):
            shift = result = 0
            while True:
                if index >= length:
                    return points
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lon += deltas[1]
        points.append((lat / factor, lon / factor))
    return points


def _time(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value).astimezone(UTC) if value else None


def _minutes(expected: datetime | None, scheduled: datetime | None) -> int | None:
    if expected is None or scheduled is None:
        return None
    return round((expected - scheduled).total_seconds() / 60)


def leg_stop(place: JsonObject, time_key: str, fallback: str | None, real_time: bool) -> LegStop:
    """
    The start (`time_key` "departure") or end ("arrival") of a leg; `fallback` is the leg's scheduled start or end,
    used where the place has no time.
    """
    scheduled_key = f"scheduled{time_key.capitalize()}"
    scheduled = _time(place.get(scheduled_key)) or _time(fallback) or _time(place.get(time_key))
    return LegStop(
        id=place.get("stopId") or None,
        name=place.get("name") or "",
        lat=place["lat"],
        lon=place["lon"],
        scheduled=scheduled,
        expected=_time(place.get(time_key)) if real_time else None,
        platform=place.get("track") or place.get("scheduledTrack") or None,
    )


def leg_from(leg: JsonObject) -> Leg:
    """The leg of a MOTIS itinerary leg."""
    walk = leg.get("mode") == "WALK"
    real_time = bool(leg.get("realTime")) and not walk
    start = leg_stop(leg["from"], "departure", leg.get("scheduledStartTime"), real_time)
    end = leg_stop(leg["to"], "arrival", leg.get("scheduledEndTime"), real_time)
    delay = _minutes(start.expected, start.scheduled)
    if delay is None:
        delay = _minutes(end.expected, end.scheduled)
    geometry = leg.get("legGeometry") or {}
    line = leg.get("displayName") or leg.get("routeShortName") or leg.get("tripShortName") or None
    return Leg(
        mode=LegMode.WALK if walk else LegMode(transport_mode(leg.get("routeType"), leg.get("mode")).value),
        line=None if walk else line,
        headsign=None if walk else leg.get("headsign") or None,
        operator=None if walk else operator_from(leg),
        trip_id=None if walk else leg.get("tripId") or None,
        from_=start,
        to=end,
        delay_minutes=delay,
        # The IJPP real-time feed (derp-si) predicts delays from vehicle positions (TransitClock).
        delay_source=DelaySource.ESTIMATE if delay is not None else None,
        intermediate_stops=[place.get("name") or "" for place in leg.get("intermediateStops") or []],
        geometry=decode_polyline(geometry.get("points") or "", geometry.get("precision", 5)),
        distance_m=round(leg["distance"]) if walk and leg.get("distance") is not None else None,
        ticket_url=(leg.get("ticketUrls") or {}).get("web") or None,
    )


def itinerary_id(legs: list[Leg]) -> str:
    """Hash of the rides (trip, boarding and alighting stop), or of the end points when there is no ride."""
    rides = [f"{leg.trip_id}|{leg.from_.id}|{leg.to.id}" for leg in legs if leg.mode is not LegMode.WALK]
    if not rides and legs:
        rides = [f"walk|{legs[0].from_.id or (legs[0].from_.lat, legs[0].from_.lon)}|{legs[-1].to.id}"]
    return hashlib.sha256("/".join(rides).encode()).hexdigest()[:ITINERARY_ID_LENGTH]


def itinerary_from(itinerary: JsonObject) -> Itinerary | None:
    """The itinerary of a MOTIS itinerary; None for one without legs."""
    legs = [leg_from(leg) for leg in itinerary.get("legs") or []]
    if not legs:
        return None
    real_time = any(leg.get("realTime") for leg in itinerary["legs"] if leg.get("mode") != "WALK")
    start = _time(itinerary.get("startTime")) or legs[0].from_.scheduled
    end = _time(itinerary.get("endTime")) or legs[-1].to.scheduled
    return Itinerary(
        id=itinerary_id(legs),
        scheduled_departure=legs[0].from_.scheduled,
        expected_departure=start if real_time else None,
        scheduled_arrival=legs[-1].to.scheduled,
        expected_arrival=end if real_time else None,
        duration_minutes=round((end - start).total_seconds() / 60),
        transfers=itinerary.get("transfers", max(sum(leg.mode is not LegMode.WALK for leg in legs) - 1, 0)),
        legs=legs,
    )


def journeys_from(plan: dict[str, Any]) -> Journeys:
    """The page of journeys of a MOTIS plan answer; walking-only connections (`direct`) are left out."""
    itineraries = [found for found in map(itinerary_from, plan.get("itineraries") or []) if found is not None]
    return Journeys(
        itineraries=itineraries,
        earlier_cursor=plan.get("previousPageCursor") or None,
        later_cursor=plan.get("nextPageCursor") or None,
    )
