"""Tests for the multi-month series.

The gap handling is the substance here: a month with nothing recorded is not
a month where nothing was spent, and the two must not be shown as the same.
"""

from datetime import date

import pytest

from tests.mobile_app_modules import BudgetData, trend

AUGUST = date(2026, 8, 27)


@pytest.fixture
def data(tmp_path):
    return BudgetData(tmp_path / "data.json", today=AUGUST)


def fill(data, month, income, expenses):
    data.go_to(month)
    if income:
        data.month.add_income("Salary", income, f"{month}-01")
    if expenses:
        data.month.add_expense("Rent", expenses, "Rent", f"{month}-02")


def test_the_series_is_contiguous_and_ends_at_the_current_month(data):
    points = trend.series(data.months, "2026-08", span=6)
    assert [p["month"] for p in points] == [
        "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
    ]


def test_it_crosses_the_year_boundary(data):
    points = trend.series(data.months, "2026-02", span=4)
    assert [p["month"] for p in points] == ["2025-11", "2025-12", "2026-01", "2026-02"]


def test_a_month_with_no_data_keeps_its_place_but_is_flagged_empty(data):
    """Dropping it would run June straight into August as if adjacent; showing
    it as zero would assert nothing was spent, which is a different claim."""
    fill(data, "2026-06", 5000, 3000)
    fill(data, "2026-08", 6000, 3500)

    points = {p["month"]: p for p in trend.series(data.months, "2026-08", span=3)}
    assert points["2026-07"]["empty"] is True
    assert points["2026-07"]["expenses"] == 0.0
    assert points["2026-06"]["empty"] is False


def test_each_month_reports_its_own_totals(data):
    fill(data, "2026-07", 5000, 3000)
    fill(data, "2026-08", 6000, 3500)

    points = {p["month"]: p for p in trend.series(data.months, "2026-08", span=2)}
    assert points["2026-07"]["income"] == 5000.0
    assert points["2026-07"]["net"] == 2000.0
    assert points["2026-08"]["expenses"] == 3500.0


def test_averages_ignore_the_empty_months(data):
    """Counting them as zero would drag every average down and make a sparse
    history look thrifty."""
    fill(data, "2026-06", 6000, 4000)
    fill(data, "2026-08", 4000, 2000)

    stats = trend.averages(trend.series(data.months, "2026-08", span=3))
    assert stats["months"] == 2
    assert stats["income"] == 5000.0
    assert stats["expenses"] == 3000.0


def test_averages_of_nothing_are_zero_not_a_division_error(data):
    stats = trend.averages(trend.series(data.months, "2026-08", span=6))
    assert stats == {"months": 0, "income": 0.0, "expenses": 0.0, "net": 0.0}


@pytest.mark.parametrize("span,expected", [(1, 1), (0, 1), (-5, 1), (100, 24), (12, 12)])
def test_the_span_is_clamped_to_something_a_phone_can_draw(data, span, expected):
    assert len(trend.series(data.months, "2026-08", span=span)) == expected


def test_a_month_visited_but_left_empty_counts_as_empty(data):
    """go_to creates the month lazily, so an empty BudgetMonth exists in the
    dict. It must still read as no data rather than as a zero result."""
    data.go_to("2026-07")
    _ = data.month
    data.go_to("2026-08")

    points = {p["month"]: p for p in trend.series(data.months, "2026-08", span=2)}
    assert points["2026-07"]["empty"] is True
