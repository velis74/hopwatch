from types import SimpleNamespace

import pytest

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import Client
from fastapi.testclient import TestClient

from hopwatch.api.account.account_viewset import display_name_of
from hopwatch.api.main import app

ME_URL = "/api/v1/account/me"
PASSWORD = "correct-horse-battery-staple"  # noqa: S105

# FastAPI resolves the user on another thread and database connection, so the data must be committed.
pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def api() -> TestClient:
    return TestClient(app)


@pytest.fixture
def user():
    return get_user_model().objects.create_user(
        username="ana", email="ana.novak@example.com", password=PASSWORD, first_name="Ana", last_name="Novak"
    )


def session_key_of(user) -> str:
    client = Client()
    client.force_login(user)
    return client.cookies[settings.SESSION_COOKIE_NAME].value


def browser_client() -> Client:
    """A Django client that enforces CSRF like a browser, holding the csrftoken cookie from allauth's config."""
    client = Client(enforce_csrf_checks=True)
    assert client.get("/_allauth/browser/v1/config").status_code == 200
    return client


def csrf_header(client: Client) -> dict[str, str]:
    return {"HTTP_X_CSRFTOKEN": client.cookies[settings.CSRF_COOKIE_NAME].value}


def test_anonymous_gets_401(api):
    response = api.get(ME_URL)

    assert response.status_code == 401
    assert response.json()["detail_code"] == "fastapi-viewsets.session_expired"


def test_unknown_session_cookie_gets_401(api):
    api.cookies.set(settings.SESSION_COOKIE_NAME, "no-such-session")

    assert api.get(ME_URL).status_code == 401


def test_session_cookie_returns_the_user(api, user):
    api.cookies.set(settings.SESSION_COOKIE_NAME, session_key_of(user))

    response = api.get(ME_URL)

    assert response.status_code == 200
    assert response.json() == {"id": user.pk, "email": "ana.novak@example.com", "display_name": "Ana Novak"}


def test_session_token_header_returns_the_user(api, user):
    response = api.get(ME_URL, headers={"X-Session-Token": session_key_of(user)})

    assert response.status_code == 200
    assert response.json()["id"] == user.pk


def test_browser_signup_login_and_logout(api):
    client = browser_client()

    signup = client.post(
        "/_allauth/browser/v1/auth/signup",
        {"email": "new@example.com", "password": PASSWORD},
        content_type="application/json",
        **csrf_header(client),
    )
    assert signup.status_code == 200
    api.cookies.set(settings.SESSION_COOKIE_NAME, client.cookies[settings.SESSION_COOKIE_NAME].value)
    assert api.get(ME_URL).json()["email"] == "new@example.com"

    # Login rotates the CSRF token: the header is read from the cookie again for every request.
    logout = client.delete("/_allauth/browser/v1/auth/session", **csrf_header(client))
    assert logout.status_code == 401
    assert api.get(ME_URL).status_code == 401

    login = client.post(
        "/_allauth/browser/v1/auth/login",
        {"email": "new@example.com", "password": PASSWORD},
        content_type="application/json",
        **csrf_header(client),
    )
    assert login.status_code == 200
    api.cookies.set(settings.SESSION_COOKIE_NAME, client.cookies[settings.SESSION_COOKIE_NAME].value)
    assert api.get(ME_URL).json() == {
        "id": get_user_model().objects.get(email="new@example.com").pk,
        "email": "new@example.com",
        "display_name": "new",
    }


def test_browser_login_without_csrf_token_is_refused(user):
    client = browser_client()

    response = client.post(
        "/_allauth/browser/v1/auth/login",
        {"email": user.email, "password": PASSWORD},
        content_type="application/json",
    )

    assert response.status_code == 403


def test_app_client_session_token_reaches_the_api(api, user):
    login = Client().post(
        "/_allauth/app/v1/auth/login",
        {"email": user.email, "password": PASSWORD},
        content_type="application/json",
    )
    assert login.status_code == 200
    token = login.json()["meta"]["session_token"]

    assert api.get(ME_URL, headers={"X-Session-Token": token}).json()["id"] == user.pk


@pytest.mark.parametrize(
    ("first_name", "last_name", "email", "username", "expected"),
    [
        ("Ana", "Novak", "ana@example.com", "ana", "Ana Novak"),
        ("Ana", "", "ana@example.com", "ana", "Ana"),
        ("", "", "ana.novak@example.com", "ana", "ana.novak"),
        ("", "", "", "ana", "ana"),
    ],
)
def test_display_name(first_name, last_name, email, username, expected):
    user = SimpleNamespace(
        first_name=first_name,
        last_name=last_name,
        email=email,
        get_full_name=lambda: f"{first_name} {last_name}",
        get_username=lambda: username,
    )

    assert display_name_of(user) == expected
