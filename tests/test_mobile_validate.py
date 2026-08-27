"""Tests for the shared untrusted-input validators.

These guard both the stored file and the local HTTP API, so a gap here is a
gap in two places at once.
"""

import pytest

from tests.mobile_app_modules import validate

# ── amounts ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    (1500, 1500.0),
    (1500.5, 1500.5),
    ("1500", 1500.0),
    ("1,500.00", 1500.0),
    ("  250.75  ", 250.75),
    ("٬1000", 1000.0),  # a stray leading separator is harmless
])
def test_amount_parsing(raw, expected):
    assert validate.amount(raw) == expected


def test_a_formatted_amount_is_parsed_not_zeroed():
    """float('1,500.00') raises; the naive fallback files a rent as zero."""
    assert validate.amount("1,500.00") == 1500.0


def test_an_arabic_thousands_separator_is_understood():
    assert validate.amount("1\u066c500.00") == 1500.0


def test_true_is_not_an_amount():
    """isinstance(True, int) is true in Python, so True would file as 1.00."""
    assert validate.amount(True) is None
    assert validate.amount(False) is None


def test_nan_is_rejected():
    """NaN poisons every total it reaches and raises nowhere."""
    assert validate.amount(float("nan")) is None


@pytest.mark.parametrize("raw", [float("inf"), float("-inf"), 1e13, "1e400"])
def test_unbounded_amounts_are_rejected(raw):
    assert validate.amount(raw) is None


@pytest.mark.parametrize("raw", [-1, -0.01, "-500"])
def test_negative_amounts_are_rejected(raw):
    assert validate.amount(raw) is None


def test_zero_is_rejected_unless_explicitly_allowed():
    assert validate.amount(0) is None
    assert validate.amount(0, allow_zero=True) == 0.0


@pytest.mark.parametrize("raw", [None, "", "abc", [], {}, "12abc"])
def test_unparseable_amounts_are_rejected(raw):
    assert validate.amount(raw) is None


def test_amounts_never_carry_more_precision_than_the_currency():
    assert validate.amount(1500.567) == 1500.57
    assert validate.amount(1500.001) == 1500.0


def test_half_way_amounts_round_by_their_float_not_by_a_rule():
    """Pinned deliberately rather than asserted as a rule.

    Neither value is a true half: 10.005 is stored slightly above and rounds
    up, 2.675 slightly below and rounds down. Any test claiming a consistent
    direction here would be asserting something Python does not do.
    """
    assert validate.amount(10.005) == 10.01
    assert validate.amount(2.675) == 2.67


# ── indices: the negative-index deletion bug ─────────────────────────────────

def test_a_valid_index_is_accepted():
    assert validate.index(2, 5) == 2
    assert validate.index(0, 1) == 0


def test_a_negative_index_is_refused_not_wrapped():
    """pop(-1) removes the LAST row, deleting something never asked for."""
    assert validate.index(-1, 5) is None
    assert validate.index(-100, 5) is None


def test_an_index_past_the_end_is_refused():
    assert validate.index(5, 5) is None
    assert validate.index(1, 0) is None


@pytest.mark.parametrize("raw", [True, 1.0, "1", None, [], "abc"])
def test_a_non_integer_index_is_refused(raw):
    assert validate.index(raw, 5) is None


# ── text ─────────────────────────────────────────────────────────────────────

def test_text_is_trimmed():
    assert validate.text("  Salary  ") == "Salary"


def test_arabic_text_survives():
    assert validate.text("راتب الشهر") == "راتب الشهر"


def test_newlines_are_collapsed_because_the_ui_renders_one_line():
    assert validate.text("Salary\nand\tbonus") == "Salary and bonus"


@pytest.mark.parametrize("raw", ["", "   ", "\n\t", None, 5, []])
def test_empty_or_non_string_text_is_refused(raw):
    assert validate.text(raw) is None


def test_text_is_length_capped():
    assert len(validate.text("x" * 5000)) == 120


# ── dates ────────────────────────────────────────────────────────────────────

def test_a_well_formed_date_is_accepted():
    assert validate.date_text("2026-08-27") == "2026-08-27"


@pytest.mark.parametrize("raw", [
    "2026-8-27", "26-08-27", "2026-13-01", "2026-00-01", "2026-08-32",
    "2026-08-00", "2026/08/27", "not-a-date", "", None, 20260827,
])
def test_a_malformed_date_is_refused(raw):
    assert validate.date_text(raw) is None
