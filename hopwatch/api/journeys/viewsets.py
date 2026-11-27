"""Journey planning (`/journeys`), planned by MOTIS."""

import re

from datetime import datetime, UTC
from typing import Annotated, Self

from fastapi import APIRouter, Query
from fastapi_viewsets.endpoint_docs import endpoint_docs
from fastapi_viewsets.response_classes import error_entry, merge_responses
from pydantic import AwareDatetime, BaseModel, Field, model_validator

from hopwatch.api.departures.viewsets import StopNotFoundError
from hopwatch.api.journeys.mapping import Journeys, journeys_from
from hopwatch.api.operators.mapping import known_operators
from hopwatch.motis import (
    attribution_section,
    DATA_ATTRIBUTION,
    get_motis,
    MAP_ATTRIBUTION,
    MOTIS_UNAVAILABLE_RESPONSE,
    MotisNotFoundError,
)

# MOTIS's 404 body names the place it does not know: {"error": "Could not find timetable location \"ijpp_0\""}.
_UNKNOWN_LOCATION = re.compile(r'location \\?"([^"\\]+)\\?"')


class JourneysQuery(BaseModel):
    from_stop_id: str | None = Field(
        None, min_length=1, description="Id of the stop to start at; or give `from_lat` and `from_lon` instead."
    )
    from_lat: float | None = Field(None, ge=-90, le=90, description="Latitude of the position to start at (WGS 84).")
    from_lon: float | None = Field(None, ge=-180, le=180, description="Longitude of the position to start at (WGS 84).")
    to_stop_id: str = Field(min_length=1, description="Id of the destination stop.")
    time: AwareDatetime | None = Field(
        None,
        description=(
            "ISO 8601 time with an offset (`2026-11-27T16:00:00+01:00`): the earliest departure, or the latest "
            "arrival when `arrive_by` is true. Now when omitted."
        ),
    )
    arrive_by: bool = Field(False, description="Whether `time` is the latest arrival instead of the departure.")
    page_cursor: str | None = Field(
        None,
        description=(
            "`earlier_cursor` or `later_cursor` of an earlier answer to the same query: the page before or after it."
        ),
    )

    @model_validator(mode="after")
    def one_start(self) -> Self:
        position = (self.from_lat, self.from_lon)
        if self.from_stop_id is None and None in position:
            raise ValueError("give from_stop_id, or from_lat and from_lon")
        if self.from_stop_id is not None and position != (None, None):
            raise ValueError("give either from_stop_id or from_lat and from_lon, not both")
        return self

    @property
    def from_place(self) -> str:
        """The start as MOTIS takes it: a stop id or `lat,lon`."""
        return self.from_stop_id or f"{self.from_lat},{self.from_lon}"


def unknown_stop(query: JourneysQuery, motis_answer: str) -> str:
    """The stop id MOTIS's 404 answer names, else the destination."""
    match = _UNKNOWN_LOCATION.search(motis_answer)
    return match.group(1) if match else query.to_stop_id


@endpoint_docs(
    {
        "plan": {
            "summary": "Journeys between two places",
            "description": (
                "Itineraries from a stop or a position to a stop, departing at or after `time` (arriving at or "
                "before it with `arrive_by`), with real-time delays where the operator publishes them. A page holds "
                "a few itineraries; `earlier_cursor` and `later_cursor` load the neighbouring pages. Walking-only "
                f"connections are not listed. Public: no login needed.\n\n"
                f"{attribution_section(DATA_ATTRIBUTION, MAP_ATTRIBUTION)}"
            ),
            "response_description": "A page of itineraries in order of departure.",
            "responses": merge_responses(
                error_entry(
                    404,
                    "The start or destination stop id is unknown: `hopwatch.stop_not_found`.",
                    StopNotFoundError("ijpp_0"),
                ),
                MOTIS_UNAVAILABLE_RESPONSE,
            ),
        }
    }
)
class JourneysViewSet:
    """Journey planning between stops, with transfers and walks."""

    __router = APIRouter()

    @__router.get("")
    async def plan(self, query: Annotated[JourneysQuery, Query()]) -> Journeys:
        try:
            answer = await get_motis().plan(
                query.from_place,
                query.to_stop_id,
                at=query.time or datetime.now(UTC),
                arrive_by=query.arrive_by,
                page_cursor=query.page_cursor,
            )
        except MotisNotFoundError as error:
            raise StopNotFoundError(unknown_stop(query, str(error))) from None
        journeys = journeys_from(answer)
        known_operators.remember(leg.operator for itinerary in journeys.itineraries for leg in itinerary.legs)
        return journeys
