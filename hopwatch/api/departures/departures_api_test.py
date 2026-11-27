import re

from datetime import datetime, timedelta, UTC

import httpx

from hopwatch.conftest import sample, stop_times_from_now

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
    assert first["delay_source"] == "official"
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
    assert response.json()["detail_code"] == "hopwatch.motis_unavailable"
    assert response.json()["detail_params"] == {"reason": "http_500"}


def test_window_is_at_most_four_hours(api, motis):
    response = api.get(URL, params={"stop_id": LJUBLJANA, "window_minutes": 241})

    assert response.status_code == 422
    assert motis.requests == []
