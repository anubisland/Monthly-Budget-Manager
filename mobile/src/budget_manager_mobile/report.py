"""What goes into an exported report, as plain data.

Deliberately separate from writing the spreadsheet. The decisions worth
testing — which rows, in what order, with which totals — are here and need
nothing installed; ``xlsx.py`` turns this into a file and is thin enough to
read in one go.

That split also means the report survives a change of format. Adding CSV or
PDF later is a new writer over the same tables, not a second copy of the
logic with its own drift.
"""

from __future__ import annotations

from typing import Dict, List

import goals as goals_module
import store
import trend


def build(data, month: str, currency: str = "") -> Dict:
    """Every table in the report for ``month``.

    Takes the whole ``BudgetData`` rather than one month because the goals and
    the trend are only meaningful across months: a goal's progress is the sum
    of its deposits everywhere, not what landed in this one.
    """
    budget = data.months.get(month)
    year, month_number = store.parse_month_key(month)
    points = trend.series(data.months, month)

    return {
        "month": month,
        "year": year,
        "month_number": month_number,
        "currency": currency,
        "summary": _summary(budget),
        "incomes": _entries(budget, "incomes"),
        "expenses": _entries(budget, "expenses"),
        "categories": _categories(budget),
        "goals": _goals(data, month),
        "trend": points,
        "trend_average": trend.averages(points),
    }


def _summary(budget) -> Dict:
    if budget is None:
        return {"income": 0.0, "expenses": 0.0, "net": 0.0, "budget": 0.0, "margin": 0.0}
    return {
        "income": round(budget.total_income(), 2),
        "expenses": round(budget.total_expenses(), 2),
        "net": round(budget.net(), 2),
        "budget": round(budget.total_budget, 2),
        "margin": round(budget.profit_margin(), 2),
    }


def _entries(budget, kind: str) -> List[Dict]:
    """Rows sorted by date, oldest first, so the sheet reads as a statement.

    Rows without a full date sort last. Two shapes reach here and both would
    otherwise land at the top: an empty string sorts before every real date,
    and — less obviously — ``add_expense`` fills a missing date with the month
    alone, so "2026-08" sorts before "2026-08-02" simply by being shorter.
    Sorting on whether the date names a day catches both.
    """
    if budget is None:
        return []
    rows = []
    for entry in getattr(budget, kind):
        rows.append({
            "name": entry.name,
            "amount": round(entry.amount, 2),
            "category": getattr(entry, "category", ""),
            "date": entry.date or "",
        })
    return sorted(rows, key=lambda r: (not _is_full_date(r["date"]), r["date"]))


def _is_full_date(value: str) -> bool:
    """True for YYYY-MM-DD. "2026-08" and "" are both incomplete."""
    return len(str(value)) == 10 and str(value).count("-") == 2


def _categories(budget) -> List[Dict]:
    """Spending per category, largest first, with each one's share."""
    if budget is None:
        return []
    total = budget.total_expenses()
    rows = [
        {"category": name, "amount": round(amount, 2),
         "share": round(amount / total * 100, 1) if total else 0.0}
        for name, amount in budget.expenses_by_category().items()
    ]
    return sorted(rows, key=lambda r: r["amount"], reverse=True)


def _goals(data, month: str) -> List[Dict]:
    rows = []
    for goal in data.goals:
        status = goals_module.status(goal, data.months, month)
        rows.append({
            "name": goal.name,
            "target": round(goal.target, 2),
            "funded": status["funded"],
            "remaining": status["remaining"],
            "percent": status["pct"],
            "this_month": status["this_month"],
            "done": status["done"],
        })
    return rows
