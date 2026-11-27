"""
The user's account: login, signup, logout, social login and the session state.

The flows run in `hopwatch.accounts.flows`; a browser client's session is Django's session cookie, an app client
(`X-Client-Type: app`) sends `X-Session-Token`.
"""

from collections.abc import Callable
from typing import Any

from django.core.exceptions import NON_FIELD_ERRORS, ValidationError
from fastapi import APIRouter
from fastapi_viewsets.action_configuration import action_configuration
from fastapi_viewsets.context import Context
from fastapi_viewsets.endpoint_docs import endpoint_docs, merge_openapi_extra
from fastapi_viewsets.exceptions import SessionExpiredError
from fastapi_viewsets.middleware import ViewSetResult
from fastapi_viewsets.middleware.auth import Session
from fastapi_viewsets.response_classes import error_entry, merge_responses
from pydantic import BaseModel, ConfigDict, Field

from hopwatch.accounts import flows
from hopwatch.accounts.bridge import (
    AlreadyLoggedInError,
    CsrfFailedError,
    run_flow,
    SessionResult,
    SignupClosedError,
    TooManyRequestsError,
    UnknownHostError,
)
from hopwatch.accounts.flows import Account, Provider, SessionState, SocialRedirect
from hopwatch.api.openapi_docs import CLIENT_TYPE_PARAMETER, SESSION_OPTIONAL, SESSION_REQUIRED


class Credentials(BaseModel):
    """Email address and password of an account."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"email": "ana.novak@example.com", "password": "correct horse battery staple"}]}
    )

    email: str = Field(description="The account's email address.")
    password: str = Field(description="The account's password.")


class SignupInput(Credentials):
    """The email address and password of a new account."""

    password: str = Field(
        description=(
            "The new account's password: at least 8 characters, not too similar to the email address, not a "
            "commonly used password and not entirely numeric."
        )
    )


class SocialRedirectInput(BaseModel):
    """The provider of a browser's social login and the page it returns to."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"provider": "google", "callback_url": "https://hopwatch.example/login"}]}
    )

    provider: str = Field(description="The provider's id from `GET /account/providers`, with the `redirect` flow.")
    callback_url: str = Field(
        description=(
            "The page the browser returns to after the login: a path, or a URL on the server's own host or another "
            "allowed one. A failed login adds the query parameters `error` (e.g. `cancelled`, `signup_closed`) and "
            "`error_process`."
        )
    )


class SocialTokenInput(BaseModel):
    """A token that the provider's sign-in SDK issued on the device."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"provider": "google", "client_id": "123-abc.apps.googleusercontent.com", "id_token": "eyJ…"}]
        }
    )

    provider: str = Field(description="The provider's id from `GET /account/providers`, with the `token` flow.")
    client_id: str | None = Field(
        default=None, description="The OAuth client ID the token was issued for; required by Google and Apple."
    )
    id_token: str | None = Field(default=None, description="The OpenID Connect ID token.")
    access_token: str | None = Field(
        default=None, description="The OAuth access token, for a provider that accepts one instead of an ID token."
    )


def _field_error(field: str, code: str, message: str) -> ValidationError:
    return ValidationError({field: [ValidationError(message, code=code)]})


TOO_MANY_REQUESTS = error_entry(
    429,
    "Too many attempts from this address: `hopwatch.too_many_requests`. Nothing was done; retry later.",
    TooManyRequestsError(),
)
CSRF_FAILED = error_entry(
    403,
    "A browser client's call without an `X-CSRFToken` header that matches the `csrftoken` cookie, or from an origin "
    "that is not trusted: `hopwatch.csrf_failed`.",
    CsrfFailedError(),
)
ALREADY_LOGGED_IN = error_entry(
    409, "The session is logged in already: `hopwatch.already_logged_in`.", AlreadyLoggedInError()
)
SIGNUP_CLOSED = error_entry(403, "New accounts cannot be created: `hopwatch.signup_closed`.", SignupClosedError())


def session_operation(entry: dict[str, Any]) -> dict[str, Any]:
    """
    `entry` of an action that reads or changes the session: with the `X-Client-Type` parameter, an optional
    session, the 400 of a host that is not allowed and the 401 of an unknown session token.
    """
    return {
        **entry,
        "responses": merge_responses(
            entry.get("responses"),
            error_entry(
                400,
                "The `Host` of the request is not one of the server's hosts: `hopwatch.unknown_host`.",
                UnknownHostError(),
            ),
            error_entry(
                401,
                "An app client's `X-Session-Token` names no session (it expired or was logged out): "
                "`fastapi-viewsets.session_expired`.",
                SessionExpiredError(),
            ),
        ),
        "openapi_extra": merge_openapi_extra(
            {"parameters": [CLIENT_TYPE_PARAMETER], "security": SESSION_OPTIONAL}, entry.get("openapi_extra")
        ),
    }


@endpoint_docs(
    {
        "session": session_operation(
            {
                "summary": "Session state",
                "description": (
                    "Whether the session is logged in, and its user. Answers 200 also without a session. A browser "
                    "client gets the `csrftoken` cookie, whose value its `POST` calls send in `X-CSRFToken`."
                ),
                "response_description": "The session and its user.",
            }
        ),
        "me": {
            "summary": "Logged-in user",
            "description": "The user of the current session.",
            "response_description": "The logged-in user.",
            "responses": error_entry(
                401,
                "No session, or the session has expired or was logged out: `fastapi-viewsets.session_expired`.",
                SessionExpiredError(),
            ),
            "openapi_extra": {"security": SESSION_REQUIRED},
        },
        "login": session_operation(
            {
                "summary": "Log in",
                "description": "Logs the session in with the email address and password of an account.",
                "response_description": "The logged-in session.",
                "responses": merge_responses(
                    CSRF_FAILED,
                    ALREADY_LOGGED_IN,
                    TOO_MANY_REQUESTS,
                    error_entry(
                        422,
                        "The login is refused, by field: `password` `hopwatch.email_password_mismatch` (the address "
                        "has no account or the password is wrong); `email` `fastapi-viewsets.invalid` (not an email "
                        "address); `fastapi-viewsets.required` for a missing value; `''` "
                        "`hopwatch.too_many_login_attempts` (too many failed attempts for the account; retry later).",
                        wrong_password=_field_error(
                            "password",
                            "hopwatch.email_password_mismatch",
                            "The email address and/or password you specified are not correct.",
                        ),
                        invalid_email=_field_error("email", "invalid", "Enter a valid email address."),
                        too_many_attempts=_field_error(
                            NON_FIELD_ERRORS,
                            "hopwatch.too_many_login_attempts",
                            "Too many failed login attempts. Try again later.",
                        ),
                    ),
                ),
            }
        ),
        "signup": session_operation(
            {
                "summary": "Create an account",
                "description": (
                    "Creates an account with an email address and a password, and logs the session in. The email "
                    "address is not verified."
                ),
                "response_description": "The logged-in session of the new account.",
                "responses": merge_responses(
                    CSRF_FAILED,
                    SIGNUP_CLOSED,
                    ALREADY_LOGGED_IN,
                    TOO_MANY_REQUESTS,
                    error_entry(
                        422,
                        "The account is refused, by field: `email` `hopwatch.email_taken` (another account has the "
                        "address) or `fastapi-viewsets.invalid`; `password` `hopwatch.password_too_short` "
                        "{min_length}, `hopwatch.password_too_common`, `hopwatch.password_entirely_numeric` or "
                        "`hopwatch.password_too_similar` {verbose_name}; `fastapi-viewsets.required` for a missing "
                        "value.",
                        email_taken=_field_error(
                            "email", "hopwatch.email_taken", "A user is already registered with this email address."
                        ),
                        too_common=_field_error(
                            "password", "hopwatch.password_too_common", "This password is too common."
                        ),
                    ),
                ),
            }
        ),
        "logout": session_operation(
            {
                "summary": "Log out",
                "description": "Ends the session the call carries; without one, it changes nothing.",
                "response_description": "The session, no longer logged in.",
                "responses": CSRF_FAILED,
            }
        ),
        "providers": session_operation(
            {
                "summary": "Social login providers",
                "description": "The providers a user can log in with, in the order to offer them; empty without any.",
                "response_description": "The configured providers.",
            }
        ),
        "social_redirect": session_operation(
            {
                "summary": "Start a social login in a browser",
                "description": (
                    "Returns the provider's authorisation URL for the browser to navigate to, and keeps the login's "
                    "state in the session. The provider returns the browser to the server, which logs the session "
                    "in (creating the account at the first login) and redirects it to `callback_url`."
                ),
                "response_description": "Where the browser continues.",
                "responses": merge_responses(
                    CSRF_FAILED,
                    error_entry(
                        422,
                        "`provider` `hopwatch.unknown_provider` (not configured), or `callback_url` "
                        "`hopwatch.invalid_url` (a host that is not allowed).",
                        unknown_provider=_field_error("provider", "hopwatch.unknown_provider", "Unknown provider."),
                    ),
                ),
            }
        ),
        "social_token": session_operation(
            {
                "summary": "Log in with a provider's token",
                "description": (
                    "Logs the session in with a token that the provider's sign-in SDK issued on the device, creating "
                    "the account at the first login. `is_authenticated` is false when the provider's account cannot "
                    "be signed up automatically, e.g. because another account has its email address."
                ),
                "response_description": "The session after the login.",
                "responses": merge_responses(
                    CSRF_FAILED,
                    SIGNUP_CLOSED,
                    ALREADY_LOGGED_IN,
                    error_entry(
                        422,
                        "`provider` `hopwatch.unknown_provider` or `hopwatch.token_authentication_not_supported`; "
                        "`token` `hopwatch.invalid_token`, `hopwatch.client_id_required`, "
                        "`hopwatch.client_id_mismatch` or `hopwatch.token_required` (neither `id_token` nor "
                        "`access_token`).",
                        invalid_token=_field_error("token", "hopwatch.invalid_token", "Invalid token."),
                    ),
                ),
            }
        ),
    }
)
class AccountViewSet:
    """
    The user's account: log in with email and password or with a social provider, create an account, log out, and
    read the session. A browser client's session is the session cookie; an app client sends `X-Client-Type: app`
    and the session token in `X-Session-Token`.
    """

    __router = APIRouter()

    @__router.get("session")
    async def session(self, context: Context) -> ViewSetResult[SessionState]:
        return await _run(context, "GET", flows.session_state)

    @action_configuration({Session: True})
    @__router.get("me")
    async def me(self, context: Context) -> Account:
        return flows.account_of(await context.user)

    @__router.post("login")
    async def login(self, context: Context, data: Credentials) -> ViewSetResult[SessionResult]:
        return await _run(context, "POST", flows.login, email=data.email, password=data.password)

    @__router.post("signup")
    async def signup(self, context: Context, data: SignupInput) -> ViewSetResult[SessionResult]:
        return await _run(context, "POST", flows.signup, email=data.email, password=data.password)

    @__router.post("logout")
    async def logout(self, context: Context) -> ViewSetResult[SessionResult]:
        return await _run(context, "POST", flows.logout)

    @__router.get("providers")
    async def providers(self, context: Context) -> list[Provider]:
        return await _run(context, "GET", flows.providers)

    @__router.post("social/redirect")
    async def social_redirect(self, context: Context, data: SocialRedirectInput) -> ViewSetResult[SocialRedirect]:
        return await _run(
            context, "POST", flows.social_redirect, provider=data.provider, callback_url=data.callback_url
        )

    @__router.post("social/token")
    async def social_token(self, context: Context, data: SocialTokenInput) -> ViewSetResult[SessionResult]:
        return await _run(
            context,
            "POST",
            flows.social_token,
            provider=data.provider,
            client_id=data.client_id,
            id_token=data.id_token,
            access_token=data.access_token,
        )


async def _run(context: Context, method: str, fn: Callable[..., Any], **kwargs: Any) -> Any:
    """`fn` in a Django request built from the call's headers, cookies and client address."""
    return await run_flow(
        fn,
        method=method,
        headers=await context.headers,
        cookies=await context.cookies,
        client_ip=await context.client_ip,
        **kwargs,
    )
