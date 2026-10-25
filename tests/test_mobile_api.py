"""Tests for the local HTTP API's routing and validation.

This is the only place untrusted input enters the process, so the defects the
previous handler carried are asserted here by name.
"""

import json

import pytest

from tests.fake_app import FakeApp
from tests.mobile_app_modules import api, goals


@pytest.fixture
def app(tmp_path):
    return FakeApp(tmp_path)


def post(app, path, payload=None):
    return api.dispatch(app, path, payload or {})


# ── the defects the previous handler carried ─────────────────────────────────

def test_an_unknown_endpoint_is_a_404_not_a_silent_success(app):
    """It used to fall through the elif chain, save, and answer 200."""
    with pytest.raises(api.ApiError) as caught:
        post(app, "/api/add-incomme", {"name": "x", "amount": 1})
    assert caught.value.status == 404


def test_a_negative_delete_index_does_not_delete_the_last_row(app):
    """pop(-1) removes the last income. The old code passed the index straight in."""
    post(app, "/api/add-income", {"name": "Salary", "amount": 8000})
    post(app, "/api/add-income", {"name": "Bonus", "amount": 500})

    with pytest.raises(api.ApiError):
        post(app, "/api/delete-income", {"index": -1})

    assert [i.name for i in app.data.month.incomes] == ["Salary", "Bonus"]


def test_an_out_of_range_delete_is_a_404_not_a_crash(app):
    post(app, "/api/add-income", {"name": "Salary", "amount": 8000})
    with pytest.raises(api.ApiError) as caught:
        post(app, "/api/delete-income", {"index": 7})
    assert caught.value.status == 404


def test_a_malformed_body_is_rejected_with_a_reason(app):
    with pytest.raises(api.ApiError) as caught:
        api.read_payload(b"{ truncated")
    assert "malformed" in caught.value.message


@pytest.mark.parametrize("raw", [b"[]", b'"text"', b"42", b"null"])
def test_a_non_object_body_is_rejected(app, raw):
    with pytest.raises(api.ApiError):
        api.read_payload(raw)


def test_an_empty_body_is_an_empty_payload_not_an_error(app):
    assert api.read_payload(b"") == {}


@pytest.mark.parametrize("payload", [
    {},
    {"name": "Salary"},
    {"amount": 100},
    {"name": "", "amount": 100},
    {"name": "Salary", "amount": "abc"},
    {"name": "Salary", "amount": -100},
    {"name": "Salary", "amount": 0},
    {"name": "Salary", "amount": True},
])
def test_an_incomplete_or_invalid_entry_is_refused(app, payload):
    with pytest.raises(api.ApiError):
        post(app, "/api/add-income", payload)
    assert app.data.month.incomes == []


def test_a_refused_request_does_not_save(app):
    with pytest.raises(api.ApiError):
        post(app, "/api/add-income", {"name": "x"})
    assert app.saved_data == 0, "nothing changed, so nothing should be written"


# ── months ───────────────────────────────────────────────────────────────────

def test_stepping_back_a_month_moves_the_view(app):
    post(app, "/api/step-month", {"delta": -1})
    assert app.data.current == "2026-07"


def test_stepping_forward_past_the_present_is_refused(app):
    with pytest.raises(api.ApiError):
        post(app, "/api/step-month", {"delta": 1})
    assert app.data.current == "2026-08"


@pytest.mark.parametrize("delta", [0, 2, -2, "1", None, True, 1.0])
def test_only_one_step_at_a_time_is_accepted(app, delta):
    with pytest.raises(api.ApiError):
        post(app, "/api/step-month", {"delta": delta})


def test_jumping_to_a_specific_month_works(app):
    post(app, "/api/set-month", {"month": "2026-03"})
    assert app.data.current == "2026-03"


@pytest.mark.parametrize("month", ["2026-09", "2027-01", "garbage", "", None, "2026-13"])
def test_an_invalid_or_future_month_is_refused(app, month):
    with pytest.raises(api.ApiError):
        post(app, "/api/set-month", {"month": month})
    assert app.data.current == "2026-08"


def test_the_viewed_month_is_persisted_so_it_survives_a_restart(app):
    post(app, "/api/step-month", {"delta": -1})
    assert app.saved_data == 1
    assert json.loads((app.data._path).read_text("utf-8"))["current"] == "2026-07"


def test_an_entry_added_while_viewing_a_past_month_is_dated_in_that_month(app):
    """Otherwise a July row carries an August date — a row denying its own month."""
    post(app, "/api/step-month", {"delta": -1})
    post(app, "/api/add-expense", {"name": "Rent", "amount": 3000})
    assert app.data.month.expenses[0].date.startswith("2026-07")


def test_an_entry_added_in_the_current_month_is_dated_today(app):
    post(app, "/api/add-expense", {"name": "Rent", "amount": 3000})
    assert app.data.month.expenses[0].date == "2026-08-27"


def test_entries_do_not_leak_between_months(app):
    post(app, "/api/add-income", {"name": "Aug", "amount": 8000})
    post(app, "/api/step-month", {"delta": -1})
    post(app, "/api/add-income", {"name": "Jul", "amount": 7000})

    assert app.data.months["2026-08"].total_income() == 8000.0
    assert app.data.months["2026-07"].total_income() == 7000.0


# ── goals ────────────────────────────────────────────────────────────────────

def _goal(app, target=1000.0):
    post(app, "/api/add-goal", {"name": "Car", "target": target, "icon": "🚗"})


def test_a_goal_can_be_added(app):
    _goal(app)
    assert app.data.goals[0].name == "Car" and app.data.goals[0].target == 1000.0


@pytest.mark.parametrize("payload", [
    {}, {"name": "Car"}, {"target": 100}, {"name": "", "target": 100},
    {"name": "Car", "target": 0}, {"name": "Car", "target": -5}, {"name": "Car", "target": "x"},
])
def test_an_invalid_goal_is_refused(app, payload):
    with pytest.raises(api.ApiError):
        post(app, "/api/add-goal", payload)
    assert app.data.goals == []


def test_a_duplicate_goal_name_is_refused(app):
    """Names are the join key to a goal's deposits, so they must be unique."""
    _goal(app)
    with pytest.raises(api.ApiError):
        _goal(app)
    assert len(app.data.goals) == 1


def test_funding_a_goal_creates_a_savings_expense_in_the_viewed_month(app):
    _goal(app)
    post(app, "/api/fund-goal", {"index": 0, "amount": 250})

    assert app.data.month.total_expenses() == 250.0
    assert app.data.month.expenses_by_category()[goals.SAVINGS_CATEGORY] == 250.0


def test_funding_shows_up_as_goal_progress(app):
    _goal(app)
    post(app, "/api/fund-goal", {"index": 0, "amount": 250})
    assert goals.status(app.data.goals[0], app.data.months, app.data.current)["pct"] == 25.0


def test_funding_a_completed_goal_is_refused_rather_than_taking_the_money(app):
    _goal(app)
    post(app, "/api/fund-goal", {"index": 0, "amount": 1000})
    with pytest.raises(api.ApiError):
        post(app, "/api/fund-goal", {"index": 0, "amount": 50})
    assert app.data.month.total_expenses() == 1000.0


@pytest.mark.parametrize("payload", [
    {"index": 0}, {"amount": 100}, {"index": -1, "amount": 100},
    {"index": 9, "amount": 100}, {"index": 0, "amount": 0}, {"index": 0, "amount": "x"},
])
def test_invalid_funding_is_refused(app, payload):
    _goal(app)
    with pytest.raises(api.ApiError):
        post(app, "/api/fund-goal", payload)
    assert app.data.month.expenses == []


def test_deleting_a_goal_keeps_the_money_it_already_spent(app):
    """Deleting a goal is not a refund; past months must not be rewritten."""
    _goal(app)
    post(app, "/api/fund-goal", {"index": 0, "amount": 250})
    post(app, "/api/delete-goal", {"index": 0})

    assert app.data.goals == []
    assert app.data.month.total_expenses() == 250.0


# ── editing ──────────────────────────────────────────────────────────────────

def test_only_the_fields_supplied_are_changed(app):
    post(app, "/api/add-expense", {"name": "Rent", "amount": 3000, "category": "Rent", "date": "2026-08-05"})
    post(app, "/api/edit-expense", {"index": 0, "amount": 3200})

    row = app.data.month.expenses[0]
    assert (row.name, row.amount, row.category, row.date) == ("Rent", 3200.0, "Rent", "2026-08-05")


@pytest.mark.parametrize("field,bad", [
    ("amount", "abc"), ("amount", -5), ("amount", 0), ("name", ""),
    ("date", "2026-13-01"), ("date", "not-a-date"), ("category", ""),
])
def test_a_supplied_but_invalid_field_is_refused_and_changes_nothing(app, field, bad):
    post(app, "/api/add-expense", {"name": "Rent", "amount": 3000, "category": "Rent", "date": "2026-08-05"})
    with pytest.raises(api.ApiError):
        post(app, "/api/edit-expense", {"index": 0, field: bad})

    row = app.data.month.expenses[0]
    assert (row.name, row.amount, row.category, row.date) == ("Rent", 3000.0, "Rent", "2026-08-05")


def test_editing_a_row_that_is_not_there_is_a_404(app):
    with pytest.raises(api.ApiError) as caught:
        post(app, "/api/edit-income", {"index": 0, "amount": 5})
    assert caught.value.status == 404


# ── settings and whole-file operations ───────────────────────────────────────

def test_the_theme_toggles_and_saves_to_settings_not_to_the_data_file(app):
    post(app, "/api/toggle-theme")
    assert app.dark is True and app.saved_settings == 1 and app.saved_data == 0


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_a_supported_language_is_accepted(app, lang):
    post(app, "/api/set-language", {"lang": lang})
    assert app.lang == lang


@pytest.mark.parametrize("lang", ["fr", "", None, "EN", 5])
def test_an_unsupported_language_is_refused(app, lang):
    with pytest.raises(api.ApiError):
        post(app, "/api/set-language", {"lang": lang})
    assert app.lang == "en"


def test_a_monthly_budget_ceiling_can_be_set_and_zeroed(app):
    post(app, "/api/set-budget", {"total_budget": 5000})
    assert app.data.month.total_budget == 5000.0
    post(app, "/api/set-budget", {"total_budget": 0})
    assert app.data.month.total_budget == 0.0


@pytest.mark.parametrize("value", [-1, "abc", None, True])
def test_an_invalid_budget_ceiling_is_refused(app, value):
    with pytest.raises(api.ApiError):
        post(app, "/api/set-budget", {"total_budget": value})


def test_the_budget_ceiling_belongs_to_its_own_month(app):
    post(app, "/api/set-budget", {"total_budget": 5000})
    post(app, "/api/step-month", {"delta": -1})
    post(app, "/api/set-budget", {"total_budget": 4000})

    assert app.data.months["2026-08"].total_budget == 5000.0
    assert app.data.months["2026-07"].total_budget == 4000.0


def test_reset_clears_every_month_and_returns_to_the_present(app):
    post(app, "/api/add-income", {"name": "Aug", "amount": 8000})
    post(app, "/api/step-month", {"delta": -1})
    post(app, "/api/add-income", {"name": "Jul", "amount": 7000})
    _goal(app)

    post(app, "/api/reset")

    assert app.data.months == {} and app.data.goals == []
    assert app.data.current == "2026-08"


def test_a_save_failure_reaches_the_caller_instead_of_being_swallowed(app):
    """The guarantee behind 'data must never be lost': a failed write is news."""
    app.save_error = OSError("disk full")
    with pytest.raises(OSError):
        post(app, "/api/add-income", {"name": "Salary", "amount": 8000})


def test_a_rejected_edit_leaves_the_row_completely_untouched(app):
    """It used to setattr each field as it validated, so an edit with a good
    name and a bad amount renamed the row and *then* answered 400. The next
    unrelated request wrote that rename to disk."""
    post(app, "/api/add-expense", {"name": "Rent", "amount": 1000, "category": "Rent"})

    with pytest.raises(api.ApiError):
        post(app, "/api/edit-expense", {"index": 0, "name": "Renamed", "amount": "not-a-number"})

    assert app.data.month.expenses[0].name == "Rent", "the earlier field must not have landed"

    post(app, "/api/add-income", {"name": "Salary", "amount": 5000})
    on_disk = json.loads(app.data._path.read_text("utf-8"))
    names = [e["name"] for e in on_disk["months"][app.data.current]["expenses"]]
    assert names == ["Rent"], "and it must not reach disk on a later save either"


def test_a_supplied_but_malformed_date_is_refused_not_silently_replaced(app):
    """`validate.date_text(...) or _default_date(app)` could not tell an absent
    date from a garbage one, so a typo was quietly filed as today."""
    with pytest.raises(api.ApiError) as caught:
        post(app, "/api/add-expense", {"name": "Rent", "amount": 3000, "date": "05/08/2026"})
    assert "date" in caught.value.message
    assert app.data.month.expenses == []


@pytest.mark.parametrize("absent", [{}, {"date": ""}, {"date": None}])
def test_an_absent_date_is_still_defaulted(app, absent):
    post(app, "/api/add-expense", {"name": "Rent", "amount": 3000, **absent})
    assert app.data.month.expenses[0].date == "2026-08-27"


def test_the_add_and_edit_routes_agree_on_what_a_date_is(app):
    """They disagreed: add silently rewrote a bad date, edit rejected it."""
    post(app, "/api/add-expense", {"name": "Rent", "amount": 3000})
    for route in ("/api/add-expense", "/api/edit-expense"):
        payload = {"name": "Rent", "amount": 3000, "date": "2026-13-45"}
        if route.startswith("/api/edit"):
            payload["index"] = 0
        with pytest.raises(api.ApiError):
            post(app, route, payload)


def test_a_recreated_goal_does_not_inherit_the_deleted_one_s_progress(app):
    """Deposits are matched by name and survive the goal's deletion, so reusing
    the name would open a brand-new goal at 40% with no explanation."""
    post(app, "/api/add-goal", {"name": "Car", "target": 1000})
    post(app, "/api/fund-goal", {"index": 0, "amount": 400})
    post(app, "/api/delete-goal", {"index": 0})

    with pytest.raises(api.ApiError) as caught:
        post(app, "/api/add-goal", {"name": "Car", "target": 1000})
    assert "deposits" in caught.value.message
    assert app.data.goals == []


def test_a_name_with_no_past_deposits_can_be_reused_freely(app):
    post(app, "/api/add-goal", {"name": "Car", "target": 1000})
    post(app, "/api/delete-goal", {"index": 0})
    post(app, "/api/add-goal", {"name": "Car", "target": 2000})
    assert app.data.goals[0].target == 2000.0


# ── importing a bank statement ───────────────────────────────────────────────

#: A statement the way banks actually write one: a single signed amount column,
#: a negative written in parentheses, a row from the previous month, and a
#: running-balance line that carries no description at all.
STATEMENT = """Date,Description,Amount
01/08/2026,Weekly shop,-450.00
02/08/2026,Salary,8000.00
03/08/2026,Rent,(3000.00)
04/08/2026,Coffee,-35.50
05/07/2026,Last month's coffee,-20.00
06/08/2026,,0.00
"""


def preview(app, text=STATEMENT):
    post(app, "/api/preview-statement", {"text": text})
    return app.statement_preview


def test_previewing_reports_what_the_paste_produced(app):
    got = preview(app)

    assert got["month"] == "2026-08"
    assert got["read"] == 6
    assert got["skipped"] == 1, "the line with no description is the only one dropped"
    assert [(e["name"], e["kind"], e["amount"]) for e in got["entries"]] == [
        ("Weekly shop", "expense", 450.0),
        ("Salary", "income", 8000.0),
        ("Rent", "expense", 3000.0),
        ("Coffee", "expense", 35.5),
        ("Last month's coffee", "expense", 20.0),
    ]


def test_previewing_writes_nothing(app):
    """The parser decides nothing; a preview must touch neither the month nor
    the file."""
    preview(app)
    assert app.data.month.incomes == []
    assert app.data.month.expenses == []
    assert app.saved_data == 0


def test_a_row_dated_in_another_month_lands_on_the_first_of_this_one(app):
    """A statement often opens with the tail of the previous month. The import
    lands in one month, so the date is clamped rather than the money lost."""
    got = preview(app)
    july = [e for e in got["entries"] if e["name"] == "Last month's coffee"][0]
    assert july["date"] == "2026-08-01"


def test_importing_without_a_preview_is_refused(app):
    """Reading and writing are separate steps, so no request can do both."""
    with pytest.raises(api.ApiError) as caught:
        post(app, "/api/import-statement", {})
    assert caught.value.status == 409
    assert app.data.month.expenses == []


def test_importing_adds_the_previewed_rows_to_the_month(app):
    preview(app)
    post(app, "/api/import-statement", {})

    assert [i.name for i in app.data.month.incomes] == ["Salary"]
    assert [e.name for e in app.data.month.expenses] == [
        "Weekly shop", "Rent", "Coffee", "Last month's coffee",
    ]
    assert app.data.month.expenses[0].amount == 450.0
    assert app.data.month.expenses[0].category == "Uncategorized"
    assert app.statement_preview is None, "the preview is spent once it is applied"
    assert app.last_import == {"month": "2026-08", "added": 5, "skipped": 0}
    assert app.saved_data >= 1, "an import that is not written did not happen"


def test_the_same_statement_twice_is_flagged_and_skipped_by_default(app):
    """The obvious mistake: pasting the same statement again. It is shown as a
    duplicate and left out unless the request asks for it."""
    preview(app)
    post(app, "/api/import-statement", {})

    assert preview(app)["duplicates"] == 5
    post(app, "/api/import-statement", {})
    assert len(app.data.month.expenses) == 4, "nothing was doubled"
    assert app.last_import == {"month": "2026-08", "added": 0, "skipped": 5}


def test_duplicates_can_be_added_when_the_user_says_so(app):
    """Two coffees on one day look exactly like a repeated paste, so the
    decision is the user's rather than the parser's."""
    preview(app)
    post(app, "/api/import-statement", {})

    preview(app)
    post(app, "/api/import-statement", {"include_duplicates": True})
    assert len(app.data.month.expenses) == 8


@pytest.mark.parametrize("flag", ["yes", 1, None, "false"])
def test_the_duplicate_flag_must_be_a_real_boolean(app, flag):
    preview(app)
    with pytest.raises(api.ApiError):
        post(app, "/api/import-statement", {"include_duplicates": flag})


def test_a_preview_going_stale_when_the_month_moves_is_refused(app):
    """The preview was read against one month. Applying it after stepping away
    would put rows somewhere the preview never showed."""
    preview(app)
    post(app, "/api/step-month", {"delta": -1})

    with pytest.raises(api.ApiError) as caught:
        post(app, "/api/import-statement", {})
    assert caught.value.status == 409
    assert app.data.month.expenses == []


@pytest.mark.parametrize("text", ["", "   ", None, 42, {}])
def test_an_empty_or_non_text_statement_is_refused(app, text):
    with pytest.raises(api.ApiError):
        post(app, "/api/preview-statement", {"text": text})
    assert getattr(app, "statement_preview", None) is None


def test_text_that_is_not_a_statement_says_so_without_a_traceback(app):
    """No description column means this was not a statement; the user needs a
    reason, not an exception out of the csv module."""
    with pytest.raises(api.ApiError) as caught:
        post(app, "/api/preview-statement", {"text": "a,b\n1,2\n"})
    assert "description" in caught.value.message


def test_a_name_matching_a_rule_is_filed_under_it(app):
    """The import must not be a second, dumber way into the month: the rules
    that categorise a typed entry categorise a pasted one too."""
    from monthly_budget.core import TransactionRule

    app.data.rules = [TransactionRule(pattern="coffee", category="Food")]
    preview(app)
    post(app, "/api/import-statement", {})

    coffee = [e for e in app.data.month.expenses if e.name == "Coffee"][0]
    assert coffee.category == "Food"
