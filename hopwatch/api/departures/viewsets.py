"""Departures from stops (`/departures`), read from MOTIS."""

from typing import Annotated, Any

from fastapi_viewsets.context import Context
from fastapi_viewsets.endpoint_docs import endpoint_docs
from fastapi_viewsets.exceptions import DfViewSetError
from fastapi_viewsets.list_query import ListQuery
from fastapi_viewsets.mixins import ListMixin
from fastapi_viewsets.response_classes import error_entry, merge_responses
from pydantic import BaseModel, Field

from hopwatch.api.departures.mapping import Departure, departures_from_stops, UnknownStopError
from hopwatch.api.operators.mapping import known_operators
from hopwatch.motis import attribution_section, DATA_ATTRIBUTION, ERROR_NAMESPACE, get_motis, MOTIS_UNAVAILABLE_RESPONSE


class StopNotFoundError(DfViewSetError):
    """The timetable has no stop with this id."""

    def __init__(self, stop_id: str):
        super().__init__(404, f"Stop {stop_id} not found", f"{ERROR_NAMESPACE}.stop_not_found", {"stop_id": stop_id})


MAX_STOPS = 10


class DeparturesFilter(BaseModel):
    stop_id: list[Annotated[str, Field(min_length=1)]] = Field(
        min_length=1,
        max_length=MAX_STOPS,
        description=(
            "Ids of the stops, as `/stops` and `/stops/nearby` return them; repeat the key for each stop "
            f"(`?stop_id=a&stop_id=b`), 1 to {MAX_STOPS} stops."
        ),
    )
    destination: str | None = Field(
        None,
        description=(
            "Only departures that call at a matching stop later on, not only at the terminus. Every word of it must "
            "be the start of a word of the stop's name, ignoring case and accents."
        ),
    )
    window_minutes: int = Field(60, ge=1, le=240, description="How far ahead to list departures, in minutes.")


@endpoint_docs(
    {
        "list_items": {
            "summary": "Departures from stops",
            "description": (
                "Departures from the stops within `window_minutes` from now, merged in order of the expected "
                "departure (the scheduled one where there is no real-time data). Each departure names the stop it "
                "leaves from. Cancelled departures are left out. Public: no login needed.\n\n"
                f"{attribution_section(DATA_ATTRIBUTION)}"
            ),
            "response_description": "The departures, in order of departure.",
            "parameters": {"sort": "Ordering; by departure time when omitted."},
            "responses": merge_responses(
                error_entry(
                    404,
                    "A stop id is unknown (the first one in `detail_params.stop_id`): `hopwatch.stop_not_found`.",
                    StopNotFoundError("ijpp_0"),
                ),
                MOTIS_UNAVAILABLE_RESPONSE,
            ),
        }
    }
)
class DeparturesViewSet(ListMixin[Departure, DeparturesFilter]):
    """Departures from stops with real-time delays where the operator publishes them."""

    async def get_list(self, context: Context, query: ListQuery) -> Any:
        fltr: DeparturesFilter = query.fltr
        try:
            records = await departures_from_stops(
                get_motis(), fltr.stop_id, destination=fltr.destination, window_minutes=fltr.window_minutes
            )
        except UnknownStopError as error:
            raise StopNotFoundError(error.stop_id) from None
        known_operators.remember(record.operator for record in records)
        records = await self.apply_sort(context, query, records)
        return await self.apply_pagination(context, query, records)
