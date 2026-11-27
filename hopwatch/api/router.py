"""The /api/v1 router; every viewset and plain router of the API is registered here."""

import hopwatch.api.viewsets_config  # noqa: F401,I001 - must run before any viewset is decorated

from fastapi import APIRouter
from fastapi_viewsets.decorators import route_viewset

from hopwatch.api.account.account_viewset import AccountViewSet
from hopwatch.api.departures.viewsets import DeparturesViewSet
from hopwatch.api.journeys.viewsets import JourneysViewSet
from hopwatch.api.operators.viewsets import OperatorsViewSet
from hopwatch.api.stops.viewsets import StopsViewSet

router = APIRouter()

route_viewset(router, base_path="/account")(AccountViewSet)
route_viewset(router, base_path="/stops", pk_field_name="id")(StopsViewSet)
route_viewset(router, base_path="/departures", pk_field_name="trip_id")(DeparturesViewSet)
route_viewset(router, base_path="/journeys")(JourneysViewSet)
route_viewset(router, base_path="/operators", pk_field_name="id")(OperatorsViewSet)
