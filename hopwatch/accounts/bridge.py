"""
Runs allauth's account flows for the API: builds a Django request from the headers and cookies of an API request,
prepared as allauth's headless views prepare theirs, and turns the session it leaves into the API's answer.

A browser client's session is Django's session cookie and its unsafe requests need the CSRF token, as for any
Django view. An app client (`X-Client-Type: app`) sends the session token in `X-Session-Token` and no cookies.
"""

import ipaddress

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

from allauth.core import context as allauth_context
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.headless.constants import Client
from allauth.headless.internal import authkit, sessionkit
from allauth.headless.internal.decorators import mark_request_as_headless
from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user
from django.core.exceptions import DisallowedHost, ValidationError
from django.middleware.csrf import CsrfViewMiddleware, get_token
from django.test import RequestFactory
from django.utils.functional import SimpleLazyObject
from fastapi_viewsets.exceptions import DfViewSetError, SessionExpiredError
from fastapi_viewsets.middleware import ViewSetResult
from pydantic import BaseModel, Field

from hopwatch.motis import ERROR_NAMESPACE

SESSION_TOKEN_HEADER = "X-Session-Token"  # noqa: S105 - a header name
CLIENT_TYPE_HEADER = "X-Client-Type"
APP_CLIENT = "app"

# Django codes that fastapi-viewsets maps to its own field error codes; every other code is the application's.
_LIBRARY_CODES = frozenset({"required", "blank", "null", "max_length", "min_length", "invalid"})

_factory = RequestFactory()


class TooManyRequestsError(DfViewSetError):
    """429 `hopwatch.too_many_requests`: too many attempts from this address or for this account."""

    def __init__(self):
        super().__init__(429, "Too many requests. Wait a moment and try again.", f"{ERROR_NAMESPACE}.too_many_requests")


class CsrfFailedError(DfViewSetError):
    """403 `hopwatch.csrf_failed`: a browser client's unsafe request without a valid CSRF token or origin."""

    def __init__(self):
        super().__init__(
            403,
            "The request has no valid CSRF token, or comes from an origin that is not trusted.",
            f"{ERROR_NAMESPACE}.csrf_failed",
        )


class AlreadyLoggedInError(DfViewSetError):
    """409 `hopwatch.already_logged_in`: the session is logged in already."""

    def __init__(self):
        super().__init__(
            409, "The session is logged in already. Log out first.", f"{ERROR_NAMESPACE}.already_logged_in"
        )


class UnknownHostError(DfViewSetError):
    """400 `hopwatch.unknown_host`: the request's `Host` is not one of the server's hosts."""

    def __init__(self):
        super().__init__(400, "The request's host is not one of the server's hosts.", f"{ERROR_NAMESPACE}.unknown_host")


class SignupClosedError(DfViewSetError):
    """403 `hopwatch.signup_closed`: new accounts cannot be created."""

    def __init__(self):
        super().__init__(403, "New accounts cannot be created.", f"{ERROR_NAMESPACE}.signup_closed")


def error_code(code: str) -> str:
    """`code` as the API's field error code: Django's generic codes as they are, any other in `hopwatch.`."""
    return code if "." in code or code in _LIBRARY_CODES else f"{ERROR_NAMESPACE}.{code}"


def form_error(form: Any) -> ValidationError:
    """The errors of a Django form, by field, with the codes of `error_code()`."""
    return ValidationError(
        {
            field: [
                ValidationError(error.message, code=error_code(error.code or "invalid"), params=error.params)
                for error in errors
            ]
            for field, errors in form.errors.as_data().items()
        }
    )


def is_app_client(headers: dict[str, str]) -> bool:
    return headers.get(CLIENT_TYPE_HEADER.lower()) == APP_CLIENT


def _is_ip_address(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def _django_request(method: str, headers: dict[str, str], cookies: dict[str, str], client_ip: str | None):
    meta = {}
    for name, value in headers.items():
        # Cookies come from `cookies`; a name with `_` would pose as the `-` header of the same META key.
        if name == "cookie" or "_" in name:
            continue
        key = "CONTENT_TYPE" if name == "content-type" else f"HTTP_{name.upper().replace('-', '_')}"
        meta[key] = value
    meta.setdefault("CONTENT_TYPE", "application/json")
    if client_ip and _is_ip_address(client_ip):
        meta["REMOTE_ADDR"] = client_ip
    request = _factory.generic(method, "/", data=b"", **meta)
    request.COOKIES.update(cookies)
    request.session = sessionkit.session_store(request.COOKIES.get(settings.SESSION_COOKIE_NAME))
    request.user = SimpleLazyObject(lambda: get_user(request))
    request.allauth = SimpleNamespace()
    return request


def _check_csrf(request) -> None:
    """Django's CSRF check of the request (origin and token); a browser client's request without one fails."""
    middleware = CsrfViewMiddleware(lambda _request: None)
    middleware.process_request(request)
    if middleware.process_view(request, None, (), {}) is not None:
        raise CsrfFailedError()


@contextmanager
def django_request(
    *, method: str, headers: dict[str, str], cookies: dict[str, str], client_ip: str | None = None
) -> Iterator[Any]:
    """
    A Django request with `headers` (lower-case names) and `cookies`, inside allauth's request context. For an app
    client the session is the one of `X-Session-Token`, for a browser client the one of the session cookie; an
    unsafe browser request must pass Django's CSRF check. An unknown session token raises `SessionExpiredError`.
    """
    app = is_app_client(headers)
    request = _django_request(method, headers, {} if app else cookies, client_ip)
    mark_request_as_headless(request, Client.APP if app else Client.BROWSER)
    with allauth_context.request_context(request):
        if app:
            try:
                with authkit.authentication_context(request):
                    yield request
            except ImmediateHttpResponse as error:
                if error.response.status_code == 410:
                    raise SessionExpiredError() from error
                raise
        else:
            _check_csrf(request)
            get_token(request)
            yield request


def _raise_rate_limit(error: ImmediateHttpResponse) -> None:
    if error.response.status_code == 429:
        raise TooManyRequestsError() from error
    raise error


async def run_flow(fn: Callable[..., Any], *, method: str, headers, cookies, client_ip, **kwargs) -> Any:
    """
    `fn(request, **kwargs)` in `django_request()`, on a worker thread; allauth's rate limit is a 429, a `Host` that
    is not allowed a 400.
    """

    def in_request() -> Any:
        try:
            with django_request(method=method, headers=headers, cookies=cookies, client_ip=client_ip) as request:
                return fn(request, **kwargs)
        except ImmediateHttpResponse as error:
            _raise_rate_limit(error)
        except DisallowedHost:
            raise UnknownHostError() from None

    return await sync_to_async(in_request)()


class SessionResult(BaseModel):
    """The session after an operation that may change it."""

    is_authenticated: bool = Field(description="Whether the session is logged in after the operation.")
    session_token: str | None = Field(
        default=None,
        description=(
            "For an app client (`X-Client-Type: app`), when the operation started or changed its session: the token "
            "it sends in the `X-Session-Token` header of later calls. Null otherwise, and always for a browser "
            "client, whose session is the session cookie."
        ),
    )


def _cookie_options(prefix: str) -> dict[str, Any]:
    samesite = getattr(settings, f"{prefix}_COOKIE_SAMESITE")
    return {
        "path": getattr(settings, f"{prefix}_COOKIE_PATH"),
        "domain": getattr(settings, f"{prefix}_COOKIE_DOMAIN"),
        "secure": getattr(settings, f"{prefix}_COOKIE_SECURE"),
        "httponly": getattr(settings, f"{prefix}_COOKIE_HTTPONLY"),
        "samesite": samesite.lower() if samesite else None,
    }


def finalize_session(request, body: BaseModel | None = None) -> ViewSetResult:
    """
    Saves the session the flow left and answers `body` (default `SessionResult`). An app client gets a new session
    token in the body; a browser client gets the session cookie set, or deleted after a logout, and the CSRF cookie
    whenever Django changed or created the token.
    """
    if body is None:
        body = SessionResult(is_authenticated=request.user.is_authenticated)
    result = ViewSetResult(body=body)
    if request.allauth.headless.client == Client.APP:
        if isinstance(body, SessionResult):
            body.session_token = sessionkit.expose_session_token(request)
        return result
    if request.session.modified:
        options = _cookie_options("SESSION")
        if request.session.is_empty():
            result.delete_cookie(settings.SESSION_COOKIE_NAME, **options)
        else:
            request.session.save()
            result.set_cookie(
                settings.SESSION_COOKIE_NAME,
                request.session.session_key,
                max_age=settings.SESSION_COOKIE_AGE,
                **options,
            )
    if request.META.get("CSRF_COOKIE_NEEDS_UPDATE"):
        result.set_cookie(
            settings.CSRF_COOKIE_NAME,
            request.META["CSRF_COOKIE"],
            max_age=settings.CSRF_COOKIE_AGE,
            **_cookie_options("CSRF"),
        )
    return result
