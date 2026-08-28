"""Tests for spending pace and the end-of-month forecast.

The value of a forecast is entirely in when it refuses to give one: a
confident wrong number is worse than no number, because the user acts on it.
"""

from datetime import date

import pytest

from tests.mobile_app_modules import pace

AUG = (2026, 8)          # 31 days
MID_AUG = date(2026, 8, 16)


# ── how much of the month has passed ─────────────────────────────────────────

def test_elapsed_is_the_fraction_of_days_gone():
    assert pace.elapsed(2026, 8, date(2026, 8, 16)) == pytest.approx(16 / 31)


def test_a_past_month_is_wholly_elapsed():
    assert pace.elapsed(2026, 7, MID_AUG) == 1.0


def test_a_future_month_has_not_started():
    assert pace.elapsed(2026, 9, MID_AUG) == 0.0


def test_the_last_day_is_the_whole_month():
    assert pace.elapsed(2026, 8, date(2026, 8, 31)) == 1.0


def test_february_length_is_taken_from_the_calendar():
    assert pace.days_in(2026, 2) == 28
    assert pace.days_in(2028, 2) == 29, "a leap year"


# ── the forecast, and when it refuses ────────────────────────────────────────

def test_a_forecast_extrapolates_the_current_rate():
    """Half the month gone and 1500 spent projects to about 3000."""
    projected = pace.forecast(1500.0, *AUG, date(2026, 8, 16))
    assert projected == pytest.approx(1500 / (16 / 31), rel=1e-3)


@pytest.mark.parametrize("day", [1, 2, 3])
def test_no_forecast_in_the_first_days(day):
    """On day 1, spending 100 projects to 3,100 — true to the formula and
    useless to read. The early month divides by a tiny fraction."""
    assert pace.forecast(100.0, *AUG, date(2026, 8, day)) is None


def test_a_forecast_starts_once_there_is_enough_month_to_read():
    assert pace.forecast(100.0, *AUG, date(2026, 8, pace.MIN_DAYS)) is not None


def test_a_past_month_is_never_forecast():
    """It is finished. Projecting it is arithmetic pretending to be prediction."""
    assert pace.forecast(1500.0, 2026, 7, MID_AUG) is None


def test_a_future_month_is_never_forecast():
    assert pace.forecast(1500.0, 2026, 9, MID_AUG) is None


def test_nothing_spent_yields_no_forecast_rather_than_zero(app=None):
    assert pace.forecast(0.0, *AUG, MID_AUG) is None


# ── on track, ahead, or over ─────────────────────────────────────────────────

def state(spent, budget, today=MID_AUG):
    return pace.status(spent, budget, *AUG, today)["state"]


def test_spending_in_step_with_the_month_is_on_track():
    """Half the month, half the budget."""
    assert state(1500.0, 3000.0) == "on_track"


def test_spending_faster_than_the_month_is_flagged():
    assert state(2600.0, 3000.0) == "ahead"


def test_passing_the_budget_is_over_regardless_of_pace():
    assert state(3200.0, 3000.0) == "over"


def test_rent_on_the_first_does_not_fire_the_warning_every_month():
    """A third of the budget against a tenth of the month is normal lumpiness.

    A badge that appears every month from a single large fixed payment is a
    badge the user stops reading, which costs more than it saves.
    """
    assert pace.status(1000.0, 3000.0, *AUG, date(2026, 8, 4))["state"] == "on_track"


def test_a_month_with_no_budget_has_nothing_to_be_off_track_against():
    """Saying 'on track' with no budget set would be a claim the data cannot
    support, so it is its own state rather than a default."""
    result = pace.status(5000.0, 0.0, *AUG, MID_AUG)
    assert result["state"] == "no_budget" and result["used"] == 0.0


def test_being_ahead_of_pace_always_means_the_projection_exceeds_the_budget():
    """Not a rule imposed, a rule observed.

    projected is spent / share, so projected > budget is exactly used > share.
    "Ahead" already requires used to beat share by a margin, so the two can
    never disagree — an earlier version tested the projection separately and
    that clause could not fail. This pins the relationship instead.
    """
    result = pace.status(2600.0, 3000.0, *AUG, MID_AUG)
    assert result["state"] == "ahead"
    assert result["projected"] > result["budget"]

    steady = pace.status(1500.0, 3000.0, *AUG, MID_AUG)
    assert steady["state"] == "on_track"
    assert steady["projected"] <= steady["budget"]


def test_status_reports_what_the_ui_needs_without_further_arithmetic():
    result = pace.status(1500.0, 3000.0, *AUG, MID_AUG)
    assert result["used"] == 50.0
    assert result["elapsed"] == pytest.approx(51.6, abs=0.1)
    assert result["days_left"] == 15
    assert result["projected"] == pytest.approx(2906.25, rel=1e-3)


def test_a_past_month_has_no_days_left_and_no_projection():
    result = pace.status(4200.0, 3000.0, 2026, 7, MID_AUG)
    assert result["days_left"] == 0 and result["projected"] is None
    assert result["state"] == "over", "a finished month can still be reported as over"


@pytest.mark.parametrize("budget", [-100.0, 0.0])
def test_a_missing_or_negative_budget_never_divides(budget):
    assert pace.status(500.0, budget, *AUG, MID_AUG)["state"] == "no_budget"


def test_a_moderate_mid_month_overshoot_stays_quiet_and_this_is_the_trade_off():
    """Pinned as a decision, not left as an accident.

    65% of the budget against 52% of the month projects to 7,556 on a 6,000
    budget — a real 26% overshoot that this model does not warn about, because
    the tolerance that keeps rent-on-the-1st quiet is still wide at mid-month.

    The root cause is that linear extrapolation cannot cope with fixed costs
    concentrated at the start of a month. Judging against the user's own
    history rather than a straight line would catch this; that needs several
    months of data and is deliberately not attempted here. The warning is
    tuned to fire when the month is clearly lost rather than when it is
    merely uneven, because a badge that fires on ordinary lumpiness is one
    the user learns to ignore.
    """
    result = pace.status(3900.0, 6000.0, *AUG, MID_AUG)
    assert result["state"] == "on_track"
    assert result["projected"] > result["budget"], "the overshoot is real and unreported"


def test_the_warning_does_fire_once_the_month_is_clearly_lost():
    result = pace.status(5200.0, 6000.0, *AUG, date(2026, 8, 20))
    assert result["state"] == "ahead"
    assert result["days_left"] == 11, "and there is still time to act on it"
