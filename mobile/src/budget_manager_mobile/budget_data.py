"""Every month's budget, the goals, and their persistence.

Split out of ``app.py`` so the data model can be tested without a running
Toga app or HTTP server. ``app.py`` keeps the transport; this keeps the state.

The month being *viewed* is ``current``; ``months`` holds one budget per month
and never loses one when you navigate away from it, which is the whole point.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional

import decode
import store
from decode import Goal  # re-exported: callers have always imported it from here

from monthly_budget.core import BudgetMonth, RecurringTransaction, TransactionRule


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
        #: Recurring templates, and the auto-category rules. Both are global
        #: rather than per-month: a template that only existed in one month
        #: could never recur.
        self.recurring: List[RecurringTransaction] = []
        self.rules: List[TransactionRule] = []
        #: month key -> template ids already accepted or skipped there. Both
        #: outcomes land here, so a declined template stops asking this month
        #: and asks again next month without needing a second record.
        self.settled: Dict[str, List[int]] = {}

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
            budget, lost = decode.budget_from(raw, key)
            dropped += lost
            self.months[key] = budget

        self.goals = []
        for raw in doc["goals"]:
            goal = decode.goal_from(raw)
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

        self.recurring, lost = decode.templates(
            doc.get("recurring"), RecurringTransaction, decode.RECURRING_FIELDS
        )
        dropped += lost
        self.rules, lost = decode.templates(
            doc.get("rules"), TransactionRule, decode.RULE_FIELDS
        )
        dropped += lost
        self.settled = decode.settled(doc.get("settled"))

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
            "recurring": [asdict(t) for t in self.recurring],
            "rules": [asdict(r) for r in self.rules],
            "settled": {k: sorted(v) for k, v in self.settled.items() if v},
        }

    def reset(self) -> None:
        """Clear everything. The UI confirms before calling this."""
        self.months = {}
        self.goals = []
        self.recurring = []
        self.rules = []
        self.settled = {}
        self.current = self.this_month()

    def settled_in(self, month: str) -> List[int]:
        return self.settled.get(month, [])

    def mark_settled(self, month: str, template_id: int) -> None:
        """Record that a template has been accepted or skipped for ``month``."""
        ids = self.settled.setdefault(month, [])
        if template_id not in ids:
            ids.append(template_id)


def _is_blank(bm: BudgetMonth) -> bool:
    """A month with nothing in it is not worth storing or navigating to."""
    return not bm.incomes and not bm.expenses and not getattr(bm, "total_budget", 0)
