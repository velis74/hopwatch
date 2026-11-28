from datetime import datetime, timedelta, UTC

import httpx

from hopwatch.conftest import sample, shift_times

TRIP_ID = "20261127_15:05_ijpp_462146"
URL = f"/api/v1/trips/{TRIP_ID}"
TRIP_PATH = "/api/v6/trip"


def trip_with_ljubljana_in(minutes: int) -> dict:
    """The detailed sample moved so that the expected departure from Ljubljana is `minutes` from now."""
    data = sample("trip-detailed.json")
    ljubljana = next(place for place in data["legs"][0]["intermediateStops"] if place["name"] == "Ljubljana")
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    return shift_times(data, now + timedelta(minutes=minutes) - datetime.fromisoformat(ljubljana["departure"]))


def test_ride_with_every_stop(api, motis):
    motis.answer_by_param(TRIP_PATH, "tripId", {TRIP_ID: trip_with_ljubljana_in(10)})

    response = api.get(URL)

    assert response.status_code == 200
    ride = response.json()
    assert ride["trip_id"] == TRIP_ID
    assert (ride["mode"], ride["line"], ride["headsign"]) == ("rail", "IC 502", "Koper - Hodoš")
    assert ride["operator"] == {"id": "1161", "name": "SŽ - Potniški promet, d.o.o.", "url": "https://potniski.sz.si/"}
    assert ride["cancelled"] is False
    assert ride["bikes_allowed"] is None
    assert ride["wheelchair_accessible"] is None
    assert ride["ticket_url"] is None
    assert len(ride["geometry"]) > 100
    assert all(len(point) == 2 for point in ride["geometry"])
    stops = ride["stops"]
    assert [stop["name"] for stop in stops][:2] == ["Koper", "Hrpelje-Kozina"]
    assert stops[-1]["name"] == "Hodoš"
    ljubljana = stops[8]
    assert ljubljana["name"] == "Ljubljana"
    assert ljubljana["delay_minutes"] == 6
    assert ljubljana["delay_source"] == "estimate"
    assert ljubljana["platform"] is None
    assert ljubljana["cancelled"] is False
    scheduled = datetime.fromisoformat(ljubljana["scheduled_departure"])
    assert datetime.fromisoformat(ljubljana["expected_departure"]) - scheduled == timedelta(minutes=6)
    assert scheduled.utcoffset() == timedelta(hours=1)  # Europe/Belgrade in November
    assert ljubljana["time_zone"] == "Europe/Belgrade"
    assert [stop["passed"] for stop in stops[7:10]] == [True, False, False]
    assert set(ljubljana) == {
        "id",
        "name",
        "lat",
        "lon",
        "scheduled_arrival",
        "expected_arrival",
        "scheduled_departure",
        "expected_departure",
        "time_zone",
        "delay_minutes",
        "delay_source",
        "platform",
        "cancelled",
        "passed",
    }


def test_ride_asks_for_the_path(api, motis):
    motis.answer_by_param(TRIP_PATH, "tripId", {TRIP_ID: trip_with_ljubljana_in(10)})

    api.get(URL)

    (request,) = motis.requests_to(TRIP_PATH)
    assert request.url.params["tripId"] == TRIP_ID
    assert "detailedLegs" not in request.url.params


def test_ride_operator_is_listed(api, motis):
    motis.answer_by_param(TRIP_PATH, "tripId", {TRIP_ID: trip_with_ljubljana_in(10)})

    api.get(URL)

    assert "1161" in [operator["id"] for operator in api.get("/api/v1/operators").json()]


def test_unknown_trip(api, motis):
    motis.answer_by_param(TRIP_PATH, "tripId", {})

    response = api.get("/api/v1/trips/20261127_15:05_ijpp_0")

    assert response.status_code == 404
    body = response.json()
    assert body["detail_code"] == "hopwatch.trip_not_found"
    assert body["detail_params"] == {"trip_id": "20261127_15:05_ijpp_0"}


def test_malformed_trip_id(api, motis):
    motis.answer(TRIP_PATH, httpx.Response(400, json={"error": "invalid tripId start_time nope"}))

    response = api.get("/api/v1/trips/nope")

    assert response.status_code == 404
    assert response.json()["detail_code"] == "hopwatch.trip_not_found"


def test_trip_without_legs(api, motis):
    motis.answer(TRIP_PATH, {"legs": []})

    assert api.get(URL).json()["detail_code"] == "hopwatch.trip_not_found"


def test_timetable_unavailable(api, motis):
    motis.answer(TRIP_PATH, httpx.Response(503))

    response = api.get(URL)

    assert response.status_code == 502
    assert response.json()["detail_code"] == "hopwatch.timetable_unavailable"


def test_ride_is_documented(api):
    schema = api.get("/api/openapi.json").json()
    operation = schema["paths"]["/api/v1/trips/{pk}"]["get"]

    assert operation["security"] == []
    assert "CC BY-SA 4.0" in operation["description"]
    assert "hopwatch.trip_not_found" in operation["responses"]["404"]["description"]
    assert "502" in operation["responses"]
    assert "`hopwatch.trip_not_found`" in schema["info"]["description"]
    for name in ("Trip", "TripStop"):
        properties = schema["components"]["schemas"][name]["properties"]
        assert all(field.get("description") or "$ref" in field for field in properties.values()), name
    assert "IANA time zone" in schema["components"]["schemas"]["TripStop"]["properties"]["time_zone"]["description"]
