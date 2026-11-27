import json
import re

import pytest

from fastapi.testclient import TestClient

from hopwatch.api.main import app
from hopwatch.api.openapi_docs import ERROR_CODES

INFRASTRUCTURE = re.compile(r"motis|gtfs|derp|transitous|transitclock|allauth|headless|django", re.IGNORECASE)
# The error body schemas of fastapi-viewsets describe the library's own error vocabulary.
LIBRARY_SCHEMAS = {"ApiErrorBody", "ApiFieldError"}


@pytest.fixture(scope="module")
def schema() -> dict:
    return TestClient(app).get("/api/openapi.json").json()


def operations(schema: dict):
    for path, methods in schema["paths"].items():
        for method, operation in methods.items():
            yield path, method, operation


def test_every_operation_is_under_api_v1(schema):
    assert {path.split("/")[1:3] == ["api", "v1"] for path in schema["paths"]} == {True}


def test_every_operation_links_to_its_swagger_ui_entry(schema):
    for path, method, operation in operations(schema):
        tag = re.sub(r"[^\w-]", "_", operation["tags"][0])
        link = f'<a href="/api/docs#/{tag}/{operation["operationId"]}"'
        assert link in operation["description"], f"{method} {path}"


def test_every_operation_declares_its_session(schema):
    schemes = set(schema["components"]["securitySchemes"])
    for path, method, operation in operations(schema):
        assert "security" in operation, f"{method} {path}"
        assert {name for entry in operation["security"] for name in entry} <= schemes


def test_the_account_operations_take_the_client_type(schema):
    for path, method, operation in operations(schema):
        if path.startswith("/api/v1/account/") and not path.endswith(("/schema", "/me")):
            assert {"$ref": "#/components/parameters/ClientType"} in operation["parameters"], f"{method} {path}"


def test_descriptions_do_not_name_the_infrastructure(schema):
    public = {**schema, "components": {**schema["components"]}}
    public["components"]["schemas"] = {
        name: value for name, value in schema["components"]["schemas"].items() if name not in LIBRARY_SCHEMAS
    }

    assert INFRASTRUCTURE.findall(json.dumps(public)) == []


def test_the_description_lists_each_attribution_on_its_own_line(schema):
    lines = schema["info"]["description"].splitlines()

    assert "- Timetable and real-time data: SŽ – Potniški promet" in lines
    assert any(line.startswith("- Licence of the timetable and real-time data: [CC BY-SA 4.0]") for line in lines)
    assert any(line.startswith("- Streets and walking routes: © OpenStreetMap contributors") for line in lines)


def test_redoc_styles_the_try_buttons():
    page = TestClient(app).get("/api/redoc")

    assert page.status_code == 200
    assert ".api-try-button a" in page.text
    assert "/api/openapi.json" in page.text


def test_swagger_ui_opens_try_it_out_and_hides_redoc_content():
    page = TestClient(app).get("/api/docs")

    assert page.status_code == 200
    assert '"tryItOutEnabled": true' in page.text
    assert ".redoc-only" in page.text
    assert "requestInterceptor: addCsrfToken," in page.text


def test_every_error_code_of_the_operations_is_in_the_error_table(schema):
    operations = json.dumps(schema["paths"])
    codes = set(re.findall(r"hopwatch\.[a-z_]+", operations))

    assert codes - set(ERROR_CODES) == set()
    assert "| `hopwatch.stop_not_found` | 404 |" in schema["info"]["description"]
