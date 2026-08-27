"""Every month's budget, the goals, and their persistence.

Split out of ``app.py`` so the data model can be tested without a running
Toga app or HTTP server. ``app.py`` keeps the transport; this keeps the state.

The month being *viewed* is ``current``; ``months`` holds one budget per month
and never loses one when you navigate away from it, which is the whole point.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from monthly_budget.core import BudgetMonth, Expense, Income

import store
import validate


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


class BudgetData:
    """The app's data, keyed by month, with load/save that cannot lose it."""

    def __init__(self, path: Path, today: Optional[date] = None) -> None:
        self._path = Path(path)
        self._today = today or date.today()
        self.current: str = store.month_key(self._today.year, self._today.month)
        self.months: Dict[str, BudgetMonth] = {}
        self.goals: List[Goal] = []
        #: Something the user should be told about the last load, or None.
        self.note: Optional[str] = None
        #: How many rows the last load had to discard.
        self.dropped: int = 0
        #: False when the last read failed at the I/O level; save() then refuses.
        self.readable: bool = True

    # ── the month in view ────────────────────────────────────────────────────

    @property
    def month(self) -> BudgetMonth:
        """The budget for ``current``, created on first touch.

        ``app.py`` exposes this as ``self.bm``, so every existing call site
        writes into the month on screen without knowing months exist.
        """
        if self.current not in self.months:
            self.months[self.current] = BudgetMonth(month=self.current)
        return self.months[self.current]

    def this_month(self) -> str:
        """Today's month — the one the app opens on."""
        return store.month_key(self._today.year, self._today.month)

    def known_months(self) -> List[str]:
        """Months that hold data, oldest first. Chronological because of the key."""
        return sorted(k for k, v in self.months.items() if not _is_blank(v))

    def can_go_back(self) -> bool:
        """False only when there is no earlier month to show."""
        return bool([k for k in self.known_months() if k < self.current])

    def can_go_forward(self) -> bool:
        """A budget for a month that has not happened yet is meaningless."""
        return self.current < self.this_month()

    def go_to(self, key: str) -> bool:
        """Move the view. Refuses the future and anything malformed."""
        if not store.is_month_key(key) or key > self.this_month():
            return False
        self.current = str(key)
        return True

    def previous(self) -> str:
        return store.shift_month(self.current, -1)

    # ── persistence ──────────────────────────────────────────────────────────

    def load(self) -> None:
        """Read from disk, migrating and preserving as needed.

        Three outcomes have to stay distinct, because conflating them is how
        data gets destroyed:

        * the *content* was unusable — move it aside before we can write over it;
        * the content was fine but *reading* failed — leave the file completely
          alone, and refuse to save this session, because the bytes are almost
          certainly still good;
        * the content was usable but something inside it was dropped — keep a
          copy, since the next save writes the reduced version.
        """
        doc, note = store.read_doc(self._path, self.this_month())

        self.current = doc["current"] if store.is_month_key(doc.get("current")) else self.this_month()
        if self.current > self.this_month():
            self.current = self.this_month()

        dropped = doc.get("dropped", 0)
        self.months = {}
        for key, raw in doc["months"].items():
            budget, lost = _budget_from(raw, key)
            dropped += lost
            self.months[key] = budget

        self.goals = []
        for raw in doc["goals"]:
            goal = _goal_from(raw)
            if goal is None:
                dropped += 1
            else:
                self.goals.append(goal)

        # An I/O failure says nothing about the file's contents, so touching it
        # would turn a transient error into permanent loss.
        self.readable = note != "unreadable"
        if note in ("corrupt", "future-version"):
            store.quarantine(self._path)
        elif note == "migrated-v1" or dropped:
            store.backup(self._path)

        self.dropped = dropped
        self.note = note or ("partial" if dropped else None)

    def save(self) -> None:
        """Write to disk. Raises OSError so the caller can tell the user.

        Refuses outright when the last read failed at the I/O level: the file
        on disk is probably intact and this process holds nothing that should
        replace it.
        """
        if not self.readable:
            raise OSError("the data file could not be read; refusing to overwrite it")
        store.write_doc(self._path, self.to_doc())
        # The conditions these describe are resolved once a good file is on
        # disk. Leaving them set would keep a stale warning on screen all
        # session, which teaches the user to dismiss the next real one.
        if self.note in ("migrated-v1", "partial"):
            self.note = None
            self.dropped = 0

    def to_doc(self) -> Dict:
        return {
            "version": store.SCHEMA_VERSION,
            "current": self.current,
            "months": {k: v.to_dict() for k, v in self.months.items() if not _is_blank(v)},
            "goals": [asdict(g) for g in self.goals],
        }

    def reset(self) -> None:
        """Clear everything. The UI confirms before calling this."""
        self.months = {}
        self.goals = []
        self.current = self.this_month()


# ── building models from stored dicts ────────────────────────────────────────
# store.py guarantees the containers; these guarantee the elements. A row whose
# amount is not a number is dropped rather than summed as zero, because a rent
# that silently becomes 0.00 is worse than a rent that is visibly missing.

def _budget_from(raw: Dict, key: str) -> Tuple[BudgetMonth, int]:
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


def _goal_from(raw: Dict) -> Optional[Goal]:
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


def _is_blank(bm: BudgetMonth) -> bool:
    """A month with nothing in it is not worth storing or navigating to."""
    return not bm.incomes and not bm.expenses and not getattr(bm, "total_budget", 0)
