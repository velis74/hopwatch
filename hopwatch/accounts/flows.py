"""
Login, signup, logout, session state and social login, run through allauth's flows in a request built by
`hopwatch.accounts.bridge`. Each function takes that request first and runs on a worker thread.
"""

from typing import Any, Literal

from allauth.account.adapter import get_adapter as get_account_adapter
from allauth.account.internal import flows as account_flows
from allauth.core import ratelimit
from allauth.core.exceptions import SignupClosedException
from allauth.headless.account.inputs import LoginInput, SignupInput
from allauth.headless.socialaccount.forms import RedirectToProviderForm
from allauth.headless.socialaccount.inputs import ProviderTokenInput
from allauth.headless.socialaccount.internal import complete_token_login
from allauth.socialaccount.adapter import get_adapter as get_social_adapter
from allauth.socialaccount.providers.base.constants import AuthProcess
from django.core.exceptions import ValidationError
from fastapi_viewsets.middleware import ViewSetResult
from pydantic import BaseModel, Field

from hopwatch.accounts.bridge import (
    AlreadyLoggedInError,
    error_code,
    finalize_session,
    form_error,
    SessionResult,
    SignupClosedError,
    TooManyRequestsError,
)


class Account(BaseModel):
    """The logged-in user."""

    id: int = Field(description="Primary key of the user.")
    email: str = Field(description="Email address the user logs in with.")
    display_name: str = Field(
        description="Name to show for the user: first and last name, else the part of the email address before `@`."
    )


class SessionState(SessionResult):
    """The session and its user."""

    account: Account | None = Field(description="The logged-in user; null when the session is not logged in.")


class Provider(BaseModel):
    """A social login provider the server offers."""

    id: Literal["google", "apple"] = Field(description="The provider's id, used by the social login operations.")
    name: str = Field(description="The provider's name to show, e.g. `Google`.")
    flows: list[Literal["redirect", "token"]] = Field(
        description=(
            "How a client logs in with the provider: `redirect` through `POST /account/social/redirect` (a browser), "
            "`token` with an ID token through `POST /account/social/token` (the mobile app)."
        )
    )
    client_id: str | None = Field(
        description="The OAuth client ID the provider's sign-in SDK requests the ID token for; null without one."
    )


class SocialRedirect(BaseModel):
    """Where the browser continues a social login."""

    location: str = Field(description="The provider's authorisation URL; the browser navigates to it.")


def display_name_of(user: Any) -> str:
    """First and last name of `user`, else the local part of the email address, else the username."""
    full_name = user.get_full_name().strip()
    if full_name:
        return full_name
    if user.email:
        return user.email.split("@", 1)[0]
    return user.get_username()


def account_of(user: Any) -> Account:
    return Account(id=user.pk, email=user.email, display_name=display_name_of(user))


def _consume_rate_limit(request, action: str) -> None:
    if ratelimit.consume_or_429(request, action=action) is not None:
        raise TooManyRequestsError()


def _refuse_logged_in(request) -> None:
    if request.user.is_authenticated:
        raise AlreadyLoggedInError()


def session_state(request) -> ViewSetResult[SessionState]:
    user = request.user
    state = SessionState(
        is_authenticated=user.is_authenticated, account=account_of(user) if user.is_authenticated else None
    )
    return finalize_session(request, state)


def login(request, *, email: str, password: str) -> ViewSetResult[SessionResult]:
    """Logs in with email and password; a wrong password or an unknown address is the same field error."""
    _refuse_logged_in(request)
    _consume_rate_limit(request, "login")
    form = LoginInput(data={"email": email, "password": password})
    if not form.is_valid():
        raise form_error(form)
    account_flows.login.perform_password_login(request, form.cleaned_data, form.login)
    return finalize_session(request)


def signup(request, *, email: str, password: str) -> ViewSetResult[SessionResult]:
    """Creates an account with email and password and logs it in."""
    _refuse_logged_in(request)
    _consume_rate_limit(request, "signup")
    if not get_account_adapter().is_open_for_signup(request):
        raise SignupClosedError()
    form = SignupInput(data={"email": email, "password": password})
    if not form.is_valid():
        raise form_error(form)
    user, response = form.try_save(request)
    if response is None:
        account_flows.signup.complete_signup(request, user=user, by_passkey=False)
    return finalize_session(request)


def logout(request) -> ViewSetResult[SessionResult]:
    get_account_adapter().logout(request)
    return finalize_session(request)


def providers(request) -> list[Provider]:
    """The social providers the server is configured for, Google and Apple only, in that order."""
    found = {}
    for provider in get_social_adapter().list_providers(request):
        if provider.sub_id not in ("google", "apple"):
            continue
        flows = [
            name
            for name, supported in (
                ("redirect", provider.supports_redirect),
                ("token", provider.supports_token_authentication),
            )
            if supported
        ]
        app = getattr(provider, "app", None)
        found.setdefault(
            provider.sub_id,
            Provider(id=provider.sub_id, name=provider.name, flows=flows, client_id=app.client_id if app else None),
        )
    return [found[provider_id] for provider_id in ("google", "apple") if provider_id in found]


def social_redirect(request, *, provider: str, callback_url: str) -> ViewSetResult[SocialRedirect]:
    """
    Starts a browser's social login: the provider's authorisation URL, with the login's state in the session. The
    provider returns to the server, which logs the session in and redirects to `callback_url`, adding `error` and
    `error_process` query parameters when the login failed.
    """
    form = RedirectToProviderForm(data={"provider": provider, "callback_url": callback_url, "process": "login"})
    if not form.is_valid():
        raise form_error(form)
    response = form.cleaned_data["provider"].redirect(
        request, AuthProcess.LOGIN, next_url=form.cleaned_data["callback_url"], headless=True
    )
    location = response.get("Location") if response.status_code in (301, 302, 303, 307, 308) else None
    if not location:
        raise ValidationError({"provider": [ValidationError("The provider has no redirect.", code="invalid")]})
    return finalize_session(request, SocialRedirect(location=location))


def social_token(
    request, *, provider: str, client_id: str | None, id_token: str | None, access_token: str | None
) -> ViewSetResult[SessionResult]:
    """Logs in, signing up when needed, with a token the provider's sign-in SDK issued on the device."""
    _refuse_logged_in(request)
    token = {
        key: value
        for key, value in (("client_id", client_id), ("id_token", id_token), ("access_token", access_token))
        if value is not None
    }
    form = ProviderTokenInput(data={"provider": provider, "process": AuthProcess.LOGIN, "token": token})
    if not form.is_valid():
        raise form_error(form)
    try:
        complete_token_login(request, form.cleaned_data["sociallogin"])
    except SignupClosedException:
        raise SignupClosedError() from None
    except ValidationError as error:
        raise ValidationError(
            {"token": [ValidationError(error.messages[0], code=error_code(error.code or "invalid_token"))]}
        ) from error
    return finalize_session(request)
