"""The FastAPI application: `uvicorn hopwatch.api.main:app`."""

import hopwatch.api.django_setup  # noqa: F401,I001 - must be the first import

from fastapi import FastAPI
from fastapi_viewsets.endpoint_docs import apply_viewset_tags
from fastapi_viewsets.error_responses import install_error_handlers

import hopwatch

from hopwatch.api.router import router
from hopwatch.motis import DATA_ATTRIBUTION

app = FastAPI(
    title="Hopwatch API",
    description=f"Stops, departures and the account of the logged-in user.\n\n{DATA_ATTRIBUTION}",
    version=hopwatch.__version__,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

install_error_handlers(app)
app.include_router(router, prefix="/api/v1")
apply_viewset_tags(app)
