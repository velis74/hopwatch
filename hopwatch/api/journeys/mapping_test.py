import pytest

from hopwatch.api.journeys.mapping import (
    decode_polyline,
    itinerary_from,
    journeys_from,
    leg_from,
    LegMode,
)
from hopwatch.conftest import sample

LJUBLJANA = "ijpp_1122804"
LESCE_BLED = "ijpp_1122816"


def rail_itinerary() -> dict:
    return sample("plan.json")["itineraries"][0]


def with_real_time(
    itinerary: dict, departure: str = "2026-11-27T15:24:00Z", arrival: str = "2026-11-27T16:20:00Z"
) -> dict:
    """The itinerary with real-time data on its only leg: departing at `departure`, arriving at `arrival`."""
    (leg,) = itinerary["legs"]
    leg["realTime"] = True
    leg["from"]["departure"] = leg["startTime"] = itinerary["startTime"] = departure
    leg["to"]["arrival"] = leg["endTime"] = itinerary["endTime"] = arrival
    return itinerary


def test_decode_polyline_precision_5():
    assert decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@") == [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]


def test_decode_polyline_precision_6():
    assert decode_polyline("_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI", 6) == [
        (38.5, -120.2),
        (40.7, -120.95),
        (43.252, -126.453),
    ]


def test_decode_polyline_empty_and_truncated():
    assert decode_polyline("") == []
    assert decode_polyline("_p~iF~ps|U_ulL") == [(38.5, -120.2)]


def test_ride_leg():
    leg = leg_from(rail_itinerary()["legs"][0])
    assert leg.mode is LegMode.RAIL
    assert leg.line == "LPV 2420"
    assert leg.headsign == "Ljubljana - Jesenice"
    assert leg.trip_id == "20261127_16:21_ijpp_453210"
    assert (leg.from_.id, leg.from_.name) == (LJUBLJANA, "Ljubljana")
    assert (leg.to.id, leg.to.name) == (LESCE_BLED, "Lesce-Bled")
    assert leg.from_.scheduled.isoformat() == "2026-11-27T15:21:00+00:00"
    assert leg.to.scheduled.isoformat() == "2026-11-27T16:18:00+00:00"
    assert leg.from_.expected is None
    assert leg.delay_minutes is None
    assert leg.delay_source is None
    assert leg.intermediate_stops[:3] == ["Litostroj", "Ljubljana Stegne", "Ljubljana Vižmarje"]
    assert len(leg.intermediate_stops) == 12
    assert leg.distance_m is None
    assert leg.ticket_url.startswith("https://karte.brezavta.si/ticket-deeplink/")


def test_ride_geometry_runs_from_the_start_to_the_end():
    leg = leg_from(rail_itinerary()["legs"][0])
    assert len(leg.geometry) > 100
    (start_lat, start_lon), (end_lat, end_lon) = leg.geometry[0], leg.geometry[-1]
    assert start_lat == pytest.approx(leg.from_.lat, abs=0.002)
    assert start_lon == pytest.approx(leg.from_.lon, abs=0.002)
    assert end_lat == pytest.approx(leg.to.lat, abs=0.002)
    assert end_lon == pytest.approx(leg.to.lon, abs=0.002)


def test_walk_leg():
    leg = leg_from(sample("plan.json")["itineraries"][1]["legs"][0])
    assert leg.mode is LegMode.WALK
    assert (leg.line, leg.headsign, leg.trip_id, leg.ticket_url) == (None, None, None, None)
    assert leg.distance_m == 241
    assert leg.delay_minutes is None
    assert leg.to.name == "Ljubljana AP"
    assert leg.geometry


def test_bus_leg_by_route_type():
    leg = leg_from(sample("plan.json")["itineraries"][1]["legs"][1])
    assert leg.mode is LegMode.BUS
    assert leg.line == "A6370"


def test_leg_with_real_time_data():
    (leg,) = with_real_time(rail_itinerary())["legs"]
    leg["to"]["track"] = "2"
    mapped = leg_from(leg)
    assert mapped.from_.expected.isoformat() == "2026-11-27T15:24:00+00:00"
    assert mapped.to.expected.isoformat() == "2026-11-27T16:20:00+00:00"
    assert mapped.delay_minutes == 3
    assert mapped.delay_source == "estimate"
    assert mapped.to.platform == "2"


def test_delay_from_the_arrival_when_the_departure_has_none():
    (leg,) = with_real_time(rail_itinerary())["legs"]
    del leg["from"]["departure"]
    assert leg_from(leg).delay_minutes == 2


def test_itinerary_without_real_time_data():
    itinerary = itinerary_from(rail_itinerary())
    assert itinerary.scheduled_departure.isoformat() == "2026-11-27T15:21:00+00:00"
    assert itinerary.scheduled_arrival.isoformat() == "2026-11-27T16:18:00+00:00"
    assert itinerary.expected_departure is None
    assert itinerary.expected_arrival is None
    assert itinerary.duration_minutes == 57
    assert itinerary.transfers == 0


def test_itinerary_with_real_time_data():
    itinerary = itinerary_from(with_real_time(rail_itinerary()))
    assert itinerary.scheduled_departure.isoformat() == "2026-11-27T15:21:00+00:00"
    assert itinerary.expected_departure.isoformat() == "2026-11-27T15:24:00+00:00"
    assert itinerary.expected_arrival.isoformat() == "2026-11-27T16:20:00+00:00"
    assert itinerary.duration_minutes == 56


def test_itinerary_id_is_stable_for_the_same_trips():
    plain = itinerary_from(rail_itinerary())
    delayed = itinerary_from(with_real_time(rail_itinerary()))
    others = [itinerary_from(found) for found in sample("plan.json")["itineraries"][1:]]
    assert plain.id == delayed.id
    assert len({plain.id, *(other.id for other in others)}) == 3


def test_itinerary_without_legs_is_left_out():
    assert itinerary_from({"legs": []}) is None


def test_journeys_keep_motis_order_and_cursors():
    journeys = journeys_from(sample("plan.json"))
    assert [len(itinerary.legs) for itinerary in journeys.itineraries] == [1, 4, 2]
    assert [itinerary.transfers for itinerary in journeys.itineraries] == [0, 1, 0]
    assert journeys.earlier_cursor == "EARLIER|1795791600"
    assert journeys.later_cursor == "LATER|1795797720"


def test_journeys_without_cursors():
    journeys = journeys_from({"itineraries": [], "previousPageCursor": "", "direct": []})
    assert journeys.itineraries == []
    assert journeys.earlier_cursor is None
    assert journeys.later_cursor is None


def test_journeys_serialise_with_from_and_utc_times():
    data = journeys_from(sample("plan.json")).model_dump(mode="json")
    leg = data["itineraries"][0]["legs"][0]
    assert set(leg) >= {"from", "to"}
    assert "from_" not in leg
    assert leg["from"]["scheduled"] == "2026-11-27T15:21:00Z"
    assert data["itineraries"][0]["scheduled_departure"] == "2026-11-27T15:21:00Z"
    assert leg["mode"] == "rail"
    assert isinstance(leg["geometry"][0], list)
