import asyncio
import copy
import json

from datetime import datetime, timedelta, UTC
from pathlib import Path

import pytest

from hopwatch.api.departures.mapping import (
    calls_at,
    DelaySource,
    departure_from,
    departures,
    departures_from_stops,
    place_modes,
    stop_names,
    stops_after,
    transport_mode,
    TransportMode,
    trip_stops,
    TripStops,
    UnknownStopError,
)
from hopwatch.motis import motis_time, MotisNotFoundError, TtlCache

SAMPLES = Path(__file__).parents[3] / "motis" / "samples"
LJUBLJANA = "ijpp_1122804"
NOW = datetime(2026, 11, 27, 10, 0, tzinfo=UTC)


def sample(name: str):
    return json.loads((SAMPLES / name).read_text(encoding="utf-8"))


class FakeMotis:
    """Answers stop times and trips from the samples and counts the calls."""

    def __init__(self, stop_times: dict | None = None, other_stops: dict[str, dict] | None = None):
        self.stop_times_responses = {LJUBLJANA: stop_times or sample("stoptimes.json"), **(other_stops or {})}
        self.trip_calls: list[str] = []
        self.stop_time_calls: list[str] = []

    async def stop_times(self, stop_id, start, window_seconds):  # noqa: ARG002
        self.stop_time_calls.append(stop_id)
        if stop_id not in self.stop_times_responses:
            raise MotisNotFoundError(stop_id)
        return copy.deepcopy(self.stop_times_responses[stop_id])

    async def trip(self, trip_id):
        self.trip_calls.append(trip_id)
        return sample("trip.json")


def test_departure_with_real_time_data():
    stop_time = sample("stoptimes.json")["stopTimes"][0]
    departure = departure_from(stop_time, stop_names(stop_time["nextStops"]))
    assert departure.trip_id == "20261127_08:56_ijpp_465929"
    assert departure.stop_id == LJUBLJANA
    assert departure.stop_name == "Ljubljana"
    assert departure.mode is TransportMode.RAIL
    assert departure.line == "EC 214"
    assert departure.headsign == "Dobova - Jesenice"
    assert departure.scheduled_departure.isoformat() == "2026-11-27T11:08:00+01:00"
    assert departure.expected_departure.isoformat() == "2026-11-27T11:12:00+01:00"
    assert departure.delay_minutes == 4
    assert departure.delay_source is DelaySource.OFFICIAL
    assert departure.platform is None
    assert departure.next_stops == ["Kranj", "Lesce-Bled", "Jesenice", "Villach Hbf"]


def test_departure_without_real_time_data():
    stop_time = sample("stoptimes.json")["stopTimes"][1]
    departure = departure_from(stop_time, [])
    assert departure.line == "MV 431"
    assert departure.scheduled_departure.isoformat() == "2026-11-27T11:20:00+01:00"
    assert departure.expected_departure is None
    assert departure.delay_minutes is None
    assert departure.delay_source is None


def test_departure_serialises_times_with_offset():
    stop_time = sample("stoptimes.json")["stopTimes"][0]
    data = departure_from(stop_time, []).model_dump(mode="json")
    assert data["scheduled_departure"] == "2026-11-27T11:08:00+01:00"
    assert data["mode"] == "rail"
    assert data["delay_source"] == "estimate"


def test_early_departure_has_negative_delay():
    stop_time = sample("stoptimes.json")["stopTimes"][0]
    stop_time["place"]["departure"] = "2026-11-27T10:07:00Z"
    assert departure_from(stop_time, []).delay_minutes == -1


def test_platform_from_track():
    stop_time = sample("stoptimes.json")["stopTimes"][0]
    stop_time["place"]["scheduledTrack"] = "3"
    assert departure_from(stop_time, []).platform == "3"
    stop_time["place"]["track"] = "4"
    assert departure_from(stop_time, []).platform == "4"


@pytest.mark.parametrize("flag", ["cancelled", "tripCancelled"])
def test_cancelled_departure_is_left_out(flag):
    stop_time = sample("stoptimes.json")["stopTimes"][0]
    stop_time[flag] = True
    assert departure_from(stop_time, []) is None


def test_cancelled_stop_is_left_out():
    stop_time = sample("stoptimes.json")["stopTimes"][0]
    stop_time["place"]["cancelled"] = True
    assert departure_from(stop_time, []) is None


@pytest.mark.parametrize(
    ("route_type", "motis_mode", "expected"),
    [
        (2, "BUS", TransportMode.RAIL),
        (109, None, TransportMode.RAIL),
        (3, None, TransportMode.BUS),
        (11, None, TransportMode.BUS),
        (204, None, TransportMode.BUS),
        (700, None, TransportMode.BUS),
        (0, None, TransportMode.TRAM),
        (900, None, TransportMode.TRAM),
        (4, None, TransportMode.OTHER),
        (1, None, TransportMode.OTHER),
        (None, "REGIONAL_RAIL", TransportMode.RAIL),
        (None, "COACH", TransportMode.BUS),
        (None, "TRAM", TransportMode.TRAM),
        (None, "FERRY", TransportMode.OTHER),
        (None, None, TransportMode.OTHER),
    ],
)
def test_transport_mode(route_type, motis_mode, expected):
    assert transport_mode(route_type, motis_mode) is expected


def test_stop_names_skip_stops_without_alighting():
    places = [
        {"name": "Kranj", "dropoffType": "NORMAL"},
        {"name": "Podnart", "dropoffType": "NOT_ALLOWED"},
        {"name": "Radovljica", "cancelled": True},
        {"name": "Jesenice"},
    ]
    assert stop_names(places) == ["Kranj", "Jesenice"]


def test_trip_stops_and_stops_after():
    stops = trip_stops(sample("trip.json"))
    names = [stop["name"] for stop in stops]
    assert names[0] == "Zagreb Glavni kolodvor"
    assert names[-1] == "Villach Hbf"
    later = stops_after(stops, LJUBLJANA, "2026-11-27T10:08:00Z")
    assert stop_names(later) == ["Kranj", "Lesce-Bled", "Jesenice", "Villach Hbf"]


def test_stops_after_a_stop_the_trip_does_not_call_at():
    assert stops_after(trip_stops(sample("trip.json")), "ijpp_0", None) == []


def test_stops_after_picks_the_visit_by_departure_time():
    stops = [
        {"stopId": "a", "name": "A", "scheduledDeparture": "t1"},
        {"stopId": "b", "name": "B", "scheduledDeparture": "t2"},
        {"stopId": "a", "name": "A", "scheduledDeparture": "t3"},
        {"stopId": "c", "name": "C"},
    ]
    assert [stop["name"] for stop in stops_after(stops, "a", "t3")] == ["C"]
    assert [stop["name"] for stop in stops_after(stops, "a", "t9")] == ["B", "A", "C"]


@pytest.mark.parametrize(("destination", "expected"), [("Kranj", True), ("kranj", True), ("lesce bled", True)])
def test_calls_at_any_later_stop(destination, expected):
    stop_time = sample("stoptimes.json")["stopTimes"][0]
    departure = departure_from(stop_time, stop_names(stop_time["nextStops"]))
    assert calls_at(departure, destination) is expected


@pytest.mark.parametrize("destination", ["Dobova", "Ljubljana", "anj"])
def test_does_not_call_at(destination):
    stop_time = sample("stoptimes.json")["stopTimes"][0]
    departure = departure_from(stop_time, stop_names(stop_time["nextStops"]))
    assert not calls_at(departure, destination)


def run_departures(motis, **kwargs):
    kwargs.setdefault("destination", None)
    kwargs.setdefault("window_minutes", 60)
    kwargs.setdefault("trips", TripStops())
    return asyncio.run(departures(motis, LJUBLJANA, now=NOW, **kwargs))


def test_departures_in_order_of_departure():
    found = run_departures(FakeMotis())
    assert [departure.line for departure in found] == ["EC 214", "MV 431", "LP 3211"]


def test_departures_order_by_expected_time():
    response = sample("stoptimes.json")
    response["stopTimes"][0]["place"]["departure"] = "2026-11-27T10:30:00Z"
    found = run_departures(FakeMotis(response))
    assert [departure.line for departure in found] == ["MV 431", "EC 214", "LP 3211"]


def test_departures_within_the_window():
    found = run_departures(FakeMotis(), window_minutes=15)
    assert [departure.line for departure in found] == ["EC 214"]


def test_departures_to_a_destination():
    found = run_departures(FakeMotis(), destination="kranj")
    assert [departure.line for departure in found] == ["EC 214"]
    found = run_departures(FakeMotis(), destination="Škofljica")
    assert [departure.line for departure in found] == ["LP 3211"]
    found = run_departures(FakeMotis(), destination="Celje")
    assert found == []


def test_blank_destination_does_not_filter():
    found = run_departures(FakeMotis(), destination="  ")
    assert len(found) == 3


def test_unknown_stop():
    with pytest.raises(MotisNotFoundError):
        asyncio.run(departures(FakeMotis(), "ijpp_0", destination=None, window_minutes=60, now=NOW))


def test_later_stops_from_the_trip_when_motis_leaves_them_out():
    response = sample("stoptimes.json")
    response["stopTimes"] = response["stopTimes"][:1]
    del response["stopTimes"][0]["nextStops"]
    motis = FakeMotis(response)
    trips = TripStops()

    found = run_departures(motis, trips=trips)
    assert found[0].next_stops == ["Kranj", "Lesce-Bled", "Jesenice", "Villach Hbf"]
    run_departures(motis, trips=trips)
    assert motis.trip_calls == ["20261127_08:56_ijpp_465929"]


def test_departure_names_the_requested_stop():
    stop_time = sample("stoptimes.json")["stopTimes"][0]
    departure = departure_from(stop_time, [], stop_id="ijpp_1", stop_name="Ljubljana potniška")
    assert (departure.stop_id, departure.stop_name) == ("ijpp_1", "Ljubljana potniška")


def test_departures_name_the_stop_of_the_answer():
    response = sample("stoptimes.json")
    response["place"]["name"] = "Ljubljana železniška postaja"
    found = run_departures(FakeMotis(response))
    assert {(departure.stop_id, departure.stop_name) for departure in found} == {
        (LJUBLJANA, "Ljubljana železniška postaja")
    }


@pytest.mark.parametrize(
    ("motis_modes", "expected"),
    [
        (["BUS", "REGIONAL_RAIL"], [TransportMode.RAIL, TransportMode.BUS]),
        (["COACH", "BUS"], [TransportMode.BUS]),
        (["FERRY", "TRAM"], [TransportMode.TRAM, TransportMode.OTHER]),
        ([], []),
        (None, []),
    ],
)
def test_place_modes(motis_modes, expected):
    assert place_modes(motis_modes) == expected


def bus_station() -> dict:
    """The stop times sample at another stop, each departure one minute later."""
    response = sample("stoptimes.json")
    response["place"].update(stopId="ijpp_2", name="Ljubljana AP")
    for stop_time in response["stopTimes"]:
        stop_time["tripId"] += "_bus"
        stop_time["displayName"] = "B " + stop_time["displayName"]
        place = stop_time["place"]
        place.update(stopId="ijpp_2", name="Ljubljana AP")
        for key in ("departure", "scheduledDeparture"):
            moved = datetime.fromisoformat(place[key]) + timedelta(minutes=1)
            place[key] = motis_time(moved)
    return response


def run_departures_from_stops(motis, stop_ids):
    return asyncio.run(
        departures_from_stops(motis, stop_ids, destination=None, window_minutes=60, now=NOW, trips=TripStops())
    )


def test_departures_from_stops_merged_in_order_of_departure():
    found = run_departures_from_stops(FakeMotis(other_stops={"ijpp_2": bus_station()}), [LJUBLJANA, "ijpp_2"])
    assert [(departure.stop_name, departure.line) for departure in found] == [
        ("Ljubljana", "EC 214"),
        ("Ljubljana AP", "B EC 214"),
        ("Ljubljana", "MV 431"),
        ("Ljubljana AP", "B MV 431"),
        ("Ljubljana", "LP 3211"),
        ("Ljubljana AP", "B LP 3211"),
    ]


def test_departures_from_stops_reads_each_stop_once():
    motis = FakeMotis()
    found = run_departures_from_stops(motis, [LJUBLJANA, LJUBLJANA])
    assert len(found) == 3
    assert motis.stop_time_calls == [LJUBLJANA]


def test_departures_from_stops_names_the_first_unknown_stop():
    with pytest.raises(UnknownStopError) as error:
        run_departures_from_stops(FakeMotis(), ["ijpp_8", LJUBLJANA, "ijpp_9"])
    assert error.value.stop_id == "ijpp_8"


def test_ttl_cache_expires_and_evicts():
    now = [0.0]
    cache = TtlCache(10, 2, clock=lambda: now[0])
    loads: list[str] = []

    def loader(key):
        async def load():
            loads.append(key)
            return key.upper()

        return load

    async def scenario():
        assert await cache.get_or_load("a", loader("a")) == "A"
        assert await cache.get_or_load("a", loader("a")) == "A"
        now[0] = 11
        await cache.get_or_load("a", loader("a"))
        await cache.get_or_load("b", loader("b"))
        await cache.get_or_load("c", loader("c"))
        await cache.get_or_load("a", loader("a"))

    asyncio.run(scenario())
    assert loads == ["a", "a", "b", "c", "a"]


def test_motis_time_is_utc_whole_seconds():
    assert motis_time(datetime(2026, 11, 27, 10, 20, 5, 123456, tzinfo=UTC)) == "2026-11-27T10:20:05Z"
