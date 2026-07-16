from __future__ import annotations

__version__ = "2.0.0"
__app_name__ = "Monthly Budget Manager"

from .core import BudgetMonth, Income, Expense, read_csv, print_report, interactive_collect
from .i18n import I18n
from .theme import set_dark_mode, is_dark_mode, colors, get_colors

__all__ = [
    "BudgetMonth",
    "Income",
    "Expense",
    "read_csv",
    "print_report",
    "interactive_collect",
    "I18n",
    "set_dark_mode",
    "is_dark_mode",
    "colors",
    "get_colors",
    "__version__",
    "__app_name__",
]
