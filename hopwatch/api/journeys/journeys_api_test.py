import re

from datetime import datetime, timedelta, UTC

import httpx
import pytest

from hopwatch.conftest import sample

LJUBLJANA = "ijpp_1122804"
LESCE_BLED = "ijpp_1122816"
URL = "/api/v1/journeys"
PLAN = "/api/v5/plan"


def test_journeys_between_two_stops(api, motis):
    motis.answer(PLAN, sample("plan.json"))

    response = api.get(URL, params={"from_stop_id": LJUBLJANA, "to_stop_id": LESCE_BLED})

    assert response.status_code == 200
    journeys = response.json()
    assert set(journeys) == {"itineraries", "earlier_cursor", "later_cursor"}
    assert journeys["earlier_cursor"] == "EARLIER|1795791600"
    assert journeys["later_cursor"] == "LATER|1795797720"
    first, second, _ = journeys["itineraries"]
    assert first["scheduled_departure"] == "2026-11-27T15:21:00Z"
    assert first["scheduled_arrival"] == "2026-11-27T16:18:00Z"
    assert first["expected_departure"] is None
    assert first["duration_minutes"] == 57
    assert first["transfers"] == 0
    (leg,) = first["legs"]
    assert (leg["mode"], leg["line"]) == ("rail", "LPV 2420")
    assert leg["from"]["id"] == LJUBLJANA
    assert leg["to"]["name"] == "Lesce-Bled"
    assert all(len(point) == 2 for point in leg["geometry"])
    assert [(leg["mode"], leg["line"]) for leg in second["legs"]] == [
        ("walk", None),
        ("bus", "A6370"),
        ("walk", None),
        ("bus", "A6415"),
    ]
    assert second["legs"][0]["distance_m"] == 241
    assert second["transfers"] == 1


def test_journeys_ask_motis_for_the_stops_from_now(api, motis):
    motis.answer(PLAN, sample("plan.json"))

    api.get(URL, params={"from_stop_id": LJUBLJANA, "to_stop_id": LESCE_BLED})

    (request,) = motis.requests_to(PLAN)
    params = request.url.params
    assert params["fromPlace"] == LJUBLJANA
    assert params["toPlace"] == LESCE_BLED
    assert params["arriveBy"] == "false"
    assert "pageCursor" not in params
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", params["time"])
    assert abs(datetime.fromisoformat(params["time"]) - datetime.now(UTC)) < timedelta(minutes=1)


def test_journeys_from_a_position_arriving_by_a_time(api, motis):
    motis.answer(PLAN, sample("plan.json"))

    response = api.get(
        URL,
        params={
            "from_lat": 46.0584,
            "from_lon": 14.5127,
            "to_stop_id": LESCE_BLED,
            "time": "2026-11-27T18:00:00+01:00",
            "arrive_by": "true",
        },
    )

    assert response.status_code == 200
    (request,) = motis.requests_to(PLAN)
    assert request.url.params["fromPlace"] == "46.0584,14.5127"
    assert request.url.params["time"] == "2026-11-27T17:00:00Z"
    assert request.url.params["arriveBy"] == "true"


def test_later_page_by_cursor(api, motis):
    motis.answer(PLAN, sample("plan.json"))

    api.get(URL, params={"from_stop_id": LJUBLJANA, "to_stop_id": LESCE_BLED, "page_cursor": "LATER|1795797720"})

    (request,) = motis.requests_to(PLAN)
    assert request.url.params["pageCursor"] == "LATER|1795797720"


def test_real_time_delays(api, motis):
    plan = sample("plan.json")
    leg = plan["itineraries"][0]["legs"][0]
    leg["realTime"] = True
    leg["from"]["departure"] = leg["startTime"] = plan["itineraries"][0]["startTime"] = "2026-11-27T15:26:00Z"
    leg["to"]["arrival"] = leg["endTime"] = plan["itineraries"][0]["endTime"] = "2026-11-27T16:22:00Z"
    motis.answer(PLAN, plan)

    first = api.get(URL, params={"from_stop_id": LJUBLJANA, "to_stop_id": LESCE_BLED}).json()["itineraries"][0]

    assert first["expected_departure"] == "2026-11-27T15:26:00Z"
    assert first["expected_arrival"] == "2026-11-27T16:22:00Z"
    assert first["legs"][0]["delay_minutes"] == 5
    assert first["legs"][0]["delay_source"] == "estimate"
    assert first["legs"][0]["from"]["expected"] == "2026-11-27T15:26:00Z"


@pytest.mark.parametrize("unknown", ["from_stop_id", "to_stop_id"])
def test_unknown_stop_is_a_404(api, motis, unknown):
    motis.answer(PLAN, httpx.Response(404, json={"error": 'Could not find timetable location "ijpp_0"'}))
    params = {"from_stop_id": LJUBLJANA, "to_stop_id": LESCE_BLED, unknown: "ijpp_0"}

    response = api.get(URL, params=params)

    assert response.status_code == 404
    body = response.json()
    assert body["detail_code"] == "hopwatch.stop_not_found"
    assert body["detail_params"] == {"stop_id": "ijpp_0"}


def test_unknown_stop_without_a_name_in_the_answer_is_the_destination(api, motis):
    motis.answer(PLAN, httpx.Response(404, text="not found"))

    response = api.get(URL, params={"from_stop_id": LJUBLJANA, "to_stop_id": LESCE_BLED})

    assert response.status_code == 404
    assert response.json()["detail_params"] == {"stop_id": LESCE_BLED}


@pytest.mark.parametrize(
    "params",
    [
        {"to_stop_id": LESCE_BLED},
        {"from_stop_id": LJUBLJANA},
        {"from_lat": 46.0584, "to_stop_id": LESCE_BLED},
        {"from_stop_id": LJUBLJANA, "from_lat": 46.0584, "from_lon": 14.5127, "to_stop_id": LESCE_BLED},
        {"from_lat": 91, "from_lon": 14.5127, "to_stop_id": LESCE_BLED},
        {"from_stop_id": LJUBLJANA, "to_stop_id": LESCE_BLED, "time": "2026-11-27T18:00:00"},
        {"from_stop_id": "", "to_stop_id": LESCE_BLED},
    ],
)
def test_incomplete_query_is_a_422(api, motis, params):
    response = api.get(URL, params=params)

    assert response.status_code == 422
    assert response.json()["detail_code"] == "fastapi-viewsets.validation_failed"
    assert motis.requests == []


def test_motis_failure_is_a_502(api, motis):
    motis.answer(PLAN, httpx.Response(500, text="internal error"))

    response = api.get(URL, params={"from_stop_id": LJUBLJANA, "to_stop_id": LESCE_BLED})

    assert response.status_code == 502
    assert response.json()["detail_code"] == "hopwatch.timetable_unavailable"
    assert response.json()["detail_params"] == {"reason": "http_500"}


def test_openapi_documents_the_endpoint(api):
    schema = api.get("/api/openapi.json").json()
    operation = schema["paths"][URL]["get"]
    assert operation["summary"] == "Journeys between two places"
    assert "nap.si" in operation["description"]
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) >= {"from_stop_id", "from_lat", "from_lon", "to_stop_id", "time", "arrive_by", "page_cursor"}
    assert all(parameter.get("description") for parameter in parameters.values())
    assert parameters["to_stop_id"]["required"] is True
    assert {"200", "404", "422", "502"} <= set(operation["responses"])
    leg = schema["components"]["schemas"]["Leg"]
    assert "from" in leg["properties"]
    assert all(field.get("description") for field in leg["properties"].values())
    leg_stop = schema["components"]["schemas"]["LegStop"]["properties"]
    assert "IANA time zone" in leg_stop["time_zone"]["description"]


def test_ride_legs_name_their_operator(api, motis):
    motis.answer(PLAN, sample("plan.json"))

    itineraries = api.get(URL, params={"from_stop_id": LJUBLJANA, "to_stop_id": LESCE_BLED}).json()["itineraries"]

    assert itineraries[0]["legs"][0]["operator"]["name"] == "SŽ - Potniški promet, d.o.o."
    assert [leg["operator"] and leg["operator"]["id"] for leg in itineraries[1]["legs"]] == [None, "1123", None, "1123"]
