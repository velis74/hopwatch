import os
import zipfile

from hopwatch.conftest import sample, stop_times_from_now

URL = "/api/v1/operators"

AGENCIES = (
    "agency_id,agency_name,agency_url,agency_timezone\n"
    "1123,Arriva d.o.o.,https://arriva.si/,Europe/Ljubljana\n"
    '1161,"SŽ - Potniški promet, d.o.o.",https://potniski.sz.si/,Europe/Ljubljana\n'
    "1119,Nomago d.o.o.,,Europe/Ljubljana\n"
    "INTL-POSTBUS,Österreichische Postbus AG,https://www.postbus.at/,Europe/Ljubljana\n"
)


def feed(path, agencies=AGENCIES):
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("agency.txt", agencies)
    return path


def test_operators_of_the_timetable_feeds_by_name(api, settings, tmp_path):
    settings.TIMETABLE_FEEDS = [str(feed(tmp_path / "ijpp.zip"))]

    response = api.get(URL)

    assert response.status_code == 200
    assert [operator["name"] for operator in response.json()] == [
        "Arriva d.o.o.",
        "Nomago d.o.o.",
        "SŽ - Potniški promet, d.o.o.",
        "Österreichische Postbus AG",
    ]
    assert response.json()[0] == {"id": "1123", "name": "Arriva d.o.o.", "url": "https://arriva.si/"}
    assert response.json()[1]["url"] is None


def test_a_directory_lists_the_operators_of_every_feed_in_it(api, settings, tmp_path):
    feed(tmp_path / "ijpp.zip")
    feed(tmp_path / "kranjska-gora.zip", "agency_id,agency_name,agency_url\n0,TURIZEM KRANJSKA GORA,\n")
    (tmp_path / "notes.txt").write_text("not a feed")
    settings.TIMETABLE_FEEDS = [str(tmp_path)]

    names = [operator["name"] for operator in api.get(URL).json()]

    assert "TURIZEM KRANJSKA GORA" in names
    assert len(names) == 5


def test_a_changed_feed_is_read_again(api, settings, tmp_path):
    path = feed(tmp_path / "ijpp.zip")
    settings.TIMETABLE_FEEDS = [str(path)]
    api.get(URL)
    feed(path, "agency_id,agency_name\n1,Only one\n")
    os.utime(path, (1, 1))

    assert [operator["name"] for operator in api.get(URL).json()] == ["Only one"]


def test_missing_and_broken_feeds_list_no_operators(api, settings, tmp_path):
    (tmp_path / "broken.zip").write_text("not a zip")
    settings.TIMETABLE_FEEDS = [str(tmp_path / "missing.zip"), str(tmp_path / "broken.zip")]

    response = api.get(URL)

    assert response.status_code == 200
    assert response.json() == []


def test_operators_named_by_departures_and_journeys_are_listed(api, motis):
    motis.answer("/api/v6/stoptimes", stop_times_from_now())
    motis.answer("/api/v5/plan", sample("plan.json"))

    assert api.get(URL).json() == []
    api.get("/api/v1/departures", params={"stop_id": "ijpp_1122804"})
    api.get("/api/v1/journeys", params={"from_stop_id": "ijpp_1122804", "to_stop_id": "ijpp_1122816"})

    assert api.get(URL).json() == [
        {"id": "1123", "name": "Arriva d.o.o.", "url": "https://arriva.si/"},
        {"id": "1161", "name": "SŽ - Potniški promet, d.o.o.", "url": "https://potniski.sz.si/"},
    ]


def test_an_operator_in_a_feed_and_an_answer_is_listed_once(api, motis, settings, tmp_path):
    settings.TIMETABLE_FEEDS = [str(feed(tmp_path / "ijpp.zip"))]
    motis.answer("/api/v6/stoptimes", stop_times_from_now())
    api.get("/api/v1/departures", params={"stop_id": "ijpp_1122804"})

    ids = [operator["id"] for operator in api.get(URL).json()]

    assert sorted(ids) == ["1119", "1123", "1161", "INTL-POSTBUS"]


def test_openapi_documents_the_endpoint(api):
    schema = api.get("/api/openapi.json").json()
    operation = schema["paths"][URL]["get"]
    assert operation["summary"] == "Transport operators"
    assert "nap.si" in operation["description"]
    assert all(parameter.get("description") for parameter in operation["parameters"])
    operator = schema["components"]["schemas"]["Operator"]
    assert operator["description"]
    assert set(operator["properties"]) == {"id", "name", "url"}
    assert all(field.get("description") for field in operator["properties"].values())


def test_openapi_descriptions_of_operators_name_no_infrastructure(api):
    schema = api.get("/api/openapi.json").json()
    texts = [schema["paths"][URL]["get"]["description"]]
    for name in ("Operator", "Departure", "Leg"):
        model = schema["components"]["schemas"][name]
        texts.append(model["properties"]["operator" if name != "Operator" else "id"]["description"])
    assert not [text for text in texts if any(word in text for word in ("MOTIS", "GTFS", "agency"))]
