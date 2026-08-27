"""The shared vocabulary for refusing a request.

Its own module so both ``api`` and ``automation`` can raise the same type
without importing each other. ``row`` lives here too: its only purpose is to
raise :class:`ApiError`, so separating them would put a function in one place
and the only reason it exists in another.
"""

from __future__ import annotations

from typing import Dict

import validate


class ApiError(Exception):
    """A request we will not carry out, with the status to answer."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def row(d: Dict, rows) -> int:
    """A row index that is really inside ``rows``.

    ``validate.index`` refuses negatives instead of letting Python wrap them:
    ``pop(-1)`` would delete the last row for a request naming row -1.
    """
    index = validate.index(d.get("index"), len(rows))
    if index is None:
        raise ApiError("no such row", 404)
    return index
