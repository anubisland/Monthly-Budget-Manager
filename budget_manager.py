#!/usr/bin/env python3
"""
Budget Manager — CLI (v2.0)
============================
A bilingual (English / Arabic) personal finance CLI tool.

Usage:
    python budget_manager.py
    python budget_manager.py --input examples/sample.csv --month 2025-08
    python budget_manager.py --input examples/sample.csv --json

CSV format (header required):
    type,name,category,amount[,date]
    income,Salary,,5000,2025-08-01
    expense,Rent,Housing,1500,2025-08-03

No external dependencies; pure standard library.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Re-export all public API for backward compatibility
from monthly_budget.core import (
    BudgetMonth,
    Expense,
    Income,
    _clamp_non_negative,
    _is_valid_ym,
    _is_valid_ymd,
    _round_map,
    parse_args,
    print_report,
    read_csv,
    main,
)

__all__ = [
    "BudgetMonth", "Expense", "Income",
    "_clamp_non_negative", "_is_valid_ym", "_is_valid_ymd", "_round_map",
    "parse_args", "print_report", "read_csv", "main",
]

if __name__ == "__main__":
    raise SystemExit(main())
