"""The FastAPI application: `uvicorn hopwatch.api.main:app`."""

import hopwatch.api.django_setup  # noqa: F401,I001 - must be the first import

from django.conf import settings
from fastapi import FastAPI
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from fastapi_viewsets.endpoint_docs import apply_viewset_tags
from fastapi_viewsets.error_responses import install_error_handlers

import hopwatch

from hopwatch.api.openapi_docs import API_TRY_BUTTON_CLASS, apply_openapi_docs, REDOC_PATH, SWAGGER_UI_PATH
from hopwatch.api.router import router

app = FastAPI(
    title="Hopwatch API",
    version=hopwatch.__version__,
    docs_url=None,
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

install_error_handlers(app)
app.include_router(router, prefix="/api/v1")
apply_viewset_tags(app)


def custom_openapi() -> dict:
    """The generated schema, completed by `apply_openapi_docs()`."""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes, tags=app.openapi_tags)
    app.openapi_schema = apply_openapi_docs(schema, app.routes)
    return app.openapi_schema


app.openapi = custom_openapi

# A "Try it" link also matches by its href: Swagger UI's sanitiser removes the class of the `<div>` around it.
_TRY_LINK = f'a[href^="{SWAGGER_UI_PATH}#/"]'

_REDOC_HEAD_EXTRA = f"""
<style>
  .{API_TRY_BUTTON_CLASS} {{
    margin-top: 0.4em;
  }}
  .{API_TRY_BUTTON_CLASS} a, {_TRY_LINK} {{
    display: inline-block;
    padding: 0.3em 0.9em;
    background: #1f6feb;
    color: #fff !important;
    border-radius: 0.4em;
    font-size: 0.85em;
    font-weight: 600;
    text-decoration: none !important;
  }}
  .{API_TRY_BUTTON_CLASS} a:hover, {_TRY_LINK}:hover {{
    background: #1858bc;
  }}
</style>
"""

_SWAGGER_HEAD_EXTRA = f"""
<style>
  .{API_TRY_BUTTON_CLASS}, .redoc-only, {_TRY_LINK} {{
    display: none !important;
  }}
</style>
<script>
  // A browser client's POST needs the CSRF token of the cookie that GET /api/v1/account/session sets.
  function addCsrfToken(request) {{
    const match = document.cookie.match(/(?:^|;\\s*){settings.CSRF_COOKIE_NAME}=([^;]*)/);
    if (match && !request.headers["X-CSRFToken"]) request.headers["X-CSRFToken"] = decodeURIComponent(match[1]);
    return request;
  }}
</script>
"""


@app.get(REDOC_PATH, include_in_schema=False)
async def redoc_page() -> HTMLResponse:
    """ReDoc, with the style of the "Try it" buttons."""
    html = get_redoc_html(openapi_url=app.openapi_url, title=f"{app.title} - ReDoc").body.decode()
    return HTMLResponse(html.replace("</head>", _REDOC_HEAD_EXTRA + "</head>"))


@app.get(SWAGGER_UI_PATH, include_in_schema=False)
async def swagger_ui_page() -> HTMLResponse:
    """
    Swagger UI with "Try it out" switched on and the CSRF token added to its requests, without the content meant
    for ReDoc only.
    """
    html = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Swagger UI",
        swagger_ui_parameters={"tryItOutEnabled": True},
    ).body.decode()
    html = html.replace("SwaggerUIBundle({", "SwaggerUIBundle({\n        requestInterceptor: addCsrfToken,", 1)
    return HTMLResponse(html.replace("</head>", _SWAGGER_HEAD_EXTRA + "</head>"))
