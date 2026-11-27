from datetime import datetime, timedelta, UTC

from hopwatch.api.geometry import simplify
from hopwatch.api.journeys.mapping import decode_polyline
from hopwatch.api.trips.mapping import trip_from
from hopwatch.conftest import sample

TRIP_ID = "20261127_15:05_ijpp_462146"
# The detailed sample is IC 502 Koper - Hodoš, 6 minutes late from Pivka on.
BEFORE_LJUBLJANA = datetime(2026, 11, 27, 16, 30, tzinfo=UTC)


def detailed() -> dict:
    return sample("trip-detailed.json")


def test_every_stop_in_order_with_times_and_delays():
    trip = trip_from(detailed(), TRIP_ID, now=BEFORE_LJUBLJANA)

    assert [stop.name for stop in trip.stops][:3] == ["Koper", "Hrpelje-Kozina", "Divača"]
    assert trip.stops[-1].name == "Hodoš"
    assert len(trip.stops) == 25
    first, ljubljana, last = trip.stops[0], trip.stops[8], trip.stops[-1]
    assert first.scheduled_arrival is None
    assert first.scheduled_departure is not None
    assert last.scheduled_departure is None
    assert last.scheduled_arrival is not None
    assert ljubljana.name == "Ljubljana"
    assert ljubljana.scheduled_departure == datetime(2026, 11, 27, 16, 50, tzinfo=UTC)
    assert ljubljana.expected_departure - ljubljana.scheduled_departure == timedelta(minutes=6)
    assert ljubljana.expected_arrival - ljubljana.scheduled_arrival == timedelta(minutes=6)
    assert ljubljana.scheduled_departure.utcoffset() == timedelta(hours=1)
    assert (ljubljana.delay_minutes, ljubljana.delay_source) == (6, "estimate")
    assert (first.delay_minutes, first.delay_source) == (0, "estimate")
    assert last.delay_minutes == 6  # from the arrival


def test_passed_stops_by_expected_departure():
    trip = trip_from(detailed(), TRIP_ID, now=BEFORE_LJUBLJANA)

    passed = [stop.name for stop in trip.stops if stop.passed]
    # Borovnica departs at 16:18 scheduled, 16:24 expected; Ljubljana at 16:56 expected.
    assert passed[-1] == "Borovnica"
    assert not trip.stops[8].passed
    assert not trip.stops[-1].passed


def test_passed_by_scheduled_time_without_real_time_data():
    data = detailed()
    data["legs"][0]["realTime"] = False

    trip = trip_from(data, TRIP_ID, now=datetime(2026, 11, 27, 16, 51, tzinfo=UTC))

    ljubljana = trip.stops[8]
    assert ljubljana.passed
    assert ljubljana.expected_departure is None
    assert ljubljana.expected_arrival is None
    assert ljubljana.delay_minutes is None
    assert ljubljana.delay_source is None


def test_ride_attributes():
    trip = trip_from(detailed(), TRIP_ID)

    assert trip.trip_id == TRIP_ID
    assert (trip.mode, trip.line, trip.headsign) == ("rail", "IC 502", "Koper - Hodoš")
    assert trip.operator.id == "1161"
    assert trip.cancelled is False
    assert trip.ticket_url is None
    leg_geometry = detailed()["legs"][0]["legGeometry"]
    full = decode_polyline(leg_geometry["points"], leg_geometry["precision"])
    assert trip.geometry == simplify(full)
    assert (trip.geometry[0], trip.geometry[-1]) == (full[0], full[-1])
    assert 100 < len(trip.geometry) < len(full) / 4


def test_amenities_only_when_the_timetable_states_them():
    data = detailed()
    assert trip_from(data, TRIP_ID).bikes_allowed is None  # bikesAllowed false: not stated
    assert trip_from(data, TRIP_ID).wheelchair_accessible is None  # NOT_ACCESSIBLE: not stated

    data["legs"][0] |= {"bikesAllowed": True, "wheelchairAccessible": "ACCESSIBLE"}
    trip = trip_from(data, TRIP_ID)

    assert (trip.bikes_allowed, trip.wheelchair_accessible) == (True, True)


def test_cancellations_platform_and_ticket():
    data = detailed()
    leg = data["legs"][0]
    leg["intermediateStops"][0] |= {"cancelled": True, "track": "3"}
    leg["ticketUrls"] = {"web": "https://tickets.example/ic502"}
    assert trip_from(data, TRIP_ID).cancelled is False

    leg["cancelled"] = True
    trip = trip_from(data, TRIP_ID)

    assert trip.cancelled is True
    assert trip.stops[1].cancelled is True
    assert trip.stops[1].platform == "3"
    assert trip.stops[2].cancelled is False
    assert trip.stops[2].platform is None
    assert trip.ticket_url == "https://tickets.example/ic502"


def test_legs_joined_at_the_shared_stop():
    data = sample("trip.json")
    (leg,) = data["legs"]
    middle = leg["intermediateStops"][4]
    first_half = leg | {"to": middle, "intermediateStops": leg["intermediateStops"][:4]}
    second_half = leg | {"from": middle, "intermediateStops": leg["intermediateStops"][5:]}
    split = data | {"legs": [first_half, second_half]}

    whole, joined = trip_from(data, "t"), trip_from(split, "t")

    assert [stop.model_dump() for stop in joined.stops] == [stop.model_dump() for stop in whole.stops]


def test_no_legs():
    assert trip_from({"legs": []}, TRIP_ID) is None
