"""
The account of the logged-in user.

The user logs in through allauth headless (`/_allauth/browser/v1/...` in a browser, `/_allauth/app/v1/...` in the
mobile app); this API only reads the session that allauth established. A browser sends Django's session cookie, the
app sends `X-Session-Token: <meta.session_token>`.
"""

from typing import Any

from fastapi import APIRouter
from fastapi_viewsets.action_configuration import action_configuration
from fastapi_viewsets.context import Context
from fastapi_viewsets.endpoint_docs import endpoint_docs
from fastapi_viewsets.exceptions import SessionExpiredError
from fastapi_viewsets.middleware.auth import Session
from fastapi_viewsets.response_classes import error_entry
from pydantic import BaseModel, Field


class AccountMe(BaseModel):
    """The logged-in user."""

    id: int = Field(description="Primary key of the user.")
    email: str = Field(description="Email address the user logs in with.")
    display_name: str = Field(
        description="Name to show for the user: first and last name, else the part of the email address before `@`."
    )


def display_name_of(user: Any) -> str:
    """First and last name of `user`, else the local part of the email address, else the username."""
    full_name = user.get_full_name().strip()
    if full_name:
        return full_name
    if user.email:
        return user.email.split("@", 1)[0]
    return user.get_username()


@endpoint_docs(
    {
        "me": {
            "summary": "Logged-in user",
            "description": (
                "Returns the user of the current session. A browser authenticates with Django's session cookie "
                "set by allauth headless (`/_allauth/browser/v1/auth/login`); the mobile app sends the "
                "`session_token` of allauth's app client in the `X-Session-Token` header."
            ),
            "response_description": "The logged-in user.",
            "responses": error_entry(
                401,
                "No session, or the session has expired or was logged out: `fastapi-viewsets.session_expired`.",
                SessionExpiredError(),
            ),
        },
    }
)
class AccountViewSet:
    """The account of the logged-in user. Login, signup and logout go through allauth headless at `/_allauth/`."""

    __router = APIRouter()

    @action_configuration({Session: True})
    @__router.get("me")
    async def me(self, context: Context) -> AccountMe:
        user = await context.user
        return AccountMe(id=user.pk, email=user.email, display_name=display_name_of(user))
