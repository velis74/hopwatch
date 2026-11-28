"""One ride of a vehicle (a trip) with all its stops, mapped from a MOTIS trip itinerary."""

from datetime import datetime, UTC
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

from hopwatch.api.departures.mapping import DelaySource, stop_zone, transport_mode, TransportMode
from hopwatch.api.geometry import simplify
from hopwatch.api.journeys.mapping import decode_polyline
from hopwatch.api.operators.mapping import Operator, operator_from
from hopwatch.motis import JsonObject


class TripStop(BaseModel):
    """One call of the vehicle at a stop."""

    id: str = Field(description="Stop id, as `/stops` returns it.")
    name: str = Field(description="Name of the stop as the timetable publishes it.")
    lat: float = Field(description="Latitude (WGS 84).")
    lon: float = Field(description="Longitude (WGS 84).")
    scheduled_arrival: datetime | None = Field(
        description="Arrival in the timetable, in the stop's time zone; null at the first stop."
    )
    expected_arrival: datetime | None = Field(
        description="Arrival expected from real-time data, in the stop's time zone; null without real-time data."
    )
    scheduled_departure: datetime | None = Field(
        description="Departure in the timetable, in the stop's time zone; null at the last stop."
    )
    expected_departure: datetime | None = Field(
        description="Departure expected from real-time data, in the stop's time zone; null without real-time data."
    )
    time_zone: str = Field(
        description=(
            "IANA time zone of the stop (`Europe/Ljubljana`), in which the times are local transport time; `UTC` when "
            "the timetable names no known zone."
        )
    )
    delay_minutes: int | None = Field(
        description=(
            "Expected minus scheduled departure in whole minutes (the arrival where there is no departure, as at "
            "the last stop; negative when early); null when unknown."
        )
    )
    delay_source: DelaySource | None = Field(description="Source of `delay_minutes`; null when it is null.")
    platform: str | None = Field(description="Platform or track; null when the timetable publishes none.")
    cancelled: bool = Field(description="Whether the vehicle no longer calls at this stop.")
    passed: bool = Field(
        description=(
            "Whether the vehicle has left the stop: its departure (the arrival at the last stop), expected where "
            "known, else scheduled, is in the past."
        )
    )


class Trip(BaseModel):
    """One ride of a vehicle from its first to its last stop."""

    trip_id: str = Field(description="Trip id; contains the service date, so it is valid for that day only.")
    mode: TransportMode = Field(description="Kind of vehicle.")
    line: str = Field(description="Line or train name and number as the operator shows it (`IC 502`, `LPV 2415`).")
    headsign: str = Field(description="Destination shown on the vehicle.")
    operator: Operator | None = Field(description="Operator that runs the trip; null when the timetable names none.")
    cancelled: bool = Field(description="Whether the whole ride is cancelled.")
    bikes_allowed: bool | None = Field(
        description=(
            "True when the timetable states that bicycles may be taken on the vehicle; null when it does not state "
            "it (the timetable does not tell that apart from bicycles not being allowed)."
        )
    )
    wheelchair_accessible: bool | None = Field(
        description=(
            "True when the timetable states that the vehicle takes wheelchairs; null when it does not state it (the "
            "timetable does not tell that apart from the vehicle not being accessible)."
        )
    )
    ticket_url: str | None = Field(description="Web page where a ticket for the ride can be bought; null when none.")
    geometry: list[tuple[float, float]] = Field(description="Path of the ride as `[lat, lon]` points.")
    stops: list[TripStop] = Field(description="Every stop of the ride, in order.")


def _time(value: str | None, zone: ZoneInfo) -> datetime | None:
    return datetime.fromisoformat(value).astimezone(zone) if value else None


def _minutes(expected: datetime | None, scheduled: datetime | None) -> int | None:
    if expected is None or scheduled is None:
        return None
    return round((expected - scheduled).total_seconds() / 60)


def trip_stop(place: JsonObject, real_time: bool, now: datetime) -> TripStop:
    """The call at a MOTIS place of a trip leg; `real_time` is whether the leg carries real-time data."""
    zone = stop_zone(place.get("tz"))
    scheduled_arrival = _time(place.get("scheduledArrival"), zone)
    scheduled_departure = _time(place.get("scheduledDeparture"), zone)
    expected_arrival = _time(place.get("arrival"), zone) if real_time else None
    expected_departure = _time(place.get("departure"), zone) if real_time else None
    delay = _minutes(expected_departure, scheduled_departure)
    if delay is None:
        delay = _minutes(expected_arrival, scheduled_arrival)
    leaves = expected_departure or scheduled_departure or expected_arrival or scheduled_arrival
    return TripStop(
        id=place.get("stopId") or "",
        name=place.get("name") or "",
        lat=place["lat"],
        lon=place["lon"],
        scheduled_arrival=scheduled_arrival,
        expected_arrival=expected_arrival,
        scheduled_departure=scheduled_departure,
        expected_departure=expected_departure,
        time_zone=zone.key,
        delay_minutes=delay,
        # The IJPP real-time feed (derp-si) predicts delays from vehicle positions (TransitClock).
        delay_source=DelaySource.ESTIMATE if delay is not None else None,
        platform=place.get("track") or place.get("scheduledTrack") or None,
        cancelled=bool(place.get("cancelled")),
        passed=leaves is not None and leaves < now,
    )


def _merge(stops: list[TripStop], stop: TripStop) -> None:
    """Appends `stop`; the arrival leg's end and the next leg's start at the same stop become one call."""
    last = stops[-1] if stops else None
    if last is None or last.id != stop.id:
        stops.append(stop)
        return
    stops[-1] = TripStop.model_validate(
        last.model_dump()
        | {
            key: value
            for key, value in stop.model_dump().items()
            if key in ("scheduled_departure", "expected_departure", "delay_minutes", "delay_source", "passed")
        }
        | {"platform": last.platform or stop.platform, "cancelled": last.cancelled and stop.cancelled}
    )


def trip_from(trip: JsonObject, trip_id: str, now: datetime | None = None) -> Trip | None:
    """The ride of a MOTIS trip itinerary; None for one without legs."""
    legs = trip.get("legs") or []
    if not legs:
        return None
    now = now or datetime.now(UTC)
    first = legs[0]
    stops: list[TripStop] = []
    geometry: list[tuple[float, float]] = []
    for leg in legs:
        real_time = bool(leg.get("realTime"))
        for place in (leg["from"], *(leg.get("intermediateStops") or []), leg["to"]):
            _merge(stops, trip_stop(place, real_time, now))
        path = leg.get("legGeometry") or {}
        points = decode_polyline(path.get("points") or "", path.get("precision", 5))
        geometry.extend(points[1:] if geometry and points and points[0] == geometry[-1] else points)
    return Trip(
        trip_id=trip_id,
        mode=transport_mode(first.get("routeType"), first.get("mode")),
        line=first.get("displayName") or first.get("routeShortName") or first.get("tripShortName") or "",
        headsign=first.get("headsign") or (first.get("tripTo") or {}).get("name") or stops[-1].name,
        operator=operator_from(first),
        cancelled=any(leg.get("cancelled") or leg.get("tripCancelled") for leg in legs),
        # GTFS "no information" reaches the timetable answer as false / NOT_ACCESSIBLE, so only a positive value is
        # known.
        bikes_allowed=True if all(leg.get("bikesAllowed") is True for leg in legs) else None,
        wheelchair_accessible=True if all(leg.get("wheelchairAccessible") == "ACCESSIBLE" for leg in legs) else None,
        ticket_url=next((url for leg in legs if (url := (leg.get("ticketUrls") or {}).get("web"))), None),
        geometry=simplify(geometry),
        stops=stops,
    )
