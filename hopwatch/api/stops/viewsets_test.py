import json

from pathlib import Path

from hopwatch.api.departures.mapping import TransportMode
from hopwatch.api.stops.viewsets import bounding_box, distance_m, matching_stops, nearby_stops

SAMPLES = Path(__file__).parents[3] / "motis" / "samples"
LAT, LON = 46.0584, 14.5127


def sample(name: str):
    return json.loads((SAMPLES / name).read_text(encoding="utf-8"))


def test_nearby_stops_nearest_first():
    stops = nearby_stops(sample("map-stops.json"), LAT, LON, 1000)
    assert [stop.id for stop in stops] == [
        "ijpp_1122804",
        "ijpp_1167300",
        "ijpp_1168813",
        "ijpp_1167299",
        "ijpp_1121396",
    ]
    assert stops[0].name == "Ljubljana"
    assert 15 <= stops[0].distance_m <= 30


def test_nearby_stops_within_radius():
    stops = nearby_stops(sample("map-stops.json"), LAT, LON, 150)
    assert [stop.name for stop in stops] == ["Ljubljana", "Kolodvor"]
    assert all(stop.distance_m <= 150 for stop in stops)


def test_nearby_stops_at_most_ten_each_once():
    place = sample("map-stops.json")[0]
    places = [dict(place, stopId=f"s{index}", lat=place["lat"] + index * 1e-5) for index in range(15)]
    stops = nearby_stops(places + places, place["lat"], place["lon"], 1000)
    assert [stop.id for stop in stops] == [f"s{index}" for index in range(10)]


def test_bounding_box_contains_the_circle():
    lat_min, lon_min, lat_max, lon_max = bounding_box(LAT, LON, 5000)
    assert distance_m(LAT, LON, lat_min, LON) >= 4990
    assert distance_m(LAT, LON, lat_max, LON) >= 4990
    assert distance_m(LAT, LON, LAT, lon_min) >= 4990
    assert distance_m(LAT, LON, LAT, lon_max) >= 4990


def test_matching_stops_keeps_word_prefix_matches_in_motis_order():
    matches = sample("geocode.json")
    assert [stop.name for stop in matching_stops(matches, "ljub")] == ["Ljubljana", "Ljubljana AP", "Ljubljana Vič"]
    assert [stop.name for stop in matching_stops(matches, "lj vic")] == ["Ljubljana Vič"]
    assert matching_stops(matches, "jana") == []


def test_matching_stops_each_stop_once():
    matches = sample("geocode.json")
    stops = matching_stops(matches + matches, "ljubljana")
    assert [stop.id for stop in stops] == ["ijpp_1122804", "ijpp_1168813", "ijpp_1165697"]
    assert stops[0].lat == matches[0]["lat"]


def test_nearby_and_matching_stops_carry_their_modes():
    nearby = {stop.id: stop.modes for stop in nearby_stops(sample("map-stops.json"), LAT, LON, 150)}
    assert nearby == {"ijpp_1122804": [TransportMode.RAIL, TransportMode.BUS], "ijpp_1167300": [TransportMode.BUS]}
    (stop,) = matching_stops(sample("geocode.json"), "lj vic")
    assert stop.modes == [TransportMode.BUS]
