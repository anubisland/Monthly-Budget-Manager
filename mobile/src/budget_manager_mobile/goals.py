"""How a goal relates to the budget.

Previously it did not: a goal was created with ``current: 0`` and nothing in
the app could ever change it, so every progress bar was permanently empty.

The rule here is that **funding a goal is spending money**. A deposit is a real
expense in the month it was made, under :data:`SAVINGS_CATEGORY`, named after
the goal. Progress is then *derived* by summing those expenses rather than
stored alongside them, which buys three things:

* deleting the deposit reduces the goal, with no reconciliation step;
* progress accumulates across months for free, so an unfinished goal carries
  over instead of restarting;
* there is one source of truth, so the two can never disagree.
"""

from __future__ import annotations

from typing import Dict

SAVINGS_CATEGORY = "Savings"


def deposit_name(goal_name: str) -> str:
    """The expense name a deposit is filed under.

    Matching is by (category, name), so this is the join key between a goal and
    its money. Renaming a goal therefore orphans its deposits — the caller is
    expected to move them, and :func:`rename` does.
    """
    return goal_name.strip()


def is_deposit(expense: object, goal_name: str) -> bool:
    return (
        getattr(expense, "category", None) == SAVINGS_CATEGORY
        and getattr(expense, "name", "") == deposit_name(goal_name)
    )


def deposits(goal_name: str, months: Dict[str, object]) -> float:
    """Everything ever put into this goal, across every month."""
    total = 0.0
    for budget in months.values():
        for expense in getattr(budget, "expenses", ()):
            if is_deposit(expense, goal_name):
                total += float(getattr(expense, "amount", 0.0) or 0.0)
    return round(total, 2)


def funded(goal, months: Dict[str, object]) -> float:
    """Total progress: the stored baseline plus every derived deposit.

    The baseline exists only to honour a pre-upgrade file that recorded a
    non-zero ``current``. Nothing in the app writes to it any more.
    """
    return round(float(goal.current or 0.0) + deposits(goal.name, months), 2)


def fund(goal, budget, amount: float, date_str: str, months: Dict[str, object]) -> float:
    """Put ``amount`` into ``goal``, as an expense in ``budget``.

    Returns the amount actually taken. Deposits are capped at what the goal
    still needs, so a goal cannot be overfunded by a fat-fingered entry — the
    money stays in the month rather than disappearing into a finished goal.

    Raises ValueError on a non-positive amount; there is no sensible reading of
    depositing zero, and a negative one is a withdrawal we do not offer.
    """
    amount = float(amount)
    if not amount > 0:
        raise ValueError("a deposit must be positive")

    # The cap has to consider every month: progress accumulates, so a goal
    # already 80% funded from earlier months has only 20% of room left.
    already = funded(goal, months)
    room = round(float(goal.target) - already, 2) if goal.target > 0 else amount
    taken = round(min(amount, room), 2) if room > 0 else 0.0
    if taken <= 0:
        return 0.0

    budget.add_expense(deposit_name(goal.name), taken, SAVINGS_CATEGORY, date_str)
    return taken


def status(goal, months: Dict[str, object], current_month: str) -> Dict:
    """Everything the UI needs to draw one goal, computed in one place."""
    total = funded(goal, months)
    target = float(goal.target or 0.0)
    this_month = deposits(goal.name, {current_month: months[current_month]}) \
        if current_month in months else 0.0
    return {
        "funded": total,
        "remaining": round(max(target - total, 0.0), 2),
        "pct": round(min(total / target, 1.0) * 100, 1) if target > 0 else 0.0,
        "done": total >= target > 0,
        "this_month": this_month,
        "carried_over": _started_before(goal.name, months, current_month) and not total >= target > 0,
    }


def _started_before(goal_name: str, months: Dict[str, object], current_month: str) -> bool:
    """True when this goal was already being funded in an earlier month.

    That is what makes it a *carried-over* goal rather than a new one, and it
    is why the badge can be trusted: it reflects real deposit history, not a
    flag someone forgot to clear.
    """
    return any(
        key < current_month and deposits(goal_name, {key: budget}) > 0
        for key, budget in months.items()
    )
