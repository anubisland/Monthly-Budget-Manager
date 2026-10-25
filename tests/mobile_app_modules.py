"""Loads the mobile app's modules in isolation, once, for the test suite.

Two things make a plain ``import`` unsafe here:

* ``budget_manager_mobile/__init__.py`` imports toga, which the test run does
  not have;
* the app's own modules import each other as top-level modules (``import
  store``), because Briefcase flattens the package into the app directory.

So each module is loaded by path. They are loaded against ``monthly_budget`` —
the one package at the repository root. Until recently a second, diverged copy
was vendored under ``mobile/`` and had to be forced into ``sys.modules`` for the
duration of the load, because whichever package was imported first won for the
whole session. That copy is gone; the app depends on the real one, so there is
nothing left to shadow.
"""

import importlib.util
import sys
from pathlib import Path

#: Loaded in dependency order: each imports only the ones before it.
_MOBILE_MODULES = (
    "store", "validate", "errors", "decode",
    "budget_data", "goals", "pace", "trend",
    "report", "share", "xlsx", "statement", "api",
)

_PKG = Path(__file__).resolve().parents[1] / "mobile" / "src" / "budget_manager_mobile"


def _load_by_path(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_mobile_modules():
    # Imported first so the app's modules get this package, not a copy: the
    # point of the shared package is that tests exercise what ships.
    import monthly_budget  # noqa: F401

    added = str(_PKG)
    sys.path.insert(0, added)
    try:
        return {
            name: _load_by_path(name, _PKG / f"{name}.py")
            for name in _MOBILE_MODULES
        }
    finally:
        sys.path.remove(added)


_MODULES = _load_mobile_modules()

store = _MODULES["store"]
validate = _MODULES["validate"]
budget_data = _MODULES["budget_data"]
goals = _MODULES["goals"]
api = _MODULES["api"]
decode = _MODULES["decode"]
pace = _MODULES["pace"]
trend = _MODULES["trend"]
report = _MODULES["report"]
xlsx = _MODULES["xlsx"]
share = _MODULES["share"]
statement = _MODULES["statement"]

BudgetData = budget_data.BudgetData
Goal = budget_data.Goal


def load_app_module():
    """Load ``app.py`` itself, with toga stubbed.

    Kept separate from the module-level loads above because importing app.py
    has side effects — it needs the toga stub in place first — and most tests
    do not want it.
    """
    from tests.toga_stub import install

    install()

    added = str(_PKG)
    sys.path.insert(0, added)
    try:
        for name in _MOBILE_MODULES:
            sys.modules[name] = _MODULES[name]
        return _load_by_path("budget_app", _PKG / "app.py")
    finally:
        sys.path.remove(added)
