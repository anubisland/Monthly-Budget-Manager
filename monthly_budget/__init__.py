from __future__ import annotations

__version__ = "2.2.8"
__app_name__ = "Monthly Budget Manager"

from .core import BudgetMonth, Expense, Income, interactive_collect, print_report, read_csv
from .i18n import I18n
from .storage import Storage
from .theme import colors, get_colors, is_dark_mode, set_dark_mode

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
    "Storage",
    "__version__",
    "__app_name__",
]
