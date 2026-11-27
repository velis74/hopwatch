"""One ride of a vehicle (`/trips/{trip_id}`), read from MOTIS."""

from fastapi_viewsets.context import Context
from fastapi_viewsets.endpoint_docs import endpoint_docs
from fastapi_viewsets.exceptions import DfViewSetError
from fastapi_viewsets.mixins import RetrieveMixin
from fastapi_viewsets.response_classes import error_entry, merge_responses

from hopwatch.api.operators.mapping import known_operators
from hopwatch.api.trips.mapping import Trip, trip_from
from hopwatch.motis import (
    attribution_section,
    DATA_ATTRIBUTION,
    ERROR_NAMESPACE,
    get_motis,
    MOTIS_UNAVAILABLE_RESPONSE,
    MotisNotFoundError,
)


class TripNotFoundError(DfViewSetError):
    """The timetable has no trip with this id."""

    def __init__(self, trip_id: str):
        super().__init__(404, f"Trip {trip_id} not found", f"{ERROR_NAMESPACE}.trip_not_found", {"trip_id": trip_id})


@endpoint_docs(
    {
        "retrieve": {
            "summary": "One ride",
            "description": (
                "One ride of a vehicle, as departures and journey legs name it by `trip_id`: line, operator, "
                "amenities, the path and every stop in order with scheduled and expected times, platform and "
                "delay. Real-time delays where the operator publishes them. Public: no login needed.\n\n"
                f"{attribution_section(DATA_ATTRIBUTION)}"
            ),
            "response_description": "The ride.",
            "parameters": {"pk": "Trip id of a departure or journey leg; valid for its service day."},
            "responses": merge_responses(
                error_entry(
                    404,
                    "No ride has the trip id (`detail_params.trip_id`): `hopwatch.trip_not_found`.",
                    TripNotFoundError("20261127_15:05_ijpp_0"),
                ),
                MOTIS_UNAVAILABLE_RESPONSE,
            ),
        }
    }
)
class TripsViewSet(RetrieveMixin[str, Trip]):
    """One ride of a vehicle with all its stops."""

    async def perform_retrieve(self, context: Context, pk: str) -> Trip:  # noqa: ARG002 - the mixin's signature
        try:
            trip = trip_from(await get_motis().trip_details(pk), pk)
        except MotisNotFoundError:
            trip = None
        if trip is None:
            raise TripNotFoundError(pk)
        known_operators.remember([trip.operator])
        return trip
