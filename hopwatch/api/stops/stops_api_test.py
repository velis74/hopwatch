import httpx
import pytest

from hopwatch.conftest import sample

LAT, LON = 46.0584, 14.5127


def raises(error_type: type[httpx.TransportError]):
    def handler(request: httpx.Request) -> httpx.Response:
        raise error_type("MOTIS did not answer", request=request)

    return handler


def test_search_lists_stops_whose_words_start_with_the_query(api, motis):
    motis.answer("/api/v1/geocode", sample("geocode.json"))

    response = api.get("/api/v1/stops", params={"q": "lj vic"})

    assert response.status_code == 200
    assert [stop["name"] for stop in response.json()] == ["Ljubljana Vič"]
    assert set(response.json()[0]) == {"id", "name", "lat", "lon"}
    (request,) = motis.requests_to("/api/v1/geocode")
    assert request.url.params["text"] == "lj vic"
    assert request.url.params["type"] == "STOP"
    assert request.url.params["numResults"] == "100"


def test_search_in_motis_order_each_stop_once(api, motis):
    motis.answer("/api/v1/geocode", sample("geocode.json") * 2)

    response = api.get("/api/v1/stops", params={"q": "ljub"})

    assert [stop["name"] for stop in response.json()] == ["Ljubljana", "Ljubljana AP", "Ljubljana Vič"]


def test_search_needs_two_characters(api, motis):
    response = api.get("/api/v1/stops", params={"q": "l"})

    assert response.status_code == 422
    assert motis.requests == []


def test_nearby_lists_stops_within_the_radius_nearest_first(api, motis):
    motis.answer("/api/v6/map/stops", sample("map-stops.json"))

    response = api.get("/api/v1/stops/nearby", params={"lat": LAT, "lon": LON, "radius_m": 150})

    assert response.status_code == 200
    stops = response.json()
    assert [stop["name"] for stop in stops] == ["Ljubljana", "Kolodvor"]
    assert stops[0]["id"] == "ijpp_1122804"
    assert all(stop["distance_m"] <= 150 for stop in stops)


def test_nearby_asks_motis_for_the_box_around_the_position(api, motis):
    motis.answer("/api/v6/map/stops", [])

    response = api.get("/api/v1/stops/nearby", params={"lat": LAT, "lon": LON})

    assert response.json() == []
    (request,) = motis.requests_to("/api/v6/map/stops")
    lat_min, lon_min = map(float, request.url.params["min"].split(","))
    lat_max, lon_max = map(float, request.url.params["max"].split(","))
    assert lat_min < LAT < lat_max
    assert lon_min < LON < lon_max
    # The default radius is 1000 m: about 0.009° of latitude each way.
    assert lat_max - LAT == pytest.approx(0.009, abs=0.0005)


def test_nearby_rejects_a_position_off_the_globe(api, motis):
    response = api.get("/api/v1/stops/nearby", params={"lat": 91, "lon": LON})

    assert response.status_code == 422
    assert motis.requests == []


@pytest.mark.parametrize(
    ("answer", "reason"),
    [
        (raises(httpx.ConnectError), "ConnectError"),
        (raises(httpx.ReadTimeout), "ReadTimeout"),
        (httpx.Response(503, text="maintenance"), "http_503"),
        (httpx.Response(404, text="no such route"), "http_404"),
        (httpx.Response(200, text="<html>proxy error</html>"), "invalid_json"),
    ],
)
def test_motis_failure_is_a_502(api, motis, answer, reason):
    motis.answer("/api/v6/map/stops", answer)
    motis.answer("/api/v1/geocode", answer)

    for response in (
        api.get("/api/v1/stops/nearby", params={"lat": LAT, "lon": LON}),
        api.get("/api/v1/stops", params={"q": "ljub"}),
    ):
        assert response.status_code == 502
        body = response.json()
        assert body["detail"] == "The timetable service is unavailable"
        assert body["detail_code"] == "hopwatch.motis_unavailable"
        assert body["detail_params"] == {"reason": reason}
