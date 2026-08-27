"""Offering a month's recurring items exactly once.

``monthly_budget.core.apply_recurring_for_month`` is a pure function: it
returns the expenses a set of templates generates for a month, every time it is
called, with no memory. Calling it whenever a month is opened would double the
rent on the second open and triple it on the third.

So the caller owns the guard, and this module is it. The unit tracked is the
**template in a month**, not the individual expense, because a weekly template
produces four expenses in one month and they stand or fall together.

Skipping is recorded the same way as accepting. A template the user declined
this month must stop asking *this* month, and must ask again next month — which
falls out of the record being per-month rather than a flag on the template.
"""

from __future__ import annotations

from typing import List

import store

from monthly_budget.core import RecurringTransaction, apply_recurring_for_month


def pending(templates: List[RecurringTransaction], month: str,
            settled: List[int]) -> List[RecurringTransaction]:
    """Templates that fire in ``month`` and have not been accepted or skipped.

    ``settled`` holds the template ids already actioned for this month, so the
    same list serves both outcomes.
    """
    done = set(settled or ())
    return [t for t in templates if t.id not in done and fires_in(t, month)]


def fires_in(template: RecurringTransaction, month: str) -> bool:
    """Whether ``template`` produces anything at all in ``month``.

    Asked of the engine rather than reimplemented here: frequency rules are
    fiddly (a monthly template on the 31st, a weekday template, quarters) and
    two implementations would drift.
    """
    if not template.active:
        return False
    try:
        year, month_number = store.parse_month_key(month)
    except ValueError:
        return False
    return bool(apply_recurring_for_month([template], year, month_number))


def expenses_for(template: RecurringTransaction, month: str) -> List:
    """Every expense ``template`` generates in ``month``."""
    year, month_number = store.parse_month_key(month)
    return apply_recurring_for_month([template], year, month_number)


def next_id(templates: List[RecurringTransaction]) -> int:
    """A fresh id. Ids are the join key to the settled record, so they must
    never be reused — a recycled id would make a new template look already
    handled in every month the old one was settled in."""
    return max((t.id for t in templates), default=0) + 1
