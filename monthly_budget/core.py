from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
import calendar as _cal
from datetime import date as _date
from pathlib import Path
from typing import Dict, List, Optional, Tuple


@dataclass
class Income:
    name: str
    amount: float
    date: Optional[str] = None

    def to_dict(self) -> Dict:
        return {"name": self.name, "amount": self.amount, "date": self.date}


@dataclass
class Expense:
    name: str
    amount: float
    category: str = "Uncategorized"
    date: Optional[str] = None

    def to_dict(self) -> Dict:
        return {"name": self.name, "amount": self.amount, "category": self.category, "date": self.date}


@dataclass
class RecurringTransaction:
    category: str
    description: str
    amount: float
    frequency: str  # weekly, biweekly, monthly, quarterly, yearly
    day: int  # day of month (1-31) or day of week (0=Mon..6=Sun) for weekly
    start_date: str  # YYYY-MM
    end_date: Optional[str] = None  # YYYY-MM, None = no end
    active: bool = True
    id: int = 0

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "category": self.category,
            "description": self.description,
            "amount": self.amount,
            "frequency": self.frequency,
            "day": self.day,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "active": self.active,
        }


def apply_recurring_for_month(
    recurring_list: List[RecurringTransaction],
    year: int,
    month: int,
) -> List[Expense]:
    """Generate Expense entries for a given month from active recurring templates."""
    result: List[Expense] = []
    for rt in recurring_list:
        if not rt.active:
            continue
        # Check if rt applies to this month
        try:
            sy, sm = (int(x) for x in rt.start_date.split("-"))
        except (ValueError, AttributeError):
            continue
        if (year, month) < (sy, sm):
            continue
        if rt.end_date:
            try:
                ey, em = (int(x) for x in rt.end_date.split("-"))
            except (ValueError, AttributeError):
                pass
            else:
                if (year, month) > (ey, em):
                    continue

        # Determine which days in the month this recurring fires
        days = _recurring_days_in_month(rt, year, month)
        for d in days:
            date_str = f"{year}-{month:02d}-{d:02d}"
            result.append(Expense(
                name=rt.description,
                amount=rt.amount,
                category=rt.category,
                date=date_str,
            ))
    return result


def _recurring_days_in_month(rt: RecurringTransaction, year: int, month: int) -> List[int]:
    """Return list of days-of-month (1-31) when this recurring fires."""
    freq = rt.frequency
    day = rt.day
    days_in_month = _cal.monthrange(year, month)[1]

    if freq == "monthly":
        d = min(day, days_in_month)
        return [d]

    elif freq == "yearly":
        # Only fire in the same month as start_date
        try:
            start_month = int(rt.start_date.split("-")[1])
        except (ValueError, AttributeError, IndexError):
            start_month = 1
        if month != start_month:
            return []
        d = min(day, days_in_month)
        return [d]

    elif freq == "quarterly":
        # Fire on months 1,4,7,10 for quarter-start, etc.
        if month not in (1, 4, 7, 10):
            return []
        return [min(day, days_in_month)]

    elif freq == "weekly":
        # day is day-of-week: 0=Mon..6=Sun
        # Find all occurrences of that weekday in the month
        result: List[int] = []
        for d in range(1, days_in_month + 1):
            wd = _date(year, month, d).weekday()
            if wd == day:
                result.append(d)
        return result

    elif freq == "biweekly":
        # Similar to weekly but every other week
        # Use a simple heuristic: fire on the 1st and 3rd (or 2nd/4th) of the weekday
        result = []
        count = 0
        for d in range(1, days_in_month + 1):
            wd = _date(year, month, d).weekday()
            if wd == day:
                count += 1
                if count % 2 == 1:  # 1st, 3rd, 5th occurrence
                    result.append(d)
        return result

    return []


@dataclass
class TransactionRule:
    pattern: str
    category: str
    enabled: bool = True
    id: int = 0

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "pattern": self.pattern,
            "category": self.category,
            "enabled": self.enabled,
        }


def apply_auto_category(name: str, rules: List[TransactionRule], default: str = "Uncategorized") -> str:
    """Return the first matching rule category, or default."""
    name_lower = name.lower()
    for rule in rules:
        if not rule.enabled:
            continue
        if rule.pattern.lower() in name_lower:
            return rule.category
    return default


@dataclass
class BudgetMonth:
    month: Optional[str] = None
    incomes: List[Income] = field(default_factory=list)
    expenses: List[Expense] = field(default_factory=list)
    budget_limits: Dict[str, float] = field(default_factory=dict)

    def add_income(self, name: str, amount: float, date: Optional[str] = None) -> None:
        self.incomes.append(
            Income(
                name=name.strip() or "Income",
                amount=_clamp_non_negative(amount),
                date=date or self.month,
            )
        )

    def add_expense(self, name: str, amount: float, category: Optional[str] = None, date: Optional[str] = None) -> None:
        self.expenses.append(
            Expense(
                name=name.strip() or "Expense",
                amount=_clamp_non_negative(amount),
                category=(category or "Uncategorized").strip() or "Uncategorized",
                date=date or self.month,
            )
        )

    def total_income(self) -> float:
        return sum(x.amount for x in self.incomes)

    def total_expenses(self) -> float:
        return sum(x.amount for x in self.expenses)

    def net(self) -> float:
        return self.total_income() - self.total_expenses()

    def expenses_by_category(self) -> Dict[str, float]:
        buckets: Dict[str, float] = defaultdict(float)
        for e in self.expenses:
            buckets[e.category] += e.amount
        return dict(buckets)

    def expense_percentages_by_category(self, relative_to: str = "income") -> Dict[str, float]:
        base = self.total_income() if relative_to == "income" else self.total_expenses()
        by_cat = self.expenses_by_category()
        if base <= 0:
            return {k: 0.0 for k in by_cat}
        return {k: (v / base) * 100.0 for k, v in by_cat.items()}

    def profit_margin(self) -> float:
        income = self.total_income()
        if income <= 0:
            return 0.0
        return (self.net() / income) * 100.0

    # ── Envelope budgeting ──────────────────────────────────────────

    def set_budget_limit(self, category: str, limit: float) -> None:
        self.budget_limits[category] = _clamp_non_negative(limit)

    def spent_in_category(self, category: str) -> float:
        return self.expenses_by_category().get(category, 0.0)

    def remaining_in_category(self, category: str) -> float:
        limit = self.budget_limits.get(category, 0.0)
        return limit - self.spent_in_category(category)

    def is_over_budget(self, category: str) -> bool:
        return self.remaining_in_category(category) < 0

    def over_budget_categories(self) -> List[str]:
        return [c for c in self.budget_limits if self.is_over_budget(c)]

    def total_budgeted(self) -> float:
        return sum(self.budget_limits.values())

    def total_remaining(self) -> float:
        return sum(self.remaining_in_category(c) for c in self.budget_limits)

    def budget_progress(self, category: str) -> float:
        limit = self.budget_limits.get(category, 0.0)
        if limit <= 0:
            return 0.0
        return min(self.spent_in_category(category) / limit, 1.0)

    def category_with_limits(self) -> Dict[str, Dict[str, float]]:
        result: Dict[str, Dict[str, float]] = {}
        by_cat = self.expenses_by_category()
        all_cats = set(by_cat.keys()) | set(self.budget_limits.keys())
        for cat in sorted(all_cats):
            result[cat] = {
                "budget": self.budget_limits.get(cat, 0.0),
                "spent": by_cat.get(cat, 0.0),
                "remaining": self.remaining_in_category(cat),
            }
        return result

    # ── Serialization ──────────────────────────────────────────────

    def to_dict(self) -> Dict:
        return {
            "month": self.month,
            "incomes": [x.to_dict() for x in self.incomes],
            "expenses": [x.to_dict() for x in self.expenses],
            "budget_limits": dict(self.budget_limits),
            "totals": {
                "income": round(self.total_income(), 2),
                "expenses": round(self.total_expenses(), 2),
                "net": round(self.net(), 2),
                "profit_margin_pct": round(self.profit_margin(), 2),
            },
            "breakdown": {
                "by_category": _round_map(self.expenses_by_category()),
                "percent_of_income": _round_map(self.expense_percentages_by_category("income")),
                "percent_of_expenses": _round_map(self.expense_percentages_by_category("expenses")),
            },
        }

    def from_dict(self, data: Dict) -> None:
        self.month = data.get("month")
        self.incomes = [Income(**inc) for inc in data.get("incomes", [])]
        self.expenses = [Expense(**exp) for exp in data.get("expenses", [])]
        self.budget_limits = dict(data.get("budget_limits", {}))

    def clear(self) -> None:
        self.incomes.clear()
        self.expenses.clear()
        self.budget_limits.clear()
        self.month = None


def _clamp_non_negative(value: float) -> float:
    try:
        v = float(value)
    except Exception:
        return 0.0
    return max(0.0, v)


def _round_map(d: Dict[str, float], ndigits: int = 2) -> Dict[str, float]:
    return {k: round(v, ndigits) for k, v in d.items()}


def read_csv(path: Path) -> Tuple[List[Income], List[Expense]]:
    incomes: List[Income] = []
    expenses: List[Expense] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        headers_lower = [h.lower() for h in (reader.fieldnames or [])]
        required = {"type", "name", "amount"}
        missing = required - set(headers_lower)
        if missing:
            raise ValueError(f"CSV is missing required headers: {sorted(missing)}")
        for row in reader:
            row_l = {k.lower(): (v or "").strip() for k, v in row.items()}
            rtype = row_l.get("type")
            name = row_l.get("name") or ("Income" if rtype == "income" else "Expense")
            amount_str = row_l.get("amount") or "0"
            date_val = row_l.get("date")
            if not date_val:
                year = row_l.get("year")
                month = row_l.get("month")
                day = row_l.get("day")
                if year and month and len(year) == 4 and len(month) in (1, 2):
                    if day and day.isdigit():
                        date_val = f"{year}-{int(month):02d}-{int(day):02d}"
                    else:
                        date_val = f"{year}-{int(month):02d}"
            try:
                amount = float(amount_str)
            except ValueError:
                amount = 0.0
            if rtype == "income":
                incomes.append(Income(name=name, amount=_clamp_non_negative(amount), date=date_val))
            elif rtype == "expense":
                cat = row_l.get("category") or "Uncategorized"
                expenses.append(Expense(name=name, amount=_clamp_non_negative(amount), category=cat, date=date_val))
            else:
                continue
    return incomes, expenses


def print_report(bm: BudgetMonth, out_stream=sys.stdout) -> None:
    title = f"Monthly Budget Report{f' for {bm.month}' if bm.month else ''}"
    print("=" * len(title), file=out_stream)
    print(title, file=out_stream)
    print("=" * len(title), file=out_stream)

    inc = bm.total_income()
    exp = bm.total_expenses()
    net = bm.net()
    pm = bm.profit_margin()

    def money(v: float) -> str:
        return f"${v:,.2f}"

    print(f"Total Income:   {money(inc)}", file=out_stream)
    print(f"Total Expenses: {money(exp)}", file=out_stream)
    print(f"Net (Profit):   {money(net)}", file=out_stream)
    print(f"Profit Margin:  {pm:.2f}%", file=out_stream)
    print("", file=out_stream)

    cat = bm.expenses_by_category()
    if not cat:
        print("No expenses entered.", file=out_stream)
        return

    p_income = bm.expense_percentages_by_category("income")
    p_exp = bm.expense_percentages_by_category("expenses")

    rows = [(k, cat[k], p_income.get(k, 0.0), p_exp.get(k, 0.0)) for k in sorted(cat.keys())]
    headers = ("Category", "Amount", "% of Income", "% of Expenses")

    col1_w = max(len(headers[0]), *(len(str(r[0])) for r in rows))
    col2_w = max(len(headers[1]), *(len(f"{r[1]:,.2f}") for r in rows))
    col3_w = max(len(headers[2]), *(len(f"{r[2]:.2f}%") for r in rows))
    col4_w = max(len(headers[3]), *(len(f"{r[3]:.2f}%") for r in rows))

    def line(char: str = "-"):
        print(char * (col1_w + col2_w + col3_w + col4_w + 9), file=out_stream)

    print("Expense Breakdown by Category:", file=out_stream)
    line()
    print(
        f"{headers[0]:<{col1_w}} | {headers[1]:>{col2_w}} | {headers[2]:>{col3_w}} | {headers[3]:>{col4_w}}",
        file=out_stream,
    )
    line()
    for name, amt, pi, pe in rows:
        print(
            f"{name:<{col1_w}} | {amt:>{col2_w},.2f} | {pi:>{col3_w}.2f}% | {pe:>{col4_w}.2f}%",
            file=out_stream,
        )
    line()


def interactive_collect(month: Optional[str]) -> BudgetMonth:
    from .i18n import I18n
    _ = I18n.get_instance().t

    print(_("cli.interactive_incomes"))
    bm = BudgetMonth(month=month)
    while True:
        name = input(_("cli.prompt_name")).strip()
        if not name:
            break
        amount = _ask_amount()
        date = _ask_date(default=bm.month)
        bm.add_income(name, amount, date)

    print(f"\n{_('cli.interactive_expenses')}")
    while True:
        name = input(_("cli.prompt_expense_name")).strip()
        if not name:
            break
        category = input(_("cli.prompt_category")).strip() or "Uncategorized"
        amount = _ask_amount()
        date = _ask_date(default=bm.month)
        bm.add_expense(name, amount, category, date)

    return bm


def _ask_amount() -> float:
    from .i18n import I18n
    _ = I18n.get_instance().t

    while True:
        raw = input(_("cli.prompt_amount")).strip().replace(",", "")
        try:
            value = float(raw)
            if value < 0:
                print(_("cli.error_amount_non_negative"))
                continue
            return value
        except ValueError:
            print(_("cli.error_invalid_number"))


def _ask_date(default: Optional[str] = None) -> Optional[str]:
    from .i18n import I18n
    _ = I18n.get_instance().t

    effective_default = default or _date.today().strftime("%Y-%m-%d")
    raw = input(_("cli.prompt_date", default=effective_default)).strip()
    if not raw:
        return effective_default
    if _is_valid_ymd(raw) or _is_valid_ym(raw):
        return raw
    print(_("cli.invalid_date_format"))
    return effective_default


def _is_valid_ym(s: str) -> bool:
    if len(s) != 7 or s[4] != "-":
        return False
    y, m = s.split("-", 1)
    if not (y.isdigit() and m.isdigit()):
        return False
    mi = int(m)
    return 1 <= mi <= 12


def _is_valid_ymd(s: str) -> bool:
    if len(s) != 10 or s[4] != "-" or s[7] != "-":
        return False
    y, m, d = s.split("-")
    if not (y.isdigit() and m.isdigit() and d.isdigit()):
        return False
    mi = int(m)
    di = int(d)
    if not (1 <= mi <= 12 and 1 <= di <= 31):
        return False
    return True


def parse_args(argv: Optional[List[str]] = None) -> "argparse.Namespace":
    from .i18n import I18n
    _ = I18n.get_instance().t

    p = argparse.ArgumentParser(description=_("cli.usage"))
    p.add_argument("--input", type=str, help="Path to CSV file to import (type,name,category,amount). If omitted, runs interactive mode.")
    p.add_argument("--month", type=str, help="Month label for the report, e.g., 2025-08.")
    p.add_argument("--json", action="store_true", help="Output JSON instead of a human-readable table.")
    p.add_argument("--save-json", type=str, help="Optional path to save the JSON report.")
    p.add_argument("--version", action="store_true", help="Show version and exit.")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    from .i18n import I18n
    from . import __version__

    args = parse_args(argv)

    if args.version:
        print(f"Monthly Budget Manager v{__version__}")
        return 0

    bm = BudgetMonth(month=args.month)

    if args.input:
        path = Path(args.input)
        if not path.exists():
            print(I18n.get_instance().t("cli.error_file_not_found", path=str(path)), file=sys.stderr)
            return 2
        incomes, expenses = read_csv(path)
        bm.incomes.extend(incomes)
        bm.expenses.extend(expenses)
    else:
        bm = interactive_collect(args.month)

    if args.json:
        data = bm.to_dict()
        out = json.dumps(data, indent=2)
        print(out)
        if args.save_json:
            Path(args.save_json).write_text(out, encoding="utf-8")
    else:
        print_report(bm)
        if args.save_json:
            Path(args.save_json).write_text(json.dumps(bm.to_dict(), indent=2), encoding="utf-8")

    return 0
