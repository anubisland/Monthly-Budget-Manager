#!/usr/bin/env python3
"""
Budget Manager: Track monthly income and expenses and compute percentages.

Usage examples:
  - Interactive mode:
      python budget_manager.py
  - From CSV file:
      python budget_manager.py --input examples/sample.csv --month 2025-08
  - JSON output (for automation):
      python budget_manager.py --input examples/sample.csv --json

CSV format (header required):
    type,name,category,amount[,date]
    # 'date' can be month-level (YYYY-MM) or day-level (YYYY-MM-DD)
    income,Salary,,5000,2025-08-01
    expense,Rent,Housing,1500,2025-08-03
    expense,Groceries,Food,400,2025-08
    # alternatively provide separate year+month[+day] columns instead of 'date'

No external dependencies; pure standard library.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import date as _date


@dataclass
class Income:
    name: str
    amount: float
    date: Optional[str] = None  # YYYY-MM (default: BudgetMonth.month)


@dataclass
class Expense:
    name: str
    amount: float
    category: str = "Uncategorized"
    date: Optional[str] = None  # YYYY-MM (default: BudgetMonth.month)


@dataclass
class BudgetMonth:
    month: Optional[str] = None  # e.g., "2025-08"
    incomes: List[Income] = field(default_factory=list)
    expenses: List[Expense] = field(default_factory=list)

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

    # Totals
    def total_income(self) -> float:
        return sum(x.amount for x in self.incomes)

    def total_expenses(self) -> float:
        return sum(x.amount for x in self.expenses)

    def net(self) -> float:
        return self.total_income() - self.total_expenses()

    # Percentages and breakdowns
    def expenses_by_category(self) -> Dict[str, float]:
        buckets: Dict[str, float] = defaultdict(float)
        for e in self.expenses:
            buckets[e.category] += e.amount
        return dict(buckets)

    def expense_percentages_by_category(self, relative_to: str = "income") -> Dict[str, float]:
        base = self.total_income() if relative_to == "income" else self.total_expenses()
        by_cat = self.expenses_by_category()
        if base <= 0:
            # Avoid division by zero; return 0s
            return {k: 0.0 for k in by_cat}
        return {k: (v / base) * 100.0 for k, v in by_cat.items()}

    def profit_margin(self) -> float:
        income = self.total_income()
        if income <= 0:
            return 0.0
        return (self.net() / income) * 100.0

    # Serialization helpers (JSON friendly)
    def to_dict(self) -> Dict:
        return {
            "month": self.month,
            "incomes": [x.__dict__ for x in self.incomes],
            "expenses": [x.__dict__ for x in self.expenses],
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
    with path.open(newline='', encoding='utf-8') as f:
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
            # date can be provided as 'date' (YYYY-MM or YYYY-MM-DD)
            # or via separate 'year' + 'month' [+ 'day'] columns
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
                # Unknown type; skip
                continue
    return incomes, expenses


def print_report(bm: BudgetMonth, out_stream = sys.stdout) -> None:
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

    # Category table
    cat = bm.expenses_by_category()
    if not cat:
        print("No expenses entered.", file=out_stream)
        return

    p_income = bm.expense_percentages_by_category("income")
    p_exp = bm.expense_percentages_by_category("expenses")

    rows = [(k, cat[k], p_income.get(k, 0.0), p_exp.get(k, 0.0)) for k in sorted(cat.keys())]
    headers = ("Category", "Amount", "% of Income", "% of Expenses")

    # Compute column widths
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
    print("Enter your monthly incomes. Leave name blank to stop.")
    bm = BudgetMonth(month=month)
    while True:
        name = input("Income name (blank to finish): ").strip()
        if not name:
            break
        amount = _ask_amount("Amount: $")
        date = _ask_date(default=bm.month)
        bm.add_income(name, amount, date)

    print("\nEnter your monthly expenses. Leave name blank to stop.")
    while True:
        name = input("Expense name (blank to finish): ").strip()
        if not name:
            break
        category = input("Category (e.g., Housing, Food, Utilities): ").strip() or "Uncategorized"
        amount = _ask_amount("Amount: $")
        date = _ask_date(default=bm.month)
        bm.add_expense(name, amount, category, date)

    return bm


def _ask_amount(prompt: str) -> float:
    while True:
        raw = input(prompt).strip().replace(",", "")
        try:
            value = float(raw)
            if value < 0:
                print("Amount must be non-negative. Try again.")
                continue
            return value
        except ValueError:
            print("Please enter a valid number (e.g., 1234.56).")


def _ask_date(default: Optional[str] = None) -> Optional[str]:
    """Ask for a date. Accepts YYYY-MM-DD (preferred) or YYYY-MM. Blank keeps default."""
    # Provide a sensible default: today's date if no default provided
    effective_default = default or _date.today().strftime("%Y-%m-%d")
    raw = input(f"Date (YYYY-MM-DD or YYYY-MM) [default {effective_default}]: ").strip()
    if not raw:
        return effective_default
    if _is_valid_ymd(raw) or _is_valid_ym(raw):
        return raw
    print("Invalid format, expected YYYY-MM-DD or YYYY-MM. Using default if available.")
    return effective_default


def _is_valid_ym(s: str) -> bool:
    if len(s) != 7 or s[4] != '-':
        return False
    y, m = s.split('-', 1)
    if not (y.isdigit() and m.isdigit()):
        return False
    mi = int(m)
    return 1 <= mi <= 12


def _is_valid_ymd(s: str) -> bool:
    if len(s) != 10 or s[4] != '-' or s[7] != '-':
        return False
    y, m, d = s.split('-')
    if not (y.isdigit() and m.isdigit() and d.isdigit()):
        return False
    mi = int(m)
    di = int(d)
    if not (1 <= mi <= 12 and 1 <= di <= 31):
        return False
    # Basic validation; not checking month/day combos (e.g., Feb 30)
    return True


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Manage monthly income and expenses and compute percentage breakdowns.")
    p.add_argument("--input", type=str, help="Path to CSV file to import (type,name,category,amount). If omitted, runs interactive mode.")
    p.add_argument("--month", type=str, help="Month label for the report, e.g., 2025-08.")
    p.add_argument("--json", action="store_true", help="Output JSON instead of a human-readable table.")
    p.add_argument("--save-json", type=str, help="Optional path to save the JSON report.")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    bm = BudgetMonth(month=args.month)

    if args.input:
        path = Path(args.input)
        if not path.exists():
            print(f"Error: Input file not found: {path}", file=sys.stderr)
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


if __name__ == "__main__":
    raise SystemExit(main())
