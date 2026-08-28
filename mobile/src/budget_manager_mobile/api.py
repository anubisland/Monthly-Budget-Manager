"""The local HTTP API's routing and request validation.

Split out of ``app.py`` for two reasons. It is the only place untrusted input
enters the process, so it deserves to be read on its own; and as a plain
function over a dict it can be tested without starting a server.

Every handler returns ``None`` on success — the caller then answers with the
full application state, which is what the WebView re-renders from. Anything
invalid raises :class:`ApiError`, so a bad request produces a 4xx with a reason
instead of the previous behaviour: an unhandled traceback, or worse, a 200 for
a route that did nothing.
"""

from __future__ import annotations

import json
from typing import Callable, Dict

import automation
import goals
import report
import share
import store
import validate
import xlsx
from budget_data import Goal
from errors import ApiError
from errors import row as _row

from monthly_budget.core import (
    apply_auto_category,
)


def read_payload(raw: bytes) -> Dict:
    """Parse a request body. Raises ApiError rather than propagating anything.

    The previous code called ``json.loads`` on the raw read with no guard, so a
    truncated or non-JSON body took down the request with a traceback.
    """
    if not raw:
        return {}
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise ApiError("malformed JSON body")
    if not isinstance(payload, dict):
        raise ApiError("body must be a JSON object")
    return payload


# ── entries ──────────────────────────────────────────────────────────────────

def _add_income(app, d: Dict) -> None:
    app.data.month.add_income(*_entry_fields(app, d))


def _add_expense(app, d: Dict) -> None:
    name, amount, date = _entry_fields(app, d)
    app.data.month.add_expense(name, amount, _category_for(app, d, name), date)


def _category_for(app, d: Dict, name: str) -> str:
    """The category the user chose, or the one their rules imply.

    Rules only fill a gap; an explicit choice always wins. Otherwise correcting
    a mis-categorised row would be undone the moment it was saved.
    """
    chosen = validate.text(d.get("category"), limit=40)
    if chosen:
        return chosen
    return apply_auto_category(name, app.data.rules, "Uncategorized")


def _entry_fields(app, d: Dict):
    """The three fields every entry shares, validated together.

    The date defaults into the month being *viewed*, not today, so an entry
    added while looking at a past month is dated inside that month rather than
    silently landing in the present.
    """
    name = validate.text(d.get("name"))
    if name is None:
        raise ApiError("a name is required")
    amount = validate.amount(d.get("amount"))
    if amount is None:
        raise ApiError("amount must be a positive number")
    return name, amount, _entry_date(app, d)


def _entry_date(app, d: Dict) -> str:
    """The row's date: defaulted when absent, rejected when supplied and wrong.

    ``validate.date_text(...) or _default_date(app)`` could not tell those two
    apart, so a mistyped date was quietly replaced with today's — and the same
    value the add form accepted, the edit route refused.
    """
    supplied = d.get("date")
    if supplied in (None, ""):
        return _default_date(app)
    parsed = validate.date_text(supplied)
    if parsed is None:
        raise ApiError("date must be YYYY-MM-DD")
    return parsed


def _default_date(app) -> str:
    """Day 1 of the viewed month, or today when that month is the present."""
    if app.data.current == app.data.this_month():
        return app.today_iso()
    return f"{app.data.current}-01"


def _delete_income(app, d: Dict) -> None:
    app.data.month.incomes.pop(_row(d, app.data.month.incomes))


def _delete_expense(app, d: Dict) -> None:
    app.data.month.expenses.pop(_row(d, app.data.month.expenses))


def _edit_income(app, d: Dict) -> None:
    row = app.data.month.incomes[_row(d, app.data.month.incomes)]
    _apply_edits(row, d, ("name", "amount", "date"))


def _edit_expense(app, d: Dict) -> None:
    row = app.data.month.expenses[_row(d, app.data.month.expenses)]
    _apply_edits(row, d, ("name", "amount", "category", "date"))


def _apply_edits(row, d: Dict, fields) -> None:
    """Apply only the fields present, and only if each one validates.

    A field that is present but invalid is an error rather than a silent skip;
    the previous code's ``float(d['amount'])`` raised ValueError instead, which
    reached the user as a dead request.
    """
    validators = {
        "name": lambda v: validate.text(v),
        "amount": lambda v: validate.amount(v),
        "category": lambda v: validate.text(v, limit=40),
        "date": lambda v: validate.date_text(v),
    }
    # Validate every supplied field first, and only then write. Writing as we
    # went left a rejected edit half-applied in memory: the request answered
    # 400 and skipped the save, but the next unrelated request persisted the
    # part that had already landed.
    accepted = {}
    for field in fields:
        if field not in d:
            continue
        value = validators[field](d[field])
        if value is None:
            raise ApiError(f"invalid {field}")
        accepted[field] = value

    for field, value in accepted.items():
        setattr(row, field, value)


# ── months ───────────────────────────────────────────────────────────────────

def _set_month(app, d: Dict) -> None:
    """Move the view to a specific month. Refuses the future."""
    key = d.get("month")
    if not app.data.go_to(key):
        raise ApiError("that month cannot be shown")


def _step_month(app, d: Dict) -> None:
    """Move one month at a time, which is what the arrows in the bar do."""
    delta = d.get("delta")
    if delta not in (-1, 1) or isinstance(delta, bool):
        raise ApiError("delta must be -1 or 1")
    if not app.data.go_to(store.shift_month(app.data.current, delta)):
        raise ApiError("no month there")


# ── goals ────────────────────────────────────────────────────────────────────

def _add_goal(app, d: Dict) -> None:
    name = validate.text(d.get("name"))
    target = validate.amount(d.get("target"))
    if name is None:
        raise ApiError("a goal needs a name")
    if target is None:
        raise ApiError("a goal needs a positive target")
    if any(g.name == name for g in app.data.goals):
        raise ApiError("a goal with that name already exists")
    # Deposits are matched to a goal by name, and deleting a goal deliberately
    # leaves its deposits in the months they were spent in. Reusing the name
    # would therefore hand the new goal the old one's progress — it would open
    # at 40% funded with no explanation.
    if goals.deposits(name, app.data.months) > 0:
        raise ApiError("that name still has past deposits; choose another")

    icon = validate.text(d.get("icon"), limit=8) or "🎯"
    app.data.goals.append(Goal(name=name, target=target, icon=icon))


def _delete_goal(app, d: Dict) -> None:
    """Remove a goal. Its deposits stay: they were real money, really spent.

    Deleting the goal is not a refund, so the Savings expenses it created
    remain in the months they belong to. Removing them instead would silently
    rewrite past months' totals.
    """
    app.data.goals.pop(_row(d, app.data.goals))


def _fund_goal(app, d: Dict) -> None:
    """Put money into a goal, as an expense in the month being viewed."""
    idx = validate.index(d.get("index"), len(app.data.goals))
    if idx is None:
        raise ApiError("no such goal", 404)
    amount = validate.amount(d.get("amount"))
    if amount is None:
        raise ApiError("amount must be a positive number")

    taken = goals.fund(
        app.data.goals[idx], app.data.month, amount, _default_date(app), app.data.months
    )
    if taken <= 0:
        raise ApiError("that goal is already fully funded")


# ── exporting ────────────────────────────────────────────────────────────────

def _export(app, d: Dict) -> None:
    """Write the month on screen as a spreadsheet, then offer to share it.

    The write and the share are separate outcomes on purpose. A file that was
    written but not shared is still a success — the user has it, and is told
    where — while treating the pair as one operation would throw away a good
    export because the share sheet was unavailable.
    """
    month = d.get("month")
    if not store.is_month_key(month):
        month = app.data.current

    path = app.export_path(f"budget-{month}.xlsx")
    try:
        xlsx.write(report.build(app.data, month, app.currency), path)
    except xlsx.ExportError as err:
        raise ApiError(str(err), 500)

    shared, reason = share.share(path, f"Budget {month}")
    app.last_export = {"path": str(path), "shared": shared, "reason": reason}


# ── settings and whole-file operations ───────────────────────────────────────

def _set_budget(app, d: Dict) -> None:
    amount = validate.amount(d.get("total_budget"), allow_zero=True)
    if amount is None:
        raise ApiError("budget must be zero or a positive number")
    app.data.month.total_budget = amount


def _toggle_theme(app, d: Dict) -> None:
    app.set_dark(not app.dark)


def _set_language(app, d: Dict) -> None:
    lang = d.get("lang")
    if lang not in ("en", "ar"):
        raise ApiError("unsupported language")
    app.set_language(lang)


def _set_currency(app, d: Dict) -> None:
    currency = validate.text(d.get("currency"), limit=8)
    if currency is None:
        raise ApiError("a currency is required")
    app.set_currency(currency)


def _reset(app, d: Dict) -> None:
    app.data.reset()


# ── routing ──────────────────────────────────────────────────────────────────

#: Path → handler. A route absent from this table is a 404, not a silent 200.
#: The previous chain of ``elif``s fell through to a save-and-succeed, so a
#: mistyped endpoint reported success while doing nothing.
ROUTES: Dict[str, Callable[[object, Dict], None]] = {
    "/api/add-income": _add_income,
    "/api/add-expense": _add_expense,
    "/api/delete-income": _delete_income,
    "/api/delete-expense": _delete_expense,
    "/api/edit-income": _edit_income,
    "/api/edit-expense": _edit_expense,
    "/api/set-month": _set_month,
    "/api/step-month": _step_month,
    "/api/add-goal": _add_goal,
    "/api/delete-goal": _delete_goal,
    "/api/fund-goal": _fund_goal,
    "/api/add-rule": automation.add_rule,
    "/api/delete-rule": automation.delete_rule,
    "/api/add-recurring": automation.add_recurring,
    "/api/delete-recurring": automation.delete_recurring,
    "/api/apply-recurring": automation.apply_recurring,
    "/api/skip-recurring": automation.skip_recurring,
    "/api/export": _export,
    "/api/set-budget": _set_budget,
    "/api/toggle-theme": _toggle_theme,
    "/api/set-language": _set_language,
    "/api/set-currency": _set_currency,
    "/api/reset": _reset,
}

#: Routes that change only settings, which live in their own file.
_SETTINGS_ROUTES = frozenset({"/api/toggle-theme", "/api/set-language", "/api/set-currency"})

#: Routes that change nothing worth persisting. Saving after an export would
#: rewrite the data file for an operation that only read it.
_READ_ONLY_ROUTES = frozenset({"/api/export"})


def dispatch(app, path: str, payload: Dict) -> None:
    """Run one request, then persist whatever it changed.

    Persisting here rather than in each handler is what guarantees no change
    can be made without being written; the save is deliberately *not* wrapped,
    so a failure reaches the caller and then the user.
    """
    handler = ROUTES.get(path)
    if handler is None:
        raise ApiError(f"no such endpoint: {path}", 404)

    handler(app, payload)

    if path in _READ_ONLY_ROUTES:
        return
    if path in _SETTINGS_ROUTES:
        app.save_settings()
    else:
        app.save_data()
