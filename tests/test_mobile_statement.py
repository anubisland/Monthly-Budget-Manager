"""Tests for reading a pasted bank statement.

A misread sign turns a withdrawal into income, so the sign conventions get
the most attention here.
"""

import pytest

from tests.mobile_app_modules import statement


def parse(text, month="2026-08"):
    return statement.parse(text, month)


# ── amounts, and the three ways a bank writes a negative ─────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("1500", 1500.0),
    ("1,500.00", 1500.0),
    ("-500", -500.0),
    ("(500)", -500.0),
    ("500 DR", -500.0),
    ("500DR", -500.0),
    ("500 CR", 500.0),
    ("+250.50", 250.5),
    ("$1,200.00", 1200.0),
    ("1 200,00", 1200.0),
    ("1200,00", 1200.0),
    ("1.200,00", 1200.0),
    ("1,20", 1.2),
    ("1.234.567,89", 1234567.89),
])
def test_amount_parsing_keeps_the_sign(raw, expected):
    assert statement.parse_amount(raw) == expected


def test_a_currency_symbol_does_not_defeat_the_parser():
    assert statement.parse_amount("\u062c.\u0645 3,000.00") == 3000.0


@pytest.mark.parametrize("raw", ["", "   ", None, "abc", "N/A", "--"])
def test_an_unreadable_amount_is_none_not_zero(raw):
    """Zero would import a real row with no money in it."""
    assert statement.parse_amount(raw) is None


# ── column detection ─────────────────────────────────────────────────────────

def test_an_exact_header_beats_a_longer_one():
    headers = ["Date", "Amount in account currency", "Amount", "Description"]
    assert statement.find_column(headers, statement.AMOUNT_HEADERS) == 2


def test_headers_are_found_by_substring_and_case_insensitively():
    headers = ["Transaction Date", "NARRATIVE", "Value"]
    assert statement.find_column(headers, statement.DATE_HEADERS) == 0
    assert statement.find_column(headers, statement.NAME_HEADERS) == 1
    assert statement.find_column(headers, statement.AMOUNT_HEADERS) == 2


def test_arabic_headers_are_recognised():
    headers = ["\u0627\u0644\u062a\u0627\u0631\u064a\u062e", "\u0627\u0644\u0628\u064a\u0627\u0646", "\u0627\u0644\u0645\u0628\u0644\u063a"]
    assert statement.find_column(headers, statement.NAME_HEADERS) == 1
    assert statement.find_column(headers, statement.AMOUNT_HEADERS) == 2


# ── the two layouts, which disagree about sign ───────────────────────────────

SIGNED = """Date,Description,Amount
2026-08-03,Salary,8000
2026-08-05,Rent,-3000
2026-08-07,Groceries,-450.25
"""

DEBIT_CREDIT = """Date,Details,Debit,Credit
2026-08-03,Salary,,8000
2026-08-05,Rent,3000,
2026-08-07,Groceries,450.25,
"""


def test_a_single_amount_column_carries_the_sign():
    entries = parse(SIGNED)["entries"]
    assert [(e["name"], e["kind"], e["amount"]) for e in entries] == [
        ("Salary", "income", 8000.0),
        ("Rent", "expense", 3000.0),
        ("Groceries", "expense", 450.25),
    ]


def test_separate_debit_and_credit_columns_are_both_positive():
    """Reading this layout as the first turns every withdrawal into income."""
    entries = parse(DEBIT_CREDIT)["entries"]
    assert [(e["name"], e["kind"], e["amount"]) for e in entries] == [
        ("Salary", "income", 8000.0),
        ("Rent", "expense", 3000.0),
        ("Groceries", "expense", 450.25),
    ]


def test_the_two_layouts_agree():
    assert parse(SIGNED)["entries"] == parse(DEBIT_CREDIT)["entries"]


def test_a_european_decimal_comma_is_not_read_as_thousands():
    """The worst defect this module could carry, and it was there.

    validate.amount strips commas as grouping, so "1200,00" parsed as 120000
    and "1.200,00" as 1.2 — a hundred times the rent, and a thousandth of it.
    Both are plausible numbers, so nothing downstream would have questioned
    either one.
    """
    for text in ("1200,00", "1.200,00", "1,200.00", "1 200,00"):
        assert statement.parse_amount(text) == 1200.0, text
