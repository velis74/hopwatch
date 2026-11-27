"""Stop search (`/stops`) and nearby stops (`/stops/nearby`), read from MOTIS."""

import math

from typing import Any

from fastapi_viewsets.context import Context
from fastapi_viewsets.decorators import ViewSetRouter
from fastapi_viewsets.endpoint_docs import endpoint_docs
from fastapi_viewsets.list_query import ListQuery
from fastapi_viewsets.mixins import ListMixin
from pydantic import BaseModel, Field

from hopwatch.api.stops.matching import matches_word_prefixes
from hopwatch.motis import get_motis, JsonObject, MOTIS_UNAVAILABLE_RESPONSE

EARTH_RADIUS_M = 6_371_000
METRES_PER_DEGREE_LAT = 111_320
NEARBY_LIMIT = 10
SEARCH_LIMIT = 20
# Candidates asked from MOTIS's fuzzy search before the word-prefix match narrows them to SEARCH_LIMIT.
SEARCH_CANDIDATES = 100


class Stop(BaseModel):
    """A public transport stop."""

    id: str = Field(description="Stop id, prefixed with its dataset (`ijpp_1122804`).")
    name: str = Field(description="Name of the stop as the timetable publishes it.")
    lat: float = Field(description="Latitude (WGS 84).")
    lon: float = Field(description="Longitude (WGS 84).")


class NearbyStop(Stop):
    """A stop near the requested position."""

    distance_m: int = Field(description="Distance from the requested position in metres.")


class NearbyStopsFilter(BaseModel):
    lat: float = Field(ge=-90, le=90, description="Latitude of the position (WGS 84).")
    lon: float = Field(ge=-180, le=180, description="Longitude of the position (WGS 84).")
    radius_m: int = Field(1000, ge=1, le=5000, description="Search radius in metres.")


class StopSearchFilter(BaseModel):
    q: str = Field(
        min_length=2,
        description=(
            "Search text. Every word of it must be the start of a word of the stop's name, ignoring case and "
            "accents (`lj zel` finds `Ljubljana Železna`)."
        ),
    )


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres (haversine)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lon2 - lon1)
    h = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def bounding_box(lat: float, lon: float, radius_m: float) -> tuple[float, float, float, float]:
    """`(lat_min, lon_min, lat_max, lon_max)` of a box that contains the circle of `radius_m` around the position."""
    d_lat = radius_m / METRES_PER_DEGREE_LAT
    d_lon = radius_m / (METRES_PER_DEGREE_LAT * max(math.cos(math.radians(lat)), 0.01))
    return max(lat - d_lat, -90.0), max(lon - d_lon, -180.0), min(lat + d_lat, 90.0), min(lon + d_lon, 180.0)


def nearby_stops(places: list[JsonObject], lat: float, lon: float, radius_m: int) -> list[NearbyStop]:
    """MOTIS map stops within `radius_m` of the position, nearest first, at most `NEARBY_LIMIT`."""
    stops: dict[str, NearbyStop] = {}
    for place in places:
        stop_id = place.get("stopId")
        if not stop_id or stop_id in stops:
            continue
        distance = distance_m(lat, lon, place["lat"], place["lon"])
        if distance <= radius_m:
            stops[stop_id] = NearbyStop(
                id=stop_id, name=place["name"], lat=place["lat"], lon=place["lon"], distance_m=round(distance)
            )
    return sorted(stops.values(), key=lambda stop: stop.distance_m)[:NEARBY_LIMIT]


def matching_stops(matches: list[JsonObject], query: str) -> list[Stop]:
    """MOTIS geocode matches whose name matches `query` word by word, in MOTIS's order, each stop once."""
    stops: dict[str, Stop] = {}
    for match in matches:
        stop_id = match.get("id")
        if match.get("type") != "STOP" or not stop_id or stop_id in stops:
            continue
        if matches_word_prefixes(match["name"], query):
            stops[stop_id] = Stop(id=stop_id, name=match["name"], lat=match["lat"], lon=match["lon"])
    return list(stops.values())[:SEARCH_LIMIT]


@endpoint_docs(
    {
        "list_items": {
            "summary": "Stops near a position",
            "description": f"Stops within `radius_m` of the position, nearest first, at most {NEARBY_LIMIT}.",
            "response_description": "The stops, nearest first.",
            "parameters": {"sort": "Ordering; nearest first when omitted."},
            "responses": MOTIS_UNAVAILABLE_RESPONSE,
        }
    }
)
class NearbyStopsViewSet(ListMixin[NearbyStop, NearbyStopsFilter]):
    """Stops near a position."""

    async def get_list(self, context: Context, query: ListQuery) -> Any:
        fltr: NearbyStopsFilter = query.fltr
        places = await get_motis().stops_in_box(*bounding_box(fltr.lat, fltr.lon, fltr.radius_m))
        records = nearby_stops(places, fltr.lat, fltr.lon, fltr.radius_m)
        records = await self.apply_sort(context, query, records)
        return await self.apply_pagination(context, query, records)


@endpoint_docs(
    {
        "list_items": {
            "summary": "Search stops by name",
            "description": (
                f"Stops whose name matches `q`, best match first, at most {SEARCH_LIMIT}. Used to choose a stop or "
                "a destination."
            ),
            "response_description": "The matching stops, best match first.",
            "parameters": {"sort": "Ordering; best match first when omitted."},
            "responses": MOTIS_UNAVAILABLE_RESPONSE,
        }
    }
)
class StopsViewSet(ListMixin[Stop, StopSearchFilter]):
    """Public transport stops: search by name and stops near a position. Read from the timetable (MOTIS)."""

    __router = ViewSetRouter()
    __router.sub_viewset("nearby", NearbyStopsViewSet)

    async def get_list(self, context: Context, query: ListQuery) -> Any:
        fltr: StopSearchFilter = query.fltr
        matches = await get_motis().geocode_stops(fltr.q, SEARCH_CANDIDATES)
        records = matching_stops(matches, fltr.q)
        records = await self.apply_sort(context, query, records)
        return await self.apply_pagination(context, query, records)
