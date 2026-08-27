"""
Tests for monthly_budget.storage — SQLite persistence layer.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from monthly_budget.core import BudgetMonth
from monthly_budget.storage import Storage


@pytest.fixture
def storage():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        s = Storage(db_path)
        yield s
        s.close()


class TestStorageInit:
    def test_creates_db_file(self, storage):
        assert storage.db_path.exists()

    def test_creates_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            nested = Path(tmpdir) / "sub" / "test.db"
            s = Storage(nested)
            assert nested.parent.exists()
            s.close()

    def test_default_path(self):
        s = Storage()
        assert s.db_dir == Path.home() / ".monthly_budget"
        assert s.db_path == Path.home() / ".monthly_budget" / "budgets.db"
        s.close()


class TestStorageBudget:
    def test_save_and_load_empty(self, storage):
        bm = BudgetMonth(month="2025-01")
        storage.save_budget(bm)
        loaded = storage.load_budget("2025-01")
        assert loaded is not None
        assert loaded.month == "2025-01"
        assert len(loaded.incomes) == 0
        assert len(loaded.expenses) == 0

    def test_save_and_load_with_data(self, storage):
        bm = BudgetMonth(month="2025-06")
        bm.add_income("Salary", 5000, "2025-06-01")
        bm.add_income("Freelance", 800, "2025-06-15")
        bm.add_expense("Rent", 1500, "Housing", "2025-06-01")
        bm.add_expense("Groceries", 400, "Food", "2025-06-05")
        storage.save_budget(bm)

        loaded = storage.load_budget("2025-06")
        assert loaded is not None
        assert loaded.month == "2025-06"
        assert len(loaded.incomes) == 2
        assert len(loaded.expenses) == 2
        assert loaded.incomes[0].name == "Salary"
        assert loaded.incomes[0].amount == 5000
        assert loaded.expenses[0].category == "Housing"
        assert loaded.total_income() == 5800
        assert loaded.total_expenses() == 1900

    def test_update_existing_budget(self, storage):
        bm = BudgetMonth(month="2025-03")
        bm.add_income("Job", 3000)
        storage.save_budget(bm)

        bm2 = BudgetMonth(month="2025-03")
        bm2.add_income("Job", 3500)
        bm2.add_expense("Food", 200, "Food")
        storage.save_budget(bm2)

        loaded = storage.load_budget("2025-03")
        assert loaded is not None
        assert len(loaded.incomes) == 1
        assert loaded.incomes[0].amount == 3500
        assert len(loaded.expenses) == 1

    def test_load_nonexistent_month(self, storage):
        loaded = storage.load_budget("2099-99")
        assert loaded is None

    def test_list_months(self, storage):
        for m in ["2025-01", "2025-02", "2025-03"]:
            storage.save_budget(BudgetMonth(month=m))
        months = storage.list_months()
        assert len(months) == 3
        assert months == ["2025-03", "2025-02", "2025-01"]

    def test_budget_exists(self, storage):
        assert not storage.budget_exists("2025-04")
        storage.save_budget(BudgetMonth(month="2025-04"))
        assert storage.budget_exists("2025-04")

    def test_delete_budget(self, storage):
        storage.save_budget(BudgetMonth(month="2025-05"))
        assert storage.budget_exists("2025-05")
        storage.delete_budget("2025-05")
        assert not storage.budget_exists("2025-05")

    def test_multiple_budgets_independent(self, storage):
        jan = BudgetMonth(month="2025-01")
        jan.add_income("Jan Income", 1000)
        storage.save_budget(jan)

        feb = BudgetMonth(month="2025-02")
        feb.add_income("Feb Income", 2000)
        storage.save_budget(feb)

        loaded_jan = storage.load_budget("2025-01")
        loaded_feb = storage.load_budget("2025-02")
        assert loaded_jan is not None
        assert loaded_feb is not None
        assert loaded_jan.incomes[0].amount == 1000
        assert loaded_feb.incomes[0].amount == 2000

    def test_date_preserved(self, storage):
        bm = BudgetMonth(month="2025-07")
        bm.add_income("Bonus", 1000, "2025-07-15")
        bm.add_expense("Bill", 50, "Utilities", "2025-07")
        storage.save_budget(bm)

        loaded = storage.load_budget("2025-07")
        assert loaded is not None
        assert loaded.incomes[0].date == "2025-07-15"
        assert loaded.expenses[0].date == "2025-07"


class TestStorageSettings:
    def test_save_and_load_setting(self, storage):
        storage.save_setting("language", "ar")
        assert storage.load_setting("language") == "ar"

    def test_overwrite_setting(self, storage):
        storage.save_setting("theme", "dark")
        storage.save_setting("theme", "light")
        assert storage.load_setting("theme") == "light"

    def test_load_nonexistent_setting(self, storage):
        assert storage.load_setting("nonexistent") is None

    def test_load_all_settings(self, storage):
        storage.save_setting("a", "1")
        storage.save_setting("b", "2")
        all_s = storage.load_all_settings()
        assert all_s == {"a": "1", "b": "2"}

    def test_settings_independent_from_budgets(self, storage):
        storage.save_setting("language", "en")
        storage.save_budget(BudgetMonth(month="2025-01"))
        assert storage.load_setting("language") == "en"


class TestStorageBudgetLimits:
    def test_save_and_load_limits(self, storage):
        bm = BudgetMonth(month="2025-09")
        bm.set_budget_limit("Food", 500)
        bm.set_budget_limit("Rent", 1500)
        storage.save_budget(bm)

        loaded = storage.load_budget("2025-09")
        assert loaded is not None
        assert loaded.budget_limits["Food"] == 500
        assert loaded.budget_limits["Rent"] == 1500

    def test_update_limits(self, storage):
        bm = BudgetMonth(month="2025-10")
        bm.set_budget_limit("Food", 300)
        storage.save_budget(bm)

        bm2 = BudgetMonth(month="2025-10")
        bm2.set_budget_limit("Food", 400)
        bm2.set_budget_limit("Transport", 200)
        storage.save_budget(bm2)

        loaded = storage.load_budget("2025-10")
        assert loaded is not None
        assert loaded.budget_limits["Food"] == 400
        assert loaded.budget_limits["Transport"] == 200

    def test_limits_survives_reconnect(self, storage):
        bm = BudgetMonth(month="2025-11")
        bm.set_budget_limit("Utilities", 300)
        storage.save_budget(bm)
        storage.close()

        s2 = Storage(storage.db_path)
        loaded = s2.load_budget("2025-11")
        assert loaded is not None
        assert loaded.budget_limits["Utilities"] == 300
        s2.close()


class TestStoragePersistence:
    def test_data_survives_reconnect(self, storage):
        storage.save_setting("lang", "ar")
        bm = BudgetMonth(month="2025-08")
        bm.add_income("Test", 100)
        storage.save_budget(bm)
        storage.close()

        s2 = Storage(storage.db_path)
        assert s2.load_setting("lang") == "ar"
        loaded = s2.load_budget("2025-08")
        assert loaded is not None
        assert loaded.incomes[0].amount == 100
        s2.close()


class TestStorageMultipleBudgets:
    def test_different_budget_names(self, storage):
        bm1 = BudgetMonth(month="2025-01")
        storage.save_budget(bm1, "Personal")
        bm2 = BudgetMonth(month="2025-01")
        storage.save_budget(bm2, "Business")

        # Same month, different budgets should coexist
        p = storage.load_budget("2025-01", "Personal")
        b = storage.load_budget("2025-01", "Business")
        assert p is not None
        assert b is not None

        # Months listed per budget
        assert storage.list_months("Personal") == ["2025-01"]
        assert storage.list_months("Business") == ["2025-01"]
        assert storage.list_months() == []  # "Default" has no months

    def test_list_budget_names(self, storage):
        storage.save_budget(BudgetMonth(month="2025-01"), "Personal")
        storage.save_budget(BudgetMonth(month="2025-02"), "Personal")
        storage.save_budget(BudgetMonth(month="2025-01"), "Business")
        names = storage.list_budget_names()
        assert "Personal" in names
        assert "Business" in names

    def test_delete_budget_by_name(self, storage):
        storage.save_budget(BudgetMonth(month="2025-01"), "Personal")
        assert storage.budget_exists("2025-01", "Personal")
        storage.delete_budget("2025-01", "Personal")
        assert not storage.budget_exists("2025-01", "Personal")


class TestStorageRecurring:
    def test_save_and_load_recurring(self, storage):
        from monthly_budget.core import RecurringTransaction
        rt = RecurringTransaction(
            category="Rent", description="Monthly Rent", amount=1500,
            frequency="monthly", day=1, start_date="2025-01",
        )
        rt_id = storage.save_recurring(rt)
        assert rt_id > 0

        loaded = storage.load_recurring(rt_id)
        assert loaded is not None
        assert loaded.category == "Rent"
        assert loaded.description == "Monthly Rent"
        assert loaded.amount == 1500
        assert loaded.frequency == "monthly"
        assert loaded.day == 1
        assert loaded.start_date == "2025-01"
        assert loaded.end_date is None
        assert loaded.active is True

    def test_update_recurring(self, storage):
        from monthly_budget.core import RecurringTransaction
        rt = RecurringTransaction(
            category="Food", description="Lunch", amount=50,
            frequency="weekly", day=0, start_date="2025-01",
        )
        rt_id = storage.save_recurring(rt)

        rt2 = RecurringTransaction(
            id=rt_id, category="Food", description="Lunch Updated", amount=60,
            frequency="weekly", day=0, start_date="2025-01",
        )
        storage.save_recurring(rt2)

        loaded = storage.load_recurring(rt_id)
        assert loaded is not None
        assert loaded.description == "Lunch Updated"
        assert loaded.amount == 60

    def test_list_recurring(self, storage):
        from monthly_budget.core import RecurringTransaction
        for i in range(3):
            storage.save_recurring(RecurringTransaction(
                category="Test", description=f"Item {i}", amount=10 * (i + 1),
                frequency="monthly", day=1, start_date="2025-01",
            ))
        items = storage.list_recurring()
        assert len(items) == 3

    def test_delete_recurring(self, storage):
        from monthly_budget.core import RecurringTransaction
        rt = RecurringTransaction(
            category="Test", description="Delete Me", amount=100,
            frequency="monthly", day=1, start_date="2025-01",
        )
        rt_id = storage.save_recurring(rt)
        assert storage.load_recurring(rt_id) is not None
        storage.delete_recurring(rt_id)
        assert storage.load_recurring(rt_id) is None


class TestStorageTransactionRules:
    def test_save_and_list_rules(self, storage):
        from monthly_budget.core import TransactionRule
        storage.save_rule(TransactionRule(pattern="netflix", category="Subscriptions"))
        storage.save_rule(TransactionRule(pattern="walmart", category="Food"))
        rules = storage.list_rules()
        assert len(rules) == 2

    def test_delete_rule(self, storage):
        from monthly_budget.core import TransactionRule
        storage.save_rule(TransactionRule(pattern="test", category="Misc"))
        assert len(storage.list_rules()) == 1
        rules = storage.list_rules()
        storage.delete_rule(rules[0].id)
        assert len(storage.list_rules()) == 0

    def test_update_rule(self, storage):
        from monthly_budget.core import TransactionRule
        rt = TransactionRule(pattern="old", category="Misc")
        storage.save_rule(rt)
        rt.pattern = "new"
        rt.category = "Food"
        storage.save_rule(rt)
        loaded = storage.load_rule(rt.id)
        assert loaded is not None
        assert loaded.pattern == "new"
        assert loaded.category == "Food"
