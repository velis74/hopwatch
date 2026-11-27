"""Transport operators (`/operators`)."""

from typing import Any

from fastapi_viewsets.collation import get_collation
from fastapi_viewsets.context import Context
from fastapi_viewsets.endpoint_docs import endpoint_docs
from fastapi_viewsets.list_query import ListQuery
from fastapi_viewsets.mixins import ListMixin

from hopwatch.api.operators.mapping import known_operators, Operator
from hopwatch.motis import DATA_ATTRIBUTION


@endpoint_docs(
    {
        "list_items": {
            "summary": "Transport operators",
            "description": (
                "The operators of the timetable: the companies that run its trips. Departures and journey legs "
                "name their operator by the same `id`, so a client can mark operators as favourites. Public: no "
                f"login needed.\n\n{DATA_ATTRIBUTION}"
            ),
            "response_description": "The operators, by name.",
            "parameters": {"sort": "Ordering; by name when omitted."},
        }
    }
)
class OperatorsViewSet(ListMixin[Operator]):
    """Transport operators of the timetable."""

    default_sort = "name:asc"
    collation = get_collation()

    async def get_list(self, context: Context, query: ListQuery) -> Any:
        records = await self.apply_sort(context, query, await known_operators.all())
        return await self.apply_pagination(context, query, records)
