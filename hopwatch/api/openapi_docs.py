"""
Additions to the generated OpenAPI schema that hold for every operation: the API description, the session
schemes (`securitySchemes`, `security`), the `X-Client-Type` parameter and the "Try it" link of each operation.
What holds for an operation is read from the `@action_configuration` of its viewset.
"""

import re

from collections.abc import Sequence
from typing import Any

from fastapi_viewsets.action_configuration import resolve_action_configuration
from fastapi_viewsets.middleware.auth import Session

from hopwatch.accounts.bridge import CLIENT_TYPE_HEADER, SESSION_TOKEN_HEADER
from hopwatch.motis import attribution_section, DATA_ATTRIBUTION, MAP_ATTRIBUTION

SWAGGER_UI_PATH = "/api/docs"
REDOC_PATH = "/api/redoc"

SESSION_COOKIE_SCHEME = "sessionCookie"
SESSION_TOKEN_SCHEME = "sessionToken"  # noqa: S105 - a scheme name

SESSION_REQUIRED = [{SESSION_COOKIE_SCHEME: []}, {SESSION_TOKEN_SCHEME: []}]
"""`security` of an operation that needs a logged-in session."""
SESSION_OPTIONAL = [{}, *SESSION_REQUIRED]
"""`security` of an operation that works without a session and uses the one the call carries."""
NO_SESSION: list = []
"""`security` of a public operation."""

CLIENT_TYPE_PARAMETER = {"$ref": "#/components/parameters/ClientType"}
"""The `X-Client-Type` header, for `parameters` of the operations that read or change the session."""

API_TRY_BUTTON_CLASS = "api-try-button"
"""Class of the `<div>` around each operation's "Try it" link; the class is on the `<div>` because Swagger UI's
sanitiser strips it from `<a>`."""


# Error codes of this API (`detail_code`, or `code` of a field error), with the status and when they occur.
ERROR_CODES: dict[str, tuple[str, str]] = {
    "hopwatch.stop_not_found": ("404", "No stop has the given id (`detail_params.stop_id`)."),
    "hopwatch.trip_not_found": ("404", "No ride has the given trip id (`detail_params.trip_id`)."),
    "hopwatch.timetable_unavailable": ("502", "The timetable service did not answer; retry later."),
    "hopwatch.csrf_failed": ("403", "A browser `POST` without a valid `X-CSRFToken` header or from a foreign origin."),
    "hopwatch.unknown_host": ("400", "The request's host is not one this server serves."),
    "hopwatch.already_logged_in": ("409", "Login or signup while a session is active."),
    "hopwatch.signup_closed": ("403", "Signup is closed."),
    "hopwatch.too_many_requests": ("429", "Too many login or signup attempts from this client; retry later."),
    "hopwatch.email_password_mismatch": ("422", "Field `password`: the address or the password is wrong."),
    "hopwatch.too_many_login_attempts": ("422", "Field `password`: too many failed attempts for the account."),
    "hopwatch.email_taken": ("422", "Field `email`: an account with this address exists."),
    "hopwatch.password_too_short": ("422", "Field `password`: shorter than the minimum length."),
    "hopwatch.password_too_common": ("422", "Field `password`: a commonly used password."),
    "hopwatch.password_entirely_numeric": ("422", "Field `password`: digits only."),
    "hopwatch.unknown_provider": ("422", "Field `provider`: no such social login provider is configured."),
    "hopwatch.invalid_url": ("422", "Field `callback_url`: a host that is not allowed."),
    "hopwatch.password_too_similar": ("422", "Field `password`: too similar to the address."),
    "hopwatch.token_authentication_not_supported": (
        "422",
        "Field `provider`: the provider does not support login with an ID token.",
    ),
    "hopwatch.invalid_token": ("422", "Field `token`: the provider's ID token is not valid."),
    "hopwatch.token_required": ("422", "Field `token`: the ID token is missing."),
    "hopwatch.client_id_required": ("422", "Field `token`: the app's client id is missing."),
    "hopwatch.client_id_mismatch": ("422", "Field `token`: the ID token was issued to another client."),
}

ERRORS_SECTION = (
    "**Errors.** Every error answers with the body `ApiErrorBody`: `detail` (English text), `detail_code` (the "
    "error's code), `detail_params` (the values in the text) and `field_errors` (by field, for a request that failed "
    "validation; each with its own `code` and `params`). Codes are `<namespace>.<code>`: `hopwatch.*` are this "
    "API's, `fastapi-viewsets.*` are the generic validation codes (`required`, `min_length`, `invalid` and others), "
    "the same for every endpoint. Each operation lists the errors it can answer.\n\n"
    "| Code | Status | When |\n| --- | --- | --- |\n"
    + "\n".join(f"| `{code}` | {status} | {text} |" for code, (status, text) in ERROR_CODES.items())
)


def api_description(cookie_name: str) -> str:
    return f"""
Stops, departures, rides, journey planning, transport operators and the user's account.

**Authentication.** `POST /api/v1/account/login` (or `signup`, or a social login) starts a session. A browser
client's session is the `{cookie_name}` cookie; its `POST` calls send the CSRF token in the `X-CSRFToken` header,
the value of the `csrftoken` cookie that `GET /api/v1/account/session` sets. An app client sends
`{CLIENT_TYPE_HEADER}: app` on the account operations, receives `session_token` in the answer and sends it in the
`{SESSION_TOKEN_HEADER}` header. Each operation lists the session it accepts under *Authorizations*; one without
authorizations is public.

{ERRORS_SECTION}

{attribution_section(DATA_ATTRIBUTION, MAP_ATTRIBUTION)}

<div class="redoc-only">
<h3>Trying it out</h3>
<p>This page is read-only documentation. To send a request to the server, use
<a href="{SWAGGER_UI_PATH}">Swagger UI</a>; every operation below has a "Try it" link to its entry there.</p>
</div>
""".strip()


def _components(cookie_name: str) -> dict[str, dict]:
    return {
        "securitySchemes": {
            SESSION_COOKIE_SCHEME: {
                "type": "apiKey",
                "in": "cookie",
                "name": cookie_name,
                "description": (
                    "The session of a browser client: the cookie that `POST /api/v1/account/login` sets when the "
                    f"request has no `{CLIENT_TYPE_HEADER}: app`."
                ),
            },
            SESSION_TOKEN_SCHEME: {
                "type": "apiKey",
                "in": "header",
                "name": SESSION_TOKEN_HEADER,
                "description": (
                    "The session of an app client: the `session_token` that `POST /api/v1/account/login` answers "
                    f"to a request with `{CLIENT_TYPE_HEADER}: app`. The account operations read it only from a "
                    f"request that also sends `{CLIENT_TYPE_HEADER}: app`."
                ),
            },
        },
        "parameters": {
            "ClientType": {
                "name": CLIENT_TYPE_HEADER,
                "in": "header",
                "required": False,
                "schema": {"type": "string", "default": "browser"},
                "example": "app",
                "description": (
                    "`app` for an app client; absent or any other value for a browser client. A browser client's "
                    f"session is the `{cookie_name}` cookie, which an operation that changes the session sets or "
                    "deletes, and its `POST` calls need the `X-CSRFToken` header with the value of the `csrftoken` "
                    f"cookie. An app client's session is the `{SESSION_TOKEN_HEADER}` header; it sends no cookies "
                    "and no CSRF token."
                ),
            },
        },
    }


def _swagger_ui_anchor(tag: str, operation_id: str) -> str:
    # Swagger UI's deep link escapes every character of the tag but letters, digits, `_` and `-` as `_`.
    slug = re.sub(r"[^\w-]", "_", tag)
    return f"{SWAGGER_UI_PATH}#/{slug}/{operation_id}"


def _status_order(item: tuple[str, Any]) -> tuple[int, str]:
    status = item[0]
    return (0, status) if status[:1].isdigit() else (1, status)


def _try_link(operation: dict[str, Any]) -> str:
    href = _swagger_ui_anchor(operation["tags"][0], operation["operationId"])
    label = "Try it in Swagger UI (opens in a new tab)"
    return (
        f'<div class="{API_TRY_BUTTON_CLASS}">'
        f'<a href="{href}" target="_blank" rel="noopener" aria-label="{label}">Try it ↗</a></div>'
    )


def apply_openapi_docs(schema: dict[str, Any], routes: Sequence[Any]) -> dict[str, Any]:
    """Completes the schema `get_openapi()` built from `routes`."""
    from django.conf import settings
    from fastapi.routing import APIRoute, iter_route_contexts

    cookie_name = settings.SESSION_COOKIE_NAME
    schema["info"]["description"] = api_description(cookie_name)
    components = schema.setdefault("components", {})
    for section, entries in _components(cookie_name).items():
        components.setdefault(section, {}).update(entries)

    for route_context in iter_route_contexts(routes):
        route = route_context.original_route
        cls = getattr(route.endpoint, "__viewset_class__", None)
        if not isinstance(route, APIRoute) or not route.include_in_schema or cls is None:
            continue
        config = resolve_action_configuration(cls, route.endpoint.__viewset_action__)
        path_item = schema["paths"].get(route_context.path_format, {})
        for method in route_context.methods or ():
            operation = path_item.get(method.lower())
            if operation is not None:
                operation.setdefault("security", SESSION_REQUIRED if config.get(Session) else NO_SESSION)

    for methods in schema.get("paths", {}).values():
        for method, operation in methods.items():
            if method == "parameters":
                continue
            if "responses" in operation:
                operation["responses"] = dict(sorted(operation["responses"].items(), key=_status_order))
            if operation.get("operationId") and operation.get("tags"):
                operation["description"] = "\n\n".join(
                    part for part in (operation.get("description") or "", _try_link(operation)) if part
                )
    return schema
