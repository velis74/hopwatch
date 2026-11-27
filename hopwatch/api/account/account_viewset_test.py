from types import SimpleNamespace

import pytest

from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore
from django.core.cache import cache
from django.test import Client, override_settings
from fastapi.testclient import TestClient

from hopwatch.accounts.flows import display_name_of
from hopwatch.api.main import app

ACCOUNT = "/api/v1/account"
ME_URL = f"{ACCOUNT}/me"
PASSWORD = "correct-horse-battery-staple"  # noqa: S105
APP_CLIENT = {"X-Client-Type": "app"}

GOOGLE = {
    "google": {
        "APPS": [
            {"client_id": "web-client", "secret": "secret", "key": ""},
            {"client_id": "android-client", "secret": "", "key": "", "settings": {"hidden": True}},
        ],
        "SCOPE": ["profile", "email"],
    }
}

# FastAPI resolves the user on another thread and database connection, so the data must be committed.
pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    cache.clear()
    yield
    cache.clear()


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


def csrf(api: TestClient) -> dict[str, str]:
    """The CSRF header of a browser client, from the cookie that `GET /account/session` sets."""
    if settings.CSRF_COOKIE_NAME not in api.cookies:
        assert api.get(f"{ACCOUNT}/session").status_code == 200
    return {"X-CSRFToken": api.cookies[settings.CSRF_COOKIE_NAME]}


def browser_post(api: TestClient, path: str, body: dict | None = None):
    return api.post(f"{ACCOUNT}/{path}", json=body or {}, headers=csrf(api))


def field_codes(response) -> dict[str, list[str]]:
    assert response.status_code == 422, response.text
    body = response.json()
    assert body["detail_code"] == "fastapi-viewsets.validation_failed"
    return {field: [error["code"] for error in errors] for field, errors in body["field_errors"].items()}


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


def test_anonymous_session_state_sets_the_csrf_cookie(api):
    response = api.get(f"{ACCOUNT}/session")

    assert response.status_code == 200
    assert response.json() == {"is_authenticated": False, "session_token": None, "account": None}
    assert api.cookies[settings.CSRF_COOKIE_NAME]


def test_browser_signup_logout_and_login(api):
    signup = browser_post(api, "signup", {"email": "new@example.com", "password": PASSWORD})
    assert signup.status_code == 200
    assert signup.json() == {"is_authenticated": True, "session_token": None}
    new_user = get_user_model().objects.get(email="new@example.com")
    assert api.get(ME_URL).json() == {"id": new_user.pk, "email": "new@example.com", "display_name": "new"}
    assert api.get(f"{ACCOUNT}/session").json()["account"]["id"] == new_user.pk

    # Signup rotated the CSRF token: the header is read from the cookie again.
    logout = browser_post(api, "logout")
    assert logout.status_code == 200
    assert logout.json()["is_authenticated"] is False
    assert settings.SESSION_COOKIE_NAME not in api.cookies
    assert api.get(ME_URL).status_code == 401

    login = browser_post(api, "login", {"email": "new@example.com", "password": PASSWORD})
    assert login.status_code == 200
    assert login.json() == {"is_authenticated": True, "session_token": None}
    assert api.get(ME_URL).json()["id"] == new_user.pk


def test_login_rotates_the_csrf_token(api, user):
    before = csrf(api)["X-CSRFToken"]

    assert browser_post(api, "login", {"email": user.email, "password": PASSWORD}).status_code == 200

    assert api.cookies[settings.CSRF_COOKIE_NAME] != before
    assert api.post(f"{ACCOUNT}/logout", headers={"X-CSRFToken": before}).status_code == 403


def test_login_replaces_the_session_of_the_browser(api, user):
    planted = SessionStore()
    planted["planted"] = True
    planted.create()
    api.cookies.set(settings.SESSION_COOKIE_NAME, planted.session_key)

    assert browser_post(api, "login", {"email": user.email, "password": PASSWORD}).status_code == 200

    assert not SessionStore().exists(planted.session_key)


def test_a_host_that_is_not_allowed_is_a_400(api, user):
    response = api.post(
        f"{ACCOUNT}/login",
        json={"email": user.email, "password": PASSWORD},
        headers={**APP_CLIENT, "Host": "attacker.example"},
    )

    assert response.status_code == 400
    assert response.json()["detail_code"] == "hopwatch.unknown_host"


def test_browser_login_without_csrf_token_is_refused(api, user):
    csrf(api)

    response = api.post(f"{ACCOUNT}/login", json={"email": user.email, "password": PASSWORD})

    assert response.status_code == 403
    assert response.json()["detail_code"] == "hopwatch.csrf_failed"
    assert api.get(ME_URL).status_code == 401


def test_browser_login_from_a_foreign_origin_is_refused(api, user):
    headers = {**csrf(api), "Origin": "https://attacker.example"}

    response = api.post(f"{ACCOUNT}/login", json={"email": user.email, "password": PASSWORD}, headers=headers)

    assert response.status_code == 403
    assert response.json()["detail_code"] == "hopwatch.csrf_failed"


def test_browser_logout_without_csrf_token_is_refused(api, user):
    assert browser_post(api, "login", {"email": user.email, "password": PASSWORD}).status_code == 200

    assert api.post(f"{ACCOUNT}/logout").status_code == 403
    assert api.get(ME_URL).status_code == 200


@pytest.mark.parametrize("email", ["ana.novak@example.com", "nobody@example.com"])
@pytest.mark.usefixtures("user")
def test_wrong_password_or_unknown_address_is_the_same_error(api, email):
    response = browser_post(api, "login", {"email": email, "password": f"{PASSWORD}-wrong"})

    assert field_codes(response) == {"password": ["hopwatch.email_password_mismatch"]}
    assert api.get(ME_URL).status_code == 401


def test_login_with_an_invalid_address_or_no_password(api):
    response = browser_post(api, "login", {"email": "not-an-address", "password": ""})

    assert field_codes(response) == {"email": ["fastapi-viewsets.invalid"], "password": ["fastapi-viewsets.required"]}


def test_unverified_address_logs_in(api, user):
    EmailAddress.objects.create(user=user, email=user.email, verified=False, primary=True)

    response = browser_post(api, "login", {"email": user.email, "password": PASSWORD})

    assert response.json()["is_authenticated"] is True
    assert api.get(ME_URL).json()["id"] == user.pk


def test_login_while_logged_in_is_refused(api, user):
    assert browser_post(api, "login", {"email": user.email, "password": PASSWORD}).status_code == 200

    response = browser_post(api, "login", {"email": user.email, "password": PASSWORD})

    assert response.status_code == 409
    assert response.json()["detail_code"] == "hopwatch.already_logged_in"


@override_settings(ACCOUNT_RATE_LIMITS={"login": "2/m/ip"})
def test_too_many_logins_from_one_address(api, user):
    for _ in range(2):
        browser_post(api, "login", {"email": user.email, "password": f"{PASSWORD}-wrong"})

    response = browser_post(api, "login", {"email": user.email, "password": PASSWORD})

    assert response.status_code == 429
    assert response.json()["detail_code"] == "hopwatch.too_many_requests"


def test_signup_refuses_a_taken_address_and_a_weak_password(api, user):
    taken = browser_post(api, "signup", {"email": user.email, "password": PASSWORD})
    assert field_codes(taken) == {"email": ["hopwatch.email_taken"]}

    weak = browser_post(api, "signup", {"email": "new@example.com", "password": "1234"})
    errors = weak.json()["field_errors"]["password"]
    codes = field_codes(weak)["password"]
    assert "hopwatch.password_too_short" in codes
    assert "hopwatch.password_entirely_numeric" in codes
    assert errors[codes.index("hopwatch.password_too_short")]["params"] == {"min_length": 8}
    assert not get_user_model().objects.filter(email="new@example.com").exists()


def test_app_client_session_token_flow(api, user):
    login = api.post(f"{ACCOUNT}/login", json={"email": user.email, "password": PASSWORD}, headers=APP_CLIENT)
    assert login.status_code == 200
    token = login.json()["session_token"]
    assert token
    assert login.json()["is_authenticated"] is True
    assert settings.SESSION_COOKIE_NAME not in login.cookies
    assert settings.CSRF_COOKIE_NAME not in login.cookies

    session = {**APP_CLIENT, "X-Session-Token": token}
    assert api.get(ME_URL, headers={"X-Session-Token": token}).json()["id"] == user.pk
    state = api.get(f"{ACCOUNT}/session", headers=session).json()
    assert state["is_authenticated"] is True
    assert state["account"]["email"] == user.email

    logout = api.post(f"{ACCOUNT}/logout", headers=session)
    assert logout.status_code == 200
    assert logout.json()["is_authenticated"] is False
    assert api.get(ME_URL, headers={"X-Session-Token": token}).status_code == 401
    expired = api.get(f"{ACCOUNT}/session", headers=session)
    assert expired.status_code == 401
    assert expired.json()["detail_code"] == "fastapi-viewsets.session_expired"


def test_app_client_signup_gets_a_session_token(api):
    response = api.post(
        f"{ACCOUNT}/signup", json={"email": "app@example.com", "password": PASSWORD}, headers=APP_CLIENT
    )

    assert response.status_code == 200
    token = response.json()["session_token"]
    assert api.get(ME_URL, headers={"X-Session-Token": token}).json()["email"] == "app@example.com"


def test_app_client_ignores_the_session_cookie(api, user):
    api.cookies.set(settings.SESSION_COOKIE_NAME, session_key_of(user))

    state = api.get(f"{ACCOUNT}/session", headers=APP_CLIENT).json()

    assert state["is_authenticated"] is False


def test_no_providers_without_configuration(api):
    assert api.get(f"{ACCOUNT}/providers").json() == []


@override_settings(SOCIALACCOUNT_PROVIDERS=GOOGLE)
def test_providers_leave_out_hidden_apps(api):
    assert api.get(f"{ACCOUNT}/providers").json() == [
        {"id": "google", "name": "Google", "flows": ["redirect", "token"], "client_id": "web-client"}
    ]


@override_settings(SOCIALACCOUNT_PROVIDERS=GOOGLE)
def test_social_redirect_answers_the_provider_url_and_keeps_the_state(api):
    response = browser_post(api, "social/redirect", {"provider": "google", "callback_url": "/login"})

    assert response.status_code == 200, response.text
    location = response.json()["location"]
    assert location.startswith("https://accounts.google.com/")
    assert "client_id=web-client" in location
    assert api.cookies[settings.SESSION_COOKIE_NAME]


@override_settings(SOCIALACCOUNT_PROVIDERS=GOOGLE)
def test_social_redirect_refuses_an_unknown_provider_and_a_foreign_callback(api):
    unknown = browser_post(api, "social/redirect", {"provider": "github", "callback_url": "/login"})
    assert field_codes(unknown) == {"provider": ["hopwatch.unknown_provider"]}

    foreign = browser_post(
        api, "social/redirect", {"provider": "google", "callback_url": "https://attacker.example/login"}
    )
    assert field_codes(foreign) == {"callback_url": ["hopwatch.invalid_url"]}


@override_settings(SOCIALACCOUNT_PROVIDERS=GOOGLE)
def test_social_token_refuses_an_unknown_client_and_a_missing_token(api):
    unknown_client = api.post(
        f"{ACCOUNT}/social/token",
        json={"provider": "google", "client_id": "other-client", "id_token": "x"},
        headers=APP_CLIENT,
    )
    assert field_codes(unknown_client) == {"token": ["hopwatch.invalid_token"]}

    no_token = api.post(
        f"{ACCOUNT}/social/token", json={"provider": "google", "client_id": "android-client"}, headers=APP_CLIENT
    )
    assert field_codes(no_token) == {"token": ["hopwatch.token_required"]}


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
