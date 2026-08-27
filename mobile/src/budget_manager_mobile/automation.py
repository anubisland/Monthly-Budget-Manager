"""Routes for the two automation features: rules and recurring items.

Kept apart from ``api`` because they are one subject with its own invariants —
ids that must never be reused, and a template that must be offered exactly once
per month — while ``api`` is about the request boundary in general.

Both engines live in ``monthly_budget.core`` and were present but unreachable:
nothing in the app called ``apply_auto_category`` or
``apply_recurring_for_month``. These handlers are the wiring.
"""

from __future__ import annotations

from typing import Dict

import decode
import recurring
import validate
from errors import ApiError
from errors import row as _row

from monthly_budget.core import RecurringTransaction, TransactionRule

# ── auto-category rules ──────────────────────────────────────────────────────

def add_rule(app, d: Dict) -> None:
    """A rule maps a piece of text in a name to a category."""
    pattern = validate.text(d.get("pattern"), limit=60)
    category = validate.text(d.get("category"), limit=40)
    if pattern is None:
        raise ApiError("a rule needs something to match on")
    if category is None:
        raise ApiError("a rule needs a category")
    if any(r.pattern.lower() == pattern.lower() for r in app.data.rules):
        raise ApiError("a rule for that text already exists")

    app.data.rules.append(TransactionRule(
        pattern=pattern, category=category, id=_next_id(app.data.rules),
    ))


def delete_rule(app, d: Dict) -> None:
    app.data.rules.pop(_row(d, app.data.rules))


# ── recurring templates ──────────────────────────────────────────────────────

def add_recurring(app, d: Dict) -> None:
    description = validate.text(d.get("description"))
    category = validate.text(d.get("category"), limit=40)
    amount = validate.amount(d.get("amount"))
    frequency = d.get("frequency")
    day = d.get("day")

    if description is None:
        raise ApiError("a recurring item needs a name")
    if category is None:
        raise ApiError("a recurring item needs a category")
    if amount is None:
        raise ApiError("amount must be a positive number")
    if frequency not in decode.FREQUENCIES:
        raise ApiError("unsupported frequency")
    if isinstance(day, bool) or not isinstance(day, int) or not 0 <= day <= 31:
        raise ApiError("day must be between 0 and 31")

    app.data.recurring.append(RecurringTransaction(
        category=category, description=description, amount=amount,
        frequency=frequency, day=day,
        # Starting from the month on screen, so adding a template while looking
        # at a past month does not silently backfill every month since.
        start_date=app.data.current,
        id=_next_id(app.data.recurring, app.data.settled),
    ))


def delete_recurring(app, d: Dict) -> None:
    """Remove a template. Expenses it already produced stay: they were real
    spending in months that are now closed, and removing them would rewrite
    history the user has already reconciled."""
    app.data.recurring.pop(_row(d, app.data.recurring))


def apply_recurring(app, d: Dict) -> None:
    """Accept one template for the month on screen, once."""
    template = _template_for(app, d)
    for expense in recurring.expenses_for(template, app.data.current):
        app.data.month.add_expense(
            expense.name, expense.amount, expense.category, expense.date,
        )
    app.data.mark_settled(app.data.current, template.id)


def skip_recurring(app, d: Dict) -> None:
    """Decline one template for this month only. It returns next month."""
    app.data.mark_settled(app.data.current, _template_for(app, d).id)


def _template_for(app, d: Dict):
    """The pending template named by the request.

    Resolved against *pending* rather than the whole list, so a template that
    has already been accepted this month cannot be accepted again — which is
    the guard that stops the rent doubling.
    """
    identifier = d.get("id")
    pending = recurring.pending(
        app.data.recurring, app.data.current, app.data.settled_in(app.data.current),
    )
    for template in pending:
        if template.id == identifier:
            return template
    raise ApiError("no such pending item", 404)


def _next_id(records, settled: Dict[str, list] = None) -> int:
    """An id no record has used and no month has settled.

    max(existing) + 1 is not enough: deleting the only template drops the list
    to empty, so the next one gets id 1 again — and inherits every month in
    which the deleted template was accepted or skipped, appearing already
    handled in all of them. The settled record is therefore part of the
    high-water mark, not just the live list.
    """
    used = [r.id for r in records]
    for ids in (settled or {}).values():
        used.extend(ids)
    return max(used, default=0) + 1
