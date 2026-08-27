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
from typing import Dict, List, Optional

from monthly_budget.core import BudgetMonth

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

        Anything we could not use is moved aside *before* the app gets a chance
        to save over it, and a pre-migration copy is kept either way.
        """
        doc, note = store.read_doc(self._path, self.this_month())
        self.note = note

        if note in ("corrupt", "unreadable", "future-version"):
            store.quarantine(self._path)
        elif note == "migrated-v1":
            store.backup(self._path)

        self.current = doc["current"] if store.is_month_key(doc.get("current")) else self.this_month()
        if self.current > self.this_month():
            self.current = self.this_month()

        self.months = {
            key: _budget_from(raw, key) for key, raw in doc["months"].items()
        }
        self.goals = [_goal_from(raw) for raw in doc["goals"]]
        self.goals = [g for g in self.goals if g is not None]

    def save(self) -> None:
        """Write to disk. Raises OSError so the caller can tell the user."""
        store.write_doc(self._path, self.to_doc())

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

def _budget_from(raw: Dict, key: str) -> BudgetMonth:
    bm = BudgetMonth(month=key)
    try:
        bm.from_dict(raw)
    except (TypeError, ValueError, KeyError, AttributeError):
        return BudgetMonth(month=key)
    bm.month = key
    return bm


def _goal_from(raw: Dict) -> Optional[Goal]:
    name = validate.text(raw.get("name"))
    target = validate.amount(raw.get("target"))
    if name is None or target is None:
        return None
    return Goal(
        name=name,
        target=target,
        current=validate.amount(raw.get("current"), allow_zero=True) or 0.0,
        icon=raw.get("icon") if isinstance(raw.get("icon"), str) else "🎯",
        target_month=raw.get("target_month") if isinstance(raw.get("target_month"), str) else "",
    )


def _is_blank(bm: BudgetMonth) -> bool:
    """A month with nothing in it is not worth storing or navigating to."""
    return not bm.incomes and not bm.expenses and not getattr(bm, "total_budget", 0)
