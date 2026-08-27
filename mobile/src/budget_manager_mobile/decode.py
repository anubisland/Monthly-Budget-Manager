"""Turning stored dictionaries into trusted models.

Split from ``budget_data`` because it is a different job: that module owns the
app's data and its lifecycle, this one owns the boundary between a file we did
not write and objects the rest of the code may rely on.

The rule throughout is that a damaged *element* is dropped and counted, never a
whole container. An earlier version caught anything ``BudgetMonth.from_dict``
raised and returned an empty month, so one row with a missing amount erased
every other row in that month — and, because nothing recorded it, the next save
deleted the month from the file.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import store
import validate

from monthly_budget.core import (
    BudgetMonth,
    Expense,
    Income,
)


@dataclass
class Goal:
    """A savings target that persists across months.

    ``current`` accumulates deposits from every month until ``target`` is met,
    so an unfinished goal carries over rather than restarting.
    """

    name: str
    target: float
    current: float = 0.0
    icon: str = "🎯"
    target_month: str = ""

    def progress(self) -> float:
        """Fraction complete, clamped to 1.0. Zero target reads as complete."""
        if self.target <= 0:
            return 1.0
        return min(self.current / self.target, 1.0)

    def done(self) -> bool:
        return self.current >= self.target > 0

    def remaining(self) -> float:
        return max(self.target - self.current, 0.0)


# ── building models from stored dicts ────────────────────────────────────────
# store.py guarantees the containers; these guarantee the elements. A row whose
# amount is not a number is dropped rather than summed as zero, because a rent
# that silently becomes 0.00 is worse than a rent that is visibly missing.

def budget_from(raw: Dict, key: str) -> Tuple[BudgetMonth, int]:
    """Build one month from stored data, dropping only the rows that are bad.

    Returns the budget and how many rows were discarded.

    This used to catch anything ``bm.from_dict`` raised and return an *empty*
    month. ``from_dict`` builds every row in one comprehension, so a single
    malformed row — one missing amount, one unexpected key — emptied the whole
    month. Nothing recorded it, and the next save dropped the now-blank month
    from the document entirely: the user's July disappeared for good because
    one of its rows had a typo in it.
    """
    bm = BudgetMonth(month=key)
    dropped = 0

    # Defaulting to [] here rather than inside _rows is what separates "this
    # month simply has no incomes" from "the incomes key holds something that
    # is not a list" — the first is normal, the second is damage worth
    # reporting, and .get() alone cannot tell them apart.
    incomes, n = _rows(raw.get("incomes", []), Income, ("name", "amount", "date"))
    dropped += n
    expenses, n = _rows(raw.get("expenses", []), Expense, ("name", "amount", "category", "date"))
    dropped += n

    bm.incomes = incomes
    bm.expenses = expenses
    bm.total_budget = validate.amount(raw.get("total_budget"), allow_zero=True) or 0.0
    return bm, dropped


def _rows(raw: object, factory, fields) -> Tuple[List, int]:
    """Validate a list of stored rows one at a time. Returns (rows, dropped)."""
    if not isinstance(raw, list):
        return [], 1

    rows, dropped = [], 0
    for item in raw:
        row = _row(item, factory, fields)
        if row is None:
            dropped += 1
        else:
            rows.append(row)
    return rows, dropped


def _row(item: object, factory, fields):
    """One income or expense, or None if it cannot be trusted."""
    if not isinstance(item, dict):
        return None
    name = validate.text(item.get("name"))
    amount = validate.amount(item.get("amount"), allow_zero=True)
    if name is None or amount is None:
        return None

    built = {"name": name, "amount": amount}
    if "category" in fields:
        built["category"] = validate.text(item.get("category"), limit=40) or "Uncategorized"
    if "date" in fields:
        built["date"] = validate.date_text(item.get("date"))
    return factory(**built)


def goal_from(raw: Dict) -> Optional[Goal]:
    """One goal, or None if it cannot be trusted."""
    if not isinstance(raw, dict):
        return None
    name = validate.text(raw.get("name"))
    target = validate.amount(raw.get("target"))
    if name is None or target is None:
        return None
    # A baseline we cannot parse becomes zero, which reads as *less* progress
    # than the user had. It is counted as a drop by the caller so the file is
    # backed up before that reduced value is written over the original.
    baseline = validate.amount(raw.get("current"), allow_zero=True)
    return Goal(
        name=name,
        target=target,
        current=baseline if baseline is not None else 0.0,
        icon=raw.get("icon") if isinstance(raw.get("icon"), str) else "🎯",
        target_month=raw.get("target_month") if isinstance(raw.get("target_month"), str) else "",
    )


#: Field name -> how to validate it. Anything absent from a stored record falls
#: back to the dataclass default; anything present but unusable drops the whole
#: record, because a recurring template with a broken amount would otherwise
#: quietly write the wrong number into a month every single month.
RECURRING_FIELDS = {
    "category": lambda v: validate.text(v, limit=40),
    "description": lambda v: validate.text(v),
    "amount": lambda v: validate.amount(v),
    "frequency": lambda v: v if v in FREQUENCIES else None,
    "day": lambda v: _day(v),
    "start_date": lambda v: str(v) if store.is_month_key(v) else None,
}

RULE_FIELDS = {
    "pattern": lambda v: validate.text(v, limit=60),
    "category": lambda v: validate.text(v, limit=40),
}

#: The frequencies core.apply_recurring_for_month knows how to expand. A value
#: outside this set silently produces no expenses at all, so it is refused at
#: the door rather than becoming a template that never fires.
FREQUENCIES = ("weekly", "biweekly", "monthly", "quarterly", "yearly")


def _day(value: object) -> Optional[int]:
    """A day-of-month (1-31) or day-of-week (0-6); the engine reads it both
    ways depending on frequency, so the wider range is accepted here."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if 0 <= value <= 31 else None


def templates(raw: object, factory, fields) -> Tuple[List, int]:
    """Build recurring templates or rules. Returns (built, dropped)."""
    if not isinstance(raw, list):
        return [], 1 if raw is not None else 0

    built, dropped, seen_ids = [], 0, set()
    for item in raw:
        record = _template(item, factory, fields)
        # A duplicate id would make two templates share one settled record, so
        # accepting one would silently dismiss the other.
        if record is None or record.id in seen_ids:
            dropped += 1
            continue
        seen_ids.add(record.id)
        built.append(record)
    return built, dropped


def _template(item: object, factory, fields):
    if not isinstance(item, dict):
        return None
    built = {}
    for name, check in fields.items():
        if name not in item:
            continue
        value = check(item[name])
        if value is None:
            return None
        built[name] = value
    if len(built) != len(fields):
        return None

    identifier = item.get("id")
    if isinstance(identifier, bool) or not isinstance(identifier, int) or identifier < 1:
        return None
    built["id"] = identifier

    for optional, check in (("active", lambda v: v if isinstance(v, bool) else None),
                            ("enabled", lambda v: v if isinstance(v, bool) else None),
                            ("end_date", lambda v: str(v) if store.is_month_key(v) else None)):
        if optional in item and optional in factory.__dataclass_fields__:
            value = check(item[optional])
            if value is not None:
                built[optional] = value
    return factory(**built)


def settled(raw: object) -> Dict[str, List[int]]:
    """month key -> template ids already actioned there."""
    if not isinstance(raw, dict):
        return {}
    result = {}
    for key, ids in raw.items():
        if not store.is_month_key(key) or not isinstance(ids, list):
            continue
        clean = [i for i in ids if isinstance(i, int) and not isinstance(i, bool) and i > 0]
        if clean:
            result[str(key)] = sorted(set(clean))
    return result
