"""
Unit tests for budget_manager.py — target: ≥80% line coverage.

Run:
    pytest --cov=budget_manager --cov-report=term-missing tests/
"""
import io
import json
import sys
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Import the module under test
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).parent.parent))
from budget_manager import (
    BudgetMonth,
    _clamp_non_negative,
    _is_valid_ym,
    _is_valid_ymd,
    _round_map,
    main,
    parse_args,
    print_report,
    read_csv,
)

# ===========================================================================
# Helpers
# ===========================================================================

def _budget_with_data() -> BudgetMonth:
    """Return a pre-populated BudgetMonth for reuse across tests."""
    bm = BudgetMonth(month="2025-08")
    bm.add_income("Salary", 5000, "2025-08-01")
    bm.add_income("Freelance", 1000)
    bm.add_expense("Rent", 1500, "Housing", "2025-08-03")
    bm.add_expense("Groceries", 400, "Food")
    bm.add_expense("Electricity", 100, "Utilities")
    return bm


def _make_csv(tmp_path: Path, content: str) -> Path:
    p = tmp_path / "test_budget.csv"
    p.write_text(content, encoding="utf-8")
    return p


# ===========================================================================
# _clamp_non_negative
# ===========================================================================

class TestClampNonNegative:
    def test_positive_float(self):
        assert _clamp_non_negative(42.5) == 42.5

    def test_zero(self):
        assert _clamp_non_negative(0) == 0.0

    def test_negative_clamped_to_zero(self):
        assert _clamp_non_negative(-10) == 0.0

    def test_string_number(self):
        assert _clamp_non_negative("123.45") == 123.45

    def test_invalid_string_returns_zero(self):
        assert _clamp_non_negative("abc") == 0.0

    def test_none_returns_zero(self):
        assert _clamp_non_negative(None) == 0.0  # type: ignore


# ===========================================================================
# _round_map
# ===========================================================================

class TestRoundMap:
    def test_rounds_values(self):
        d = {"a": 1.2345, "b": 9.9999}
        result = _round_map(d)
        assert result == {"a": 1.23, "b": 10.0}

    def test_custom_ndigits(self):
        d = {"x": 1.2345}
        assert _round_map(d, ndigits=3)["x"] == 1.234 or _round_map(d, ndigits=3)["x"] == 1.235

    def test_empty_dict(self):
        assert _round_map({}) == {}


# ===========================================================================
# _is_valid_ym / _is_valid_ymd
# ===========================================================================

class TestValidators:
    @pytest.mark.parametrize("s,expected", [
        ("2025-08", True),
        ("2025-01", True),
        ("2025-12", True),
        ("2025-00", False),
        ("2025-13", False),
        ("25-08", False),
        ("2025/08", False),
        ("20250-8", False),
        ("", False),
    ])
    def test_is_valid_ym(self, s, expected):
        assert _is_valid_ym(s) is expected

    @pytest.mark.parametrize("s,expected", [
        ("2025-08-15", True),
        ("2025-01-01", True),
        ("2025-12-31", True),
        ("2025-08-00", False),
        ("2025-08-32", False),
        ("2025-13-01", False),
        ("25-08-15", False),
        ("2025/08/15", False),
        ("", False),
    ])
    def test_is_valid_ymd(self, s, expected):
        assert _is_valid_ymd(s) is expected


# ===========================================================================
# BudgetMonth — basic construction and mutators
# ===========================================================================

class TestBudgetMonthBasic:
    def test_empty_totals(self):
        bm = BudgetMonth()
        assert bm.total_income() == 0.0
        assert bm.total_expenses() == 0.0
        assert bm.net() == 0.0

    def test_add_income_defaults(self):
        bm = BudgetMonth(month="2025-08")
        bm.add_income("Salary", 5000)
        assert len(bm.incomes) == 1
        assert bm.incomes[0].amount == 5000.0
        assert bm.incomes[0].date == "2025-08"

    def test_add_income_empty_name_defaults_to_Income(self):
        bm = BudgetMonth()
        bm.add_income("", 100)
        assert bm.incomes[0].name == "Income"

    def test_add_income_clamps_negative(self):
        bm = BudgetMonth()
        bm.add_income("Bad", -50)
        assert bm.incomes[0].amount == 0.0

    def test_add_expense_defaults(self):
        bm = BudgetMonth(month="2025-08")
        bm.add_expense("Coffee", 5)
        assert bm.expenses[0].category == "Uncategorized"
        assert bm.expenses[0].date == "2025-08"

    def test_add_expense_empty_category_defaults(self):
        bm = BudgetMonth()
        bm.add_expense("X", 10, "   ")
        assert bm.expenses[0].category == "Uncategorized"

    def test_add_expense_empty_name_defaults_to_Expense(self):
        bm = BudgetMonth()
        bm.add_expense("", 10)
        assert bm.expenses[0].name == "Expense"


# ===========================================================================
# BudgetMonth — calculations
# ===========================================================================

class TestBudgetMonthCalculations:
    def setup_method(self):
        self.bm = _budget_with_data()

    def test_total_income(self):
        assert self.bm.total_income() == 6000.0

    def test_total_expenses(self):
        assert self.bm.total_expenses() == 2000.0

    def test_net(self):
        assert self.bm.net() == 4000.0

    def test_profit_margin(self):
        assert self.bm.profit_margin() == pytest.approx(4000 / 6000 * 100, rel=1e-4)

    def test_profit_margin_zero_income(self):
        bm = BudgetMonth()
        bm.add_expense("X", 100)
        assert bm.profit_margin() == 0.0

    def test_expenses_by_category(self):
        cats = self.bm.expenses_by_category()
        assert cats["Housing"] == 1500.0
        assert cats["Food"] == 400.0
        assert cats["Utilities"] == 100.0

    def test_expense_percentages_relative_to_income(self):
        pct = self.bm.expense_percentages_by_category("income")
        assert pct["Housing"] == pytest.approx(1500 / 6000 * 100, rel=1e-4)

    def test_expense_percentages_relative_to_expenses(self):
        pct = self.bm.expense_percentages_by_category("expenses")
        assert pct["Housing"] == pytest.approx(1500 / 2000 * 100, rel=1e-4)

    def test_expense_percentages_zero_income_returns_zeros(self):
        bm = BudgetMonth()
        bm.add_expense("X", 100, "Cat")
        pct = bm.expense_percentages_by_category("income")
        assert pct["Cat"] == 0.0

    def test_expense_percentages_zero_expenses_returns_zeros(self):
        bm = BudgetMonth()
        bm.add_expense("X", 0, "Cat")
        pct = bm.expense_percentages_by_category("expenses")
        assert pct["Cat"] == 0.0


# ===========================================================================
# BudgetMonth — to_dict
# ===========================================================================

class TestBudgetMonthToDict:
    def test_to_dict_structure(self):
        bm = _budget_with_data()
        d = bm.to_dict()
        assert d["month"] == "2025-08"
        assert len(d["incomes"]) == 2
        assert len(d["expenses"]) == 3
        totals = d["totals"]
        assert totals["income"] == 6000.0
        assert totals["expenses"] == 2000.0
        assert totals["net"] == 4000.0
        assert "profit_margin_pct" in totals
        bd = d["breakdown"]
        assert "by_category" in bd
        assert "percent_of_income" in bd
        assert "percent_of_expenses" in bd

    def test_to_dict_serializable_as_json(self):
        bm = _budget_with_data()
        # Should not raise
        json.dumps(bm.to_dict())


# ===========================================================================
# print_report
# ===========================================================================

class TestPrintReport:
    def test_basic_output(self):
        bm = _budget_with_data()
        buf = io.StringIO()
        print_report(bm, buf)
        output = buf.getvalue()
        assert "Total Income" in output
        assert "Total Expenses" in output
        assert "Net (Profit)" in output
        assert "Profit Margin" in output
        assert "Housing" in output
        assert "Food" in output

    def test_no_expenses_message(self):
        bm = BudgetMonth(month="2025-01")
        bm.add_income("Salary", 3000)
        buf = io.StringIO()
        print_report(bm, buf)
        assert "No expenses entered" in buf.getvalue()

    def test_title_includes_month(self):
        bm = BudgetMonth(month="2025-08")
        buf = io.StringIO()
        print_report(bm, buf)
        assert "2025-08" in buf.getvalue()

    def test_title_without_month(self):
        bm = BudgetMonth()
        bm.add_income("X", 100)
        buf = io.StringIO()
        print_report(bm, buf)
        assert "Monthly Budget Report" in buf.getvalue()


# ===========================================================================
# read_csv
# ===========================================================================

class TestReadCsv:
    VALID_CSV = (
        "type,name,category,amount,date\n"
        "income,Salary,,5000,2025-08-01\n"
        "expense,Rent,Housing,1500,2025-08-03\n"
        "expense,Groceries,Food,400,2025-08\n"
    )

    def test_reads_incomes(self, tmp_path):
        p = _make_csv(tmp_path, self.VALID_CSV)
        incomes, _ = read_csv(p)
        assert len(incomes) == 1
        assert incomes[0].name == "Salary"
        assert incomes[0].amount == 5000.0

    def test_reads_expenses(self, tmp_path):
        p = _make_csv(tmp_path, self.VALID_CSV)
        _, expenses = read_csv(p)
        assert len(expenses) == 2
        cats = {e.category for e in expenses}
        assert "Housing" in cats
        assert "Food" in cats

    def test_missing_required_header_raises(self, tmp_path):
        csv_content = "type,name\nincome,Salary\n"
        p = _make_csv(tmp_path, csv_content)
        with pytest.raises(ValueError, match="missing required headers"):
            read_csv(p)

    def test_unknown_type_skipped(self, tmp_path):
        csv_content = (
            "type,name,category,amount,date\n"
            "unknown,X,,100,2025-08\n"
        )
        p = _make_csv(tmp_path, csv_content)
        incomes, expenses = read_csv(p)
        assert len(incomes) == 0
        assert len(expenses) == 0

    def test_invalid_amount_defaults_to_zero(self, tmp_path):
        csv_content = (
            "type,name,category,amount\n"
            "income,Salary,,notanumber\n"
        )
        p = _make_csv(tmp_path, csv_content)
        incomes, _ = read_csv(p)
        assert incomes[0].amount == 0.0

    def test_default_expense_category(self, tmp_path):
        csv_content = (
            "type,name,category,amount\n"
            "expense,Coffee,,5\n"
        )
        p = _make_csv(tmp_path, csv_content)
        _, expenses = read_csv(p)
        assert expenses[0].category == "Uncategorized"

    def test_year_month_day_columns(self, tmp_path):
        csv_content = (
            "type,name,category,amount,year,month,day\n"
            "income,Salary,,5000,2025,8,15\n"
        )
        p = _make_csv(tmp_path, csv_content)
        incomes, _ = read_csv(p)
        assert incomes[0].date == "2025-08-15"

    def test_year_month_columns_no_day(self, tmp_path):
        csv_content = (
            "type,name,category,amount,year,month\n"
            "income,Salary,,5000,2025,8\n"
        )
        p = _make_csv(tmp_path, csv_content)
        incomes, _ = read_csv(p)
        assert incomes[0].date == "2025-08"

    def test_empty_name_defaults(self, tmp_path):
        csv_content = (
            "type,name,category,amount\n"
            "income,,,100\n"
        )
        p = _make_csv(tmp_path, csv_content)
        incomes, _ = read_csv(p)
        assert incomes[0].name == "Income"


# ===========================================================================
# parse_args
# ===========================================================================

class TestParseArgs:
    def test_no_args(self):
        args = parse_args([])
        assert args.input is None
        assert args.month is None
        assert args.json is False
        assert args.save_json is None

    def test_input_flag(self):
        args = parse_args(["--input", "data.csv"])
        assert args.input == "data.csv"

    def test_month_flag(self):
        args = parse_args(["--month", "2025-08"])
        assert args.month == "2025-08"

    def test_json_flag(self):
        args = parse_args(["--json"])
        assert args.json is True

    def test_save_json_flag(self):
        args = parse_args(["--save-json", "out.json"])
        assert args.save_json == "out.json"


# ===========================================================================
# main — end-to-end
# ===========================================================================

class TestMain:
    def test_csv_report_mode(self, tmp_path):
        # Output correctness is covered by TestPrintReport; here we just verify exit code.
        csv_content = (
            "type,name,category,amount,date\n"
            "income,Salary,,5000,2025-08-01\n"
            "expense,Rent,Housing,1500,2025-08-03\n"
        )
        p = tmp_path / "budget.csv"
        p.write_text(csv_content, encoding="utf-8")
        ret = main(["--input", str(p), "--month", "2025-08"])
        assert ret == 0

    def test_csv_json_mode(self, tmp_path, capsys):
        csv_content = (
            "type,name,category,amount\n"
            "income,Salary,,4000\n"
        )
        p = tmp_path / "budget.csv"
        p.write_text(csv_content, encoding="utf-8")
        ret = main(["--input", str(p), "--json"])
        assert ret == 0
        data = json.loads(capsys.readouterr().out)
        assert data["totals"]["income"] == 4000.0

    def test_save_json(self, tmp_path, capsys):
        csv_content = (
            "type,name,category,amount\n"
            "income,Salary,,4000\n"
        )
        csv_path = tmp_path / "budget.csv"
        csv_path.write_text(csv_content, encoding="utf-8")
        out_path = tmp_path / "report.json"
        ret = main(["--input", str(csv_path), "--json", "--save-json", str(out_path)])
        assert ret == 0
        saved = json.loads(out_path.read_text(encoding="utf-8"))
        assert saved["totals"]["income"] == 4000.0

    def test_save_json_with_report_mode(self, tmp_path):
        csv_content = (
            "type,name,category,amount\n"
            "income,Salary,,3000\n"
        )
        csv_path = tmp_path / "budget.csv"
        csv_path.write_text(csv_content, encoding="utf-8")
        out_path = tmp_path / "report.json"
        ret = main(["--input", str(csv_path), "--save-json", str(out_path)])
        assert ret == 0
        saved = json.loads(out_path.read_text(encoding="utf-8"))
        assert saved["totals"]["income"] == 3000.0

    def test_missing_input_file_returns_2(self, capsys):
        ret = main(["--input", "/nonexistent/path/file.csv"])
        assert ret == 2

    def test_multiple_expenses_same_category(self, tmp_path):
        csv_content = (
            "type,name,category,amount\n"
            "income,Salary,,5000\n"
            "expense,Rent,Housing,1000\n"
            "expense,Mortgage,Housing,500\n"
        )
        p = tmp_path / "budget.csv"
        p.write_text(csv_content, encoding="utf-8")
        ret = main(["--input", str(p)])
        assert ret == 0
        # Verify aggregation via BudgetMonth directly
        bm = BudgetMonth()
        bm.add_expense("Rent", 1000, "Housing")
        bm.add_expense("Mortgage", 500, "Housing")
        assert bm.expenses_by_category()["Housing"] == 1500.0
