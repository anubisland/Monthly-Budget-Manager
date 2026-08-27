"""Tests for the link between a goal and the budget.

Each of the user's four questions about goals is asserted by name below:
are they tied to the budget, are they achieved, when are they deducted, and
what happens to one that does not finish in its month.
"""

from datetime import date

import pytest

from tests.mobile_app_modules import BudgetData, Goal, budget_data, goals, store  # noqa: F401

AUGUST = date(2026, 8, 27)


@pytest.fixture
def data(tmp_path):
    d = BudgetData(tmp_path / "data.json", today=AUGUST)
    d.month.add_income("Salary", 8000.0, "2026-08-01")
    d.goals.append(Goal(name="Car", target=1000.0))
    return d


def _fund(data, amount, date_str="2026-08-10"):
    return goals.fund(data.goals[0], data.month, amount, date_str, data.months)


# ── question 1: is a goal tied to the budget? ────────────────────────────────

def test_funding_a_goal_is_deducted_from_the_month_as_an_expense(data):
    before = data.month.total_expenses()
    _fund(data, 250.0)
    assert data.month.total_expenses() == before + 250.0


def test_a_deposit_is_filed_under_savings_so_it_shows_in_the_breakdown(data):
    _fund(data, 250.0)
    assert data.month.expenses_by_category()[goals.SAVINGS_CATEGORY] == 250.0


def test_funding_reduces_what_is_left_to_spend(data):
    _fund(data, 250.0)
    assert data.month.net() == 8000.0 - 250.0


# ── question 2: is it achieved? ──────────────────────────────────────────────

def test_progress_reflects_the_deposit_immediately(data):
    _fund(data, 250.0)
    assert goals.status(data.goals[0], data.months, data.current)["pct"] == 25.0


def test_a_goal_is_marked_done_when_fully_funded(data):
    _fund(data, 1000.0)
    assert goals.status(data.goals[0], data.months, data.current)["done"] is True


def test_a_goal_is_not_done_before_that(data):
    _fund(data, 999.0)
    status = goals.status(data.goals[0], data.months, data.current)
    assert status["done"] is False and status["remaining"] == 1.0


# ── question 3: when is it deducted? at each deposit ─────────────────────────

def test_two_deposits_in_one_month_both_count(data):
    _fund(data, 200.0)
    _fund(data, 300.0)
    assert goals.funded(data.goals[0], data.months) == 500.0
    assert data.month.total_expenses() == 500.0


def test_a_deposit_cannot_overfund_the_goal(data):
    taken = _fund(data, 5000.0)
    assert taken == 1000.0, "only what the goal needed"
    assert data.month.total_expenses() == 1000.0, "the rest stays in the month"


def test_depositing_into_a_finished_goal_takes_nothing(data):
    _fund(data, 1000.0)
    assert _fund(data, 100.0) == 0.0
    assert data.month.total_expenses() == 1000.0


@pytest.mark.parametrize("bad", [0.0, -50.0])
def test_a_non_positive_deposit_is_refused(data, bad):
    with pytest.raises(ValueError):
        _fund(data, bad)


# ── question 4: an unfinished goal carries over ──────────────────────────────

def test_progress_accumulates_across_months(data):
    """The user's requirement: a goal not met this month rolls into the next."""
    data.go_to("2026-07")
    goals.fund(data.goals[0], data.month, 300.0, "2026-07-10", data.months)
    data.go_to("2026-08")
    goals.fund(data.goals[0], data.month, 200.0, "2026-08-10", data.months)

    assert goals.funded(data.goals[0], data.months) == 500.0


def test_the_cap_respects_progress_made_in_earlier_months(data):
    data.go_to("2026-07")
    goals.fund(data.goals[0], data.month, 900.0, "2026-07-10", data.months)
    data.go_to("2026-08")

    taken = goals.fund(data.goals[0], data.month, 500.0, "2026-08-10", data.months)
    assert taken == 100.0, "only the 100 still needed"


def test_an_unfinished_goal_started_earlier_is_flagged_as_carried_over(data):
    data.go_to("2026-07")
    goals.fund(data.goals[0], data.month, 300.0, "2026-07-10", data.months)
    data.go_to("2026-08")

    assert goals.status(data.goals[0], data.months, data.current)["carried_over"] is True


def test_a_goal_first_funded_this_month_is_not_carried_over(data):
    _fund(data, 300.0)
    assert goals.status(data.goals[0], data.months, data.current)["carried_over"] is False


def test_a_finished_goal_is_not_flagged_as_carried_over(data):
    data.go_to("2026-07")
    goals.fund(data.goals[0], data.month, 1000.0, "2026-07-10", data.months)
    data.go_to("2026-08")

    status = goals.status(data.goals[0], data.months, data.current)
    assert status["done"] is True and status["carried_over"] is False


def test_this_months_contribution_is_reported_separately_from_the_total(data):
    data.go_to("2026-07")
    goals.fund(data.goals[0], data.month, 300.0, "2026-07-10", data.months)
    data.go_to("2026-08")
    goals.fund(data.goals[0], data.month, 200.0, "2026-08-10", data.months)

    status = goals.status(data.goals[0], data.months, data.current)
    assert status["funded"] == 500.0 and status["this_month"] == 200.0


# ── one source of truth ──────────────────────────────────────────────────────

def test_deleting_the_deposit_reduces_the_goal(data):
    """Why progress is derived rather than stored: no reconciliation step."""
    _fund(data, 400.0)
    data.month.expenses.clear()
    assert goals.funded(data.goals[0], data.months) == 0.0


def test_goal_progress_survives_a_restart(tmp_path):
    path = tmp_path / "data.json"
    first = BudgetData(path, today=AUGUST)
    first.goals.append(Goal(name="Car", target=1000.0))
    goals.fund(first.goals[0], first.month, 400.0, "2026-08-10", first.months)
    first.save()

    second = BudgetData(path, today=AUGUST)
    second.load()
    assert goals.funded(second.goals[0], second.months) == 400.0


def test_a_pre_upgrade_non_zero_baseline_is_honoured_not_discarded(data):
    data.goals[0].current = 100.0
    _fund(data, 50.0)
    assert goals.funded(data.goals[0], data.months) == 150.0


def test_an_unrelated_savings_expense_does_not_count_towards_a_goal(data):
    data.month.add_expense("Emergency fund", 500.0, goals.SAVINGS_CATEGORY, "2026-08-05")
    assert goals.funded(data.goals[0], data.months) == 0.0


def test_a_same_named_expense_in_another_category_does_not_count(data):
    data.month.add_expense("Car", 500.0, "Transport", "2026-08-05")
    assert goals.funded(data.goals[0], data.months) == 0.0
