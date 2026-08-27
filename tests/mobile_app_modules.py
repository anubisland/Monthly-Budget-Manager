"""Loads the mobile app's modules in isolation, once, for the test suite.

Two things make a plain ``import`` unsafe here:

* ``budget_manager_mobile/__init__.py`` imports toga, which the test run does
  not have;
* the repository contains **two** divergent packages named ``monthly_budget``
  — one at the root, one vendored under ``mobile/`` — so whichever is imported
  first wins for the whole session. The mobile copy has ``total_budget``; the
  root copy renamed it ``total_budgeted``. Importing the wrong one produces an
  AttributeError far from its cause.

So the mobile modules are loaded by path, with ``monthly_budget`` temporarily
forced to the vendored copy and then restored. Class references captured during
the load keep pointing at the right thing afterwards.
"""

import importlib.util
import sys
from pathlib import Path

_MOBILE_SRC = Path(__file__).resolve().parents[1] / "mobile" / "src"
_PKG = _MOBILE_SRC / "budget_manager_mobile"


def _load_by_path(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_mobile_modules():
    """Load store/budget_data/goals against the vendored monthly_budget."""
    shadowed = {k: v for k, v in sys.modules.items() if k.startswith("monthly_budget")}
    for key in shadowed:
        del sys.modules[key]

    added = str(_PKG)
    sys.path.insert(0, added)
    try:
        _load_by_path("monthly_budget", _PKG / "monthly_budget" / "__init__.py")
        _load_by_path("monthly_budget.core", _PKG / "monthly_budget" / "core.py")
        loaded = {
            name: _load_by_path(name, _PKG / f"{name}.py")
            for name in ("store", "validate", "errors", "decode", "budget_data", "goals", "recurring", "automation", "api")
        }
    finally:
        sys.path.remove(added)
        for key in [k for k in sys.modules if k.startswith("monthly_budget")]:
            del sys.modules[key]
        sys.modules.update(shadowed)
    return loaded


_MODULES = _load_mobile_modules()

store = _MODULES["store"]
validate = _MODULES["validate"]
budget_data = _MODULES["budget_data"]
goals = _MODULES["goals"]
api = _MODULES["api"]
automation = _MODULES["automation"]
recurring = _MODULES["recurring"]
decode = _MODULES["decode"]

BudgetData = budget_data.BudgetData
Goal = budget_data.Goal


def load_app_module():
    """Load ``app.py`` itself, with toga stubbed and monthly_budget isolated.

    Kept separate from the module-level loads above because importing app.py
    has side effects — it needs the toga stub in place first — and most tests
    do not want it.
    """
    from tests.toga_stub import install

    install()

    shadowed = {k: v for k, v in sys.modules.items() if k.startswith("monthly_budget")}
    for key in shadowed:
        del sys.modules[key]

    added = str(_PKG)
    sys.path.insert(0, added)
    try:
        _load_by_path("monthly_budget", _PKG / "monthly_budget" / "__init__.py")
        for sub in ("core", "i18n"):
            _load_by_path(f"monthly_budget.{sub}", _PKG / "monthly_budget" / f"{sub}.py")
        for name in ("store", "validate", "errors", "decode", "budget_data", "goals", "recurring", "automation", "api"):
            sys.modules[name] = _MODULES[name]
        return _load_by_path("budget_app", _PKG / "app.py")
    finally:
        sys.path.remove(added)
        for key in [k for k in sys.modules if k.startswith("monthly_budget")]:
            del sys.modules[key]
        sys.modules.update(shadowed)
