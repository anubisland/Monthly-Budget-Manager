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
