import re

from datetime import datetime, timedelta, UTC

import httpx

from hopwatch.conftest import sample, shift_times, stop_times_from_now

LJUBLJANA = "ijpp_1122804"
URL = "/api/v1/departures"


def test_departures_in_order_with_real_time_delays(api, motis):
    motis.answer("/api/v6/stoptimes", stop_times_from_now())

    response = api.get(URL, params={"stop_id": LJUBLJANA})

    assert response.status_code == 200
    found = response.json()
    assert [departure["line"] for departure in found] == ["EC 214", "MV 431", "LP 3211"]
    first = found[0]
    assert first["mode"] == "rail"
    assert first["headsign"] == "Dobova - Jesenice"
    assert first["delay_minutes"] == 4
    assert first["delay_source"] == "estimate"
    assert first["next_stops"] == ["Kranj", "Lesce-Bled", "Jesenice", "Villach Hbf"]
    scheduled = datetime.fromisoformat(first["scheduled_departure"])
    assert scheduled.utcoffset() == timedelta(hours=1)  # Europe/Belgrade in November
    assert datetime.fromisoformat(first["expected_departure"]) - scheduled == timedelta(minutes=4)
    assert found[1]["expected_departure"] is None
    assert found[1]["delay_minutes"] is None


def test_departures_ask_motis_for_the_stop_and_window(api, motis):
    motis.answer("/api/v6/stoptimes", stop_times_from_now())

    api.get(URL, params={"stop_id": LJUBLJANA, "window_minutes": 90})

    (request,) = motis.requests_to("/api/v6/stoptimes")
    params = request.url.params
    assert params["stopId"] == LJUBLJANA
    assert params["window"] == str(90 * 60)
    assert params["fetchStops"] == "true"
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", params["time"])
    asked = datetime.fromisoformat(params["time"])
    assert abs(asked - datetime.now(UTC)) < timedelta(minutes=1)


def test_departures_beyond_the_window_are_left_out(api, motis):
    motis.answer("/api/v6/stoptimes", stop_times_from_now())

    response = api.get(URL, params={"stop_id": LJUBLJANA, "window_minutes": 15})

    assert [departure["line"] for departure in response.json()] == ["EC 214"]


def test_departures_to_a_destination(api, motis):
    motis.answer("/api/v6/stoptimes", stop_times_from_now())

    response = api.get(URL, params={"stop_id": LJUBLJANA, "destination": "lesce bled"})

    assert [departure["line"] for departure in response.json()] == ["EC 214"]


def test_cancelled_and_untimed_departures_are_left_out(api, motis):
    stop_times = stop_times_from_now()
    stop_times["stopTimes"][0]["cancelled"] = True
    del stop_times["stopTimes"][1]["place"]["scheduledDeparture"]
    motis.answer("/api/v6/stoptimes", stop_times)

    response = api.get(URL, params={"stop_id": LJUBLJANA})

    assert [departure["line"] for departure in response.json()] == ["LP 3211"]


def test_unknown_time_zone_shows_times_in_utc(api, motis):
    stop_times = stop_times_from_now()
    for stop_time in stop_times["stopTimes"]:
        stop_time["place"]["tz"] = "Nowhere/Atlantis"
    motis.answer("/api/v6/stoptimes", stop_times)

    response = api.get(URL, params={"stop_id": LJUBLJANA})

    assert response.status_code == 200
    scheduled = datetime.fromisoformat(response.json()[0]["scheduled_departure"])
    assert scheduled.utcoffset() == timedelta(0)
    assert scheduled == datetime.fromisoformat(stop_times["stopTimes"][0]["place"]["scheduledDeparture"])
    assert response.json()[0]["time_zone"] == "UTC"


def test_later_stops_come_from_the_trip_when_motis_leaves_them_out(api, motis):
    stop_times = stop_times_from_now()
    stop_times["stopTimes"] = stop_times["stopTimes"][:1]
    del stop_times["stopTimes"][0]["nextStops"]
    trip = sample("trip.json")
    # The trip calls at the stop when the stop time says it departs.
    for leg in trip["legs"]:
        for place in (leg["from"], *leg.get("intermediateStops", []), leg["to"]):
            if place.get("stopId") == LJUBLJANA:
                place["scheduledDeparture"] = stop_times["stopTimes"][0]["place"]["scheduledDeparture"]
    motis.answer("/api/v6/trip", trip)
    motis.answer("/api/v6/stoptimes", stop_times)

    first = api.get(URL, params={"stop_id": LJUBLJANA}).json()
    again = api.get(URL, params={"stop_id": LJUBLJANA}).json()

    assert first[0]["next_stops"] == ["Kranj", "Lesce-Bled", "Jesenice", "Villach Hbf"]
    assert again == first
    (request,) = motis.requests_to("/api/v6/trip")
    assert request.url.params["tripId"] == stop_times["stopTimes"][0]["tripId"]


def test_trip_motis_does_not_know_has_no_later_stops(api, motis):
    stop_times = stop_times_from_now()
    stop_times["stopTimes"] = stop_times["stopTimes"][:1]
    del stop_times["stopTimes"][0]["nextStops"]
    motis.answer("/api/v6/stoptimes", stop_times)
    motis.answer("/api/v6/trip", httpx.Response(404, text="trip not found"))

    response = api.get(URL, params={"stop_id": LJUBLJANA})

    assert response.status_code == 200
    assert [(departure["line"], departure["next_stops"]) for departure in response.json()] == [("EC 214", [])]


def test_unknown_stop_is_a_404(api, motis):
    motis.answer("/api/v6/stoptimes", httpx.Response(404, text="stop not found"))

    response = api.get(URL, params={"stop_id": "ijpp_0"})

    assert response.status_code == 404
    body = response.json()
    assert body["detail_code"] == "hopwatch.stop_not_found"
    assert body["detail_params"] == {"stop_id": "ijpp_0"}


def test_motis_failure_is_a_502(api, motis):
    motis.answer("/api/v6/stoptimes", httpx.Response(500, text="internal error"))

    response = api.get(URL, params={"stop_id": LJUBLJANA})

    assert response.status_code == 502
    assert response.json()["detail_code"] == "hopwatch.timetable_unavailable"
    assert response.json()["detail_params"] == {"reason": "http_500"}


def test_window_is_at_most_four_hours(api, motis):
    response = api.get(URL, params={"stop_id": LJUBLJANA, "window_minutes": 241})

    assert response.status_code == 422
    assert motis.requests == []


AVTOBUSNA = "ijpp_1168813"


def bus_station_stop_times() -> dict:
    """Stop times of the bus station: the sample's departures moved two minutes later, at another stop."""
    stop_times = shift_times(stop_times_from_now(), timedelta(minutes=2))
    stop_times["place"].update(stopId=AVTOBUSNA, name="Ljubljana AP")
    for stop_time in stop_times["stopTimes"]:
        stop_time["place"].update(stopId=AVTOBUSNA, name="Ljubljana AP")
        stop_time["tripId"] += "_bus"
        stop_time["displayName"] = "B " + stop_time["displayName"]
    return stop_times


def test_each_departure_names_its_stop(api, motis):
    motis.answer("/api/v6/stoptimes", stop_times_from_now())

    found = api.get(URL, params={"stop_id": LJUBLJANA}).json()

    assert {(departure["stop_id"], departure["stop_name"]) for departure in found} == {(LJUBLJANA, "Ljubljana")}


def test_departures_of_several_stops_merged_in_order(api, motis):
    motis.answer_by_param(
        "/api/v6/stoptimes", "stopId", {LJUBLJANA: stop_times_from_now(), AVTOBUSNA: bus_station_stop_times()}
    )

    response = api.get(f"{URL}?stop_id={LJUBLJANA}&stop_id={AVTOBUSNA}")

    assert response.status_code == 200
    found = response.json()
    times = [datetime.fromisoformat(d["expected_departure"] or d["scheduled_departure"]) for d in found]
    assert times == sorted(times)
    assert {(d["stop_id"], d["stop_name"]) for d in found} == {(LJUBLJANA, "Ljubljana"), (AVTOBUSNA, "Ljubljana AP")}
    assert len(found) == 6
    assert {request.url.params["stopId"] for request in motis.requests_to("/api/v6/stoptimes")} == {
        LJUBLJANA,
        AVTOBUSNA,
    }


def test_a_stop_given_twice_is_read_once(api, motis):
    motis.answer("/api/v6/stoptimes", stop_times_from_now())

    found = api.get(f"{URL}?stop_id={LJUBLJANA}&stop_id={LJUBLJANA}").json()

    assert len(found) == 3
    assert len(motis.requests_to("/api/v6/stoptimes")) == 1


def test_any_unknown_stop_is_a_404(api, motis):
    motis.answer_by_param("/api/v6/stoptimes", "stopId", {LJUBLJANA: stop_times_from_now()})

    response = api.get(f"{URL}?stop_id={LJUBLJANA}&stop_id=ijpp_0")

    assert response.status_code == 404
    assert response.json()["detail_code"] == "hopwatch.stop_not_found"
    assert response.json()["detail_params"] == {"stop_id": "ijpp_0"}


def test_one_to_ten_stops(api, motis):
    eleven = "&".join(f"stop_id=ijpp_{index}" for index in range(11))

    assert api.get(f"{URL}?{eleven}").status_code == 422
    assert api.get(URL).status_code == 422
    assert api.get(URL, params={"stop_id": ""}).status_code == 422
    assert motis.requests == []


def test_departures_name_the_time_zone_of_the_stop(api, motis):
    motis.answer("/api/v6/stoptimes", stop_times_from_now())

    response = api.get(URL, params={"stop_id": LJUBLJANA})

    departure = response.json()[0]
    assert departure["time_zone"] == "Europe/Belgrade"
    assert datetime.fromisoformat(departure["scheduled_departure"]).utcoffset() == timedelta(hours=1)
    field = api.get("/api/openapi.json").json()["components"]["schemas"]["Departure"]["properties"]["time_zone"]
    assert "IANA time zone" in field["description"]


def test_stop_id_is_a_repeated_query_parameter_in_openapi(api):
    operation = api.get("/api/openapi.json").json()["paths"][URL]["get"]
    (parameter,) = [parameter for parameter in operation["parameters"] if parameter["name"] == "stop_id"]
    assert parameter["in"] == "query"
    assert parameter["required"] is True
    assert parameter["schema"]["type"] == "array"


def test_each_departure_names_its_operator(api, motis):
    motis.answer("/api/v6/stoptimes", stop_times_from_now())

    response = api.get(URL, params={"stop_id": LJUBLJANA})

    assert {departure["operator"]["id"] for departure in response.json()} == {"1161"}
    assert response.json()[0]["operator"] == {
        "id": "1161",
        "name": "SŽ - Potniški promet, d.o.o.",
        "url": "https://potniski.sz.si/",
    }
