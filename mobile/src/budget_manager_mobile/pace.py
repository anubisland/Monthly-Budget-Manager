"""Is this month's spending on track, and where will it land?

Turns the app from a record of what happened into something that can say
"slow down" while there is still time to act.

Two constraints are built in rather than left to the caller, because getting
either wrong produces a confident and wrong number:

* A forecast only means anything for the month in progress. A past month is
  finished; projecting it is not a prediction, it is arithmetic pretending.
* Extrapolating from a few days divides by a tiny fraction. On day 1, spending
  100 projects to 3,100 — true to the formula and useless to read. Below
  :data:`MIN_DAYS` there is no forecast at all.
"""

from __future__ import annotations

import calendar
from datetime import date
from typing import Dict, List, Optional

#: Days that must have elapsed before a projection is offered. Four days of a
#: 30-day month is 13% of it — still noisy, but the shape of a month's spending
#: is visible, and waiting longer wastes the part of the month you can still
#: change.
MIN_DAYS = 4

#: How far over the elapsed share of the budget counts as "ahead of pace",
#: once the month is nearly over and the rate is trustworthy.
AHEAD_MARGIN = 0.10

#: Extra tolerance at the start of the month, tapering to nothing at the end.
#: A linear projection assumes even spending, and real spending is not even —
#: rent lands on the 1st. On day 4, a third of the budget against a tenth of
#: the month projects to more than twice the budget, which is arithmetically
#: correct and tells the user nothing they can act on. Confidence in the rate
#: grows as the month passes, so the deviation required to warn shrinks with
#: it.
EARLY_TOLERANCE = 0.25


def days_in(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def elapsed(year: int, month: int, today: date) -> float:
    """The fraction of the month that has passed, in (0, 1].

    A month entirely in the past is 1.0 — it is wholly elapsed — and a month in
    the future is 0.0. Only the current month gives a partial value.
    """
    total = days_in(year, month)
    if (year, month) < (today.year, today.month):
        return 1.0
    if (year, month) > (today.year, today.month):
        return 0.0
    return min(today.day, total) / total


def forecast(spent: float, year: int, month: int, today: date) -> Optional[float]:
    """Where this month lands at the current rate, or None when it cannot say.

    None has three distinct causes, and the caller should show nothing in all
    of them rather than inventing a number:

    * the month is not the one in progress;
    * too little of it has elapsed to extrapolate from;
    * nothing has been spent yet.
    """
    if (year, month) != (today.year, today.month):
        return None
    if today.day < MIN_DAYS:
        return None
    share = elapsed(year, month, today)
    if share <= 0 or spent <= 0:
        return None
    return round(spent / share, 2)


def status(spent: float, budget: float, year: int, month: int, today: date) -> Dict:
    """Everything the UI needs to say whether the month is on track.

    ``on_track`` is deliberately three-valued via ``state``: a month with no
    budget set has nothing to be off track against, and saying "on track"
    there would be a claim the data does not support.
    """
    share = elapsed(year, month, today)
    projected = forecast(spent, year, month, today)
    result = {
        "elapsed": round(share * 100, 1),
        "spent": round(spent, 2),
        "budget": round(budget, 2),
        "projected": projected,
        "days_left": _days_left(year, month, today),
        "state": "no_budget",
        "used": 0.0,
    }
    if budget <= 0:
        return result

    used = spent / budget
    result["used"] = round(used * 100, 1)
    result["state"] = _state(used, share)
    return result


def _state(used: float, share: float) -> str:
    """over — already past the budget; ahead — spending faster than the month
    is passing; on_track — everything else.

    There is deliberately no check that the projection exceeds the budget.
    It looks like a useful second opinion and is a tautology: projected is
    spent / share, so projected > budget is exactly used > share, which the
    comparison below already requires by a wider margin. Keeping it would
    imply a safeguard that can never change the answer.
    """
    if used >= 1.0:
        return "over"
    if used > share + margin_at(share):
        return "ahead"
    return "on_track"


def margin_at(share: float) -> float:
    """How far past the elapsed share counts as ahead, given how far in we are.

    Wide early, narrow late. Without the taper a single fixed payment on the
    1st fires the badge every month, and a badge that always fires is a badge
    nobody reads — which costs more than the warning saves.
    """
    return AHEAD_MARGIN + max(0.0, 1.0 - share) * EARLY_TOLERANCE


def _days_left(year: int, month: int, today: date) -> int:
    if (year, month) != (today.year, today.month):
        return 0
    return max(days_in(year, month) - today.day, 0)
