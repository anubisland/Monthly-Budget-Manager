"""Tests for the mobile app's month-keyed data model.

Loaded by path because ``budget_manager_mobile/__init__.py`` imports toga.
"""

import json
from datetime import date

import pytest

from tests.mobile_app_modules import BudgetData, Goal, budget_data, store  # noqa: F401

AUGUST = date(2026, 8, 27)


@pytest.fixture
def data(tmp_path):
    return BudgetData(tmp_path / "data.json", today=AUGUST)


# ── the month in view ────────────────────────────────────────────────────────

def test_opens_on_the_current_month(data):
    assert data.current == "2026-08"


def test_navigating_away_does_not_lose_the_month_you_left(data):
    data.month.add_income("Salary", 8000.0, "2026-08-01")
    data.go_to("2026-07")
    data.month.add_income("Bonus", 500.0, "2026-07-15")

    assert data.months["2026-08"].total_income() == 8000.0
    assert data.months["2026-07"].total_income() == 500.0


def test_each_month_totals_only_its_own_entries(data):
    data.month.add_expense("Rent", 3000.0, "Rent", "2026-08-01")
    data.go_to("2026-07")
    data.month.add_expense("Rent", 2500.0, "Rent", "2026-07-01")

    assert data.months["2026-08"].total_expenses() == 3000.0
    assert data.months["2026-07"].total_expenses() == 2500.0


def test_a_future_month_is_refused(data):
    assert data.go_to("2026-09") is False
    assert data.current == "2026-08"


def test_going_forward_is_blocked_at_the_present(data):
    assert data.can_go_forward() is False
    data.go_to("2026-07")
    assert data.can_go_forward() is True


def test_a_malformed_month_is_refused(data):
    assert data.go_to("garbage") is False
    assert data.current == "2026-08"


def test_back_is_offered_only_when_an_earlier_month_holds_data(data):
    assert data.can_go_back() is False
    data.go_to("2026-07")
    data.month.add_income("Bonus", 1.0, "2026-07-01")
    data.go_to("2026-08")
    assert data.can_go_back() is True


def test_an_empty_month_you_merely_visited_is_not_offered_as_history(data):
    data.go_to("2026-07")   # visited, nothing entered
    data.go_to("2026-08")
    assert data.can_go_back() is False, "an empty month is not history"


# ── surviving a restart ──────────────────────────────────────────────────────

def test_data_survives_a_restart(tmp_path):
    path = tmp_path / "data.json"
    first = BudgetData(path, today=AUGUST)
    first.month.add_income("راتب", 8000.0, "2026-08-01")
    first.month.add_expense("إيجار", 3000.0, "Rent", "2026-08-02")
    first.goals.append(Goal(name="سيارة", target=50000.0, current=1200.0))
    first.save()

    second = BudgetData(path, today=AUGUST)
    second.load()

    assert second.month.total_income() == 8000.0
    assert second.month.total_expenses() == 3000.0
    assert second.goals[0].name == "سيارة" and second.goals[0].current == 1200.0


def test_every_month_survives_a_restart_not_just_the_current_one(tmp_path):
    path = tmp_path / "data.json"
    first = BudgetData(path, today=AUGUST)
    first.month.add_income("Aug", 8000.0, "2026-08-01")
    first.go_to("2026-07")
    first.month.add_income("Jul", 7000.0, "2026-07-01")
    first.go_to("2026-06")
    first.month.add_income("Jun", 6000.0, "2026-06-01")
    first.save()

    second = BudgetData(path, today=AUGUST)
    second.load()

    assert second.known_months() == ["2026-06", "2026-07", "2026-08"]
    assert second.months["2026-06"].total_income() == 6000.0


def test_the_month_you_were_viewing_is_remembered(tmp_path):
    path = tmp_path / "data.json"
    first = BudgetData(path, today=AUGUST)
    first.go_to("2026-07")
    first.month.add_income("Jul", 7000.0, "2026-07-01")
    first.save()

    second = BudgetData(path, today=AUGUST)
    second.load()
    assert second.current == "2026-07"


def test_a_first_run_is_not_an_error(tmp_path):
    data = BudgetData(tmp_path / "absent.json", today=AUGUST)
    data.load()
    assert data.note is None and data.months == {} and data.current == "2026-08"


def test_a_stored_month_in_the_future_is_pulled_back_to_the_present(tmp_path):
    """A device whose clock was wrong, or a file copied from a later month."""
    path = tmp_path / "data.json"
    path.write_text(json.dumps({
        "version": 2, "current": "2027-05", "months": {}, "goals": [],
    }), "utf-8")

    data = BudgetData(path, today=AUGUST)
    data.load()
    assert data.current == "2026-08"


# ── the upgrade path off the user's existing file ────────────────────────────

V1_FILE = {
    "year": 2026, "month": 7,
    "budget": {
        "month": None,
        "incomes": [{"name": "راتب", "amount": 8000.0, "date": "2026-07-17"}],
        "expenses": [{"name": "إيجار", "amount": 3800.0, "category": "Rent", "date": "2026-07-05"}],
        "total_budget": 5000.0,
    },
    "goals": [{"name": "سيارة", "target": 50000.0, "current": 0.0, "icon": "🚗", "target_month": ""}],
}


def _write_v1(tmp_path):
    path = tmp_path / "data.json"
    path.write_text(json.dumps(V1_FILE, ensure_ascii=False), "utf-8")
    return path


def test_an_existing_flat_file_becomes_the_month_it_claimed(tmp_path):
    data = BudgetData(_write_v1(tmp_path), today=AUGUST)
    data.load()

    assert data.note == "migrated-v1"
    assert data.months["2026-07"].total_income() == 8000.0
    assert data.months["2026-07"].total_expenses() == 3800.0


def test_migration_keeps_the_budget_ceiling_and_the_goals(tmp_path):
    data = BudgetData(_write_v1(tmp_path), today=AUGUST)
    data.load()

    assert data.months["2026-07"].total_budget == 5000.0
    assert data.goals[0].name == "سيارة" and data.goals[0].target == 50000.0


def test_migration_leaves_a_verbatim_backup_before_writing(tmp_path):
    path = _write_v1(tmp_path)
    data = BudgetData(path, today=AUGUST)
    data.load()
    data.save()

    kept = json.loads((tmp_path / "data.backup.json").read_text("utf-8"))
    assert kept == V1_FILE, "the pre-migration bytes must survive the first save"


def test_a_corrupt_file_is_moved_aside_and_not_overwritten(tmp_path):
    path = tmp_path / "data.json"
    path.write_text("{ this is not json", "utf-8")

    data = BudgetData(path, today=AUGUST)
    data.load()
    data.save()

    assert data.note == "corrupt"
    assert (tmp_path / "data.corrupt.json").read_text("utf-8") == "{ this is not json"


def test_a_file_from_a_newer_build_is_preserved_not_destroyed(tmp_path):
    """The defect that mattered most: a future format loading as 'no data'.

    Left unflagged, the next save overwrites a file this build cannot read but
    a later one can.
    """
    path = tmp_path / "data.json"
    future = json.dumps({"version": 99, "months": {"2026-08": {"incomes": []}}})
    path.write_text(future, "utf-8")

    data = BudgetData(path, today=AUGUST)
    data.load()
    data.save()

    assert data.note == "future-version"
    assert (tmp_path / "data.corrupt.json").read_text("utf-8") == future


# ── rejecting elements that would poison the arithmetic ──────────────────────

def _load_goals(tmp_path, goals):
    path = tmp_path / "data.json"
    path.write_text(json.dumps({
        "version": 2, "current": "2026-08", "months": {}, "goals": goals,
    }), "utf-8")
    data = BudgetData(path, today=AUGUST)
    data.load()
    return data.goals


@pytest.mark.parametrize("bad", [
    {"name": "", "target": 100.0},
    {"name": None, "target": 100.0},
    {"target": 100.0},
    {"name": "Car"},
    {"name": "Car", "target": "abc"},
    {"name": "Car", "target": None},
])
def test_an_unusable_goal_is_dropped(tmp_path, bad):
    assert _load_goals(tmp_path, [bad]) == []


def test_a_formatted_target_is_parsed_not_zeroed(tmp_path):
    """float('50,000.00') raises; the old code's Number() equivalent gave 0."""
    goals = _load_goals(tmp_path, [{"name": "Car", "target": "50,000.00"}])
    assert goals[0].target == 50000.0


def test_a_boolean_is_not_accepted_as_an_amount(tmp_path):
    assert _load_goals(tmp_path, [{"name": "Car", "target": True}]) == []


def test_one_bad_goal_does_not_take_the_good_ones_with_it(tmp_path):
    goals = _load_goals(tmp_path, [{"name": "Car", "target": 100.0}, None, {"name": "", "target": 5.0}])
    assert [g.name for g in goals] == ["Car"]


# ── the Goal model ───────────────────────────────────────────────────────────

def test_progress_is_a_clamped_fraction():
    assert Goal("Car", 1000.0, 250.0).progress() == 0.25
    assert Goal("Car", 1000.0, 5000.0).progress() == 1.0, "overshoot must not exceed 100%"


def test_a_goal_is_done_when_it_reaches_its_target():
    assert Goal("Car", 1000.0, 1000.0).done() is True
    assert Goal("Car", 1000.0, 999.99).done() is False


def test_a_zero_target_goal_is_not_reported_as_an_achievement():
    """Division by zero has to resolve somewhere; 'done' would be a false win."""
    assert Goal("Car", 0.0, 0.0).done() is False


def test_remaining_never_goes_negative():
    assert Goal("Car", 1000.0, 1500.0).remaining() == 0.0


# ── one bad row must not take its month with it ──────────────────────────────
# Both reviewers found this independently: from_dict builds every row in one
# comprehension, so a single malformed row raised, the whole month was replaced
# with an empty one, nothing was recorded, and the next save dropped the now
# blank month from the document. A user's July vanished over one typo.

def _write_v2(tmp_path, months, goals=None):
    path = tmp_path / "data.json"
    path.write_text(json.dumps({
        "version": 2, "current": "2026-08", "months": months, "goals": goals or [],
    }, ensure_ascii=False), "utf-8")
    return path


GOOD_JULY = {
    "incomes": [{"name": "Salary", "amount": 5000.0, "date": "2026-07-01"},
                {"name": "Bonus", "amount": 900.0, "date": "2026-07-20"}],
    "expenses": [{"name": "Rent", "amount": 1800.0, "category": "Rent", "date": "2026-07-05"}],
    "total_budget": 3000.0,
}


def test_a_row_missing_its_amount_does_not_empty_the_month(tmp_path):
    july = {**GOOD_JULY, "expenses": GOOD_JULY["expenses"] + [{"name": "Rent", "category": "Rent"}]}
    data = BudgetData(_write_v2(tmp_path, {"2026-07": july}), today=AUGUST)
    data.load()

    assert data.months["2026-07"].total_income() == 5900.0
    assert data.months["2026-07"].total_expenses() == 1800.0
    assert data.months["2026-07"].total_budget == 3000.0
    assert data.dropped == 1


def test_a_row_with_an_unexpected_key_does_not_empty_the_month(tmp_path):
    """Income(**row) raises TypeError on a key it does not take."""
    july = {**GOOD_JULY, "incomes": [{"name": "Salary", "amount": 5000.0, "note": "extra"}]}
    data = BudgetData(_write_v2(tmp_path, {"2026-07": july}), today=AUGUST)
    data.load()

    assert data.months["2026-07"].total_income() == 5000.0, "the row survives; the stray key is ignored"
    assert data.months["2026-07"].total_expenses() == 1800.0


def test_a_damaged_month_is_never_erased_by_the_next_save(tmp_path):
    july = {**GOOD_JULY, "expenses": [{"name": "Rent"}]}
    path = _write_v2(tmp_path, {"2026-06": {"incomes": [{"name": "Jun", "amount": 10.0}]},
                                "2026-07": july})
    data = BudgetData(path, today=AUGUST)
    data.load()
    data.save()

    on_disk = json.loads(path.read_text("utf-8"))
    assert sorted(on_disk["months"]) == ["2026-06", "2026-07"], "July must still be there"
    assert on_disk["months"]["2026-07"]["incomes"][0]["amount"] == 5000.0


def test_dropping_a_row_is_reported_and_the_original_kept(tmp_path):
    path = _write_v2(tmp_path, {"2026-07": {**GOOD_JULY, "expenses": [{"name": "Rent"}]}})
    original = path.read_text("utf-8")
    data = BudgetData(path, today=AUGUST)
    data.load()
    assert data.dropped == 1, "the count is reported on load, and cleared by the save"

    data.save()
    assert (tmp_path / "data.backup.json").read_text("utf-8") == original


@pytest.mark.parametrize("bad", [None, "text", 42, {"a": 1}])
def test_a_non_list_rows_container_is_reported_not_silently_empty(tmp_path, bad):
    data = BudgetData(_write_v2(tmp_path, {"2026-07": {**GOOD_JULY, "incomes": bad}}), today=AUGUST)
    data.load()
    assert data.months["2026-07"].total_expenses() == 1800.0, "expenses survive"
    assert data.dropped >= 1


# ── a byte-level corruption must not stop the app from starting ──────────────

def test_a_file_that_is_not_valid_utf8_is_quarantined_not_raised(tmp_path):
    """UnicodeDecodeError comes from read_text and is a ValueError, so it
    escaped both guards and propagated out of startup: the app would not open."""
    path = tmp_path / "data.json"
    path.write_bytes(b'{"version": 2, "current": "2026-08", "months": {}, "goals": []}\xff')

    data = BudgetData(path, today=AUGUST)
    data.load()

    assert data.note == "corrupt"
    assert (tmp_path / "data.corrupt.json").exists()


def test_a_read_that_fails_at_the_io_level_leaves_the_file_alone(tmp_path, monkeypatch):
    """A locked or contended file says nothing about its contents.

    Quarantining it would turn a transient error into permanent loss, and
    saving over it would finish the job.
    """
    path = _write_v2(tmp_path, {"2026-07": GOOD_JULY})
    original = path.read_text("utf-8")

    real_read = type(path).read_text

    def flaky(self, *args, **kwargs):
        if self == path:
            raise OSError(11, "Resource temporarily unavailable")
        return real_read(self, *args, **kwargs)

    monkeypatch.setattr(type(path), "read_text", flaky)
    data = BudgetData(path, today=AUGUST)
    data.load()
    monkeypatch.undo()

    assert data.note == "unreadable"
    assert not (tmp_path / "data.corrupt.json").exists(), "a good file must not be moved aside"
    assert path.read_text("utf-8") == original

    with pytest.raises(OSError):
        data.save()
    assert path.read_text("utf-8") == original, "and a save must not overwrite it"


def test_a_resolved_notice_is_cleared_so_it_does_not_linger_all_session(tmp_path):
    """A banner that stays up after the condition is gone trains the user to
    dismiss the next one without reading it."""
    path = _write_v1(tmp_path)
    data = BudgetData(path, today=AUGUST)
    data.load()
    assert data.note == "migrated-v1"

    data.save()
    assert data.note is None and data.dropped == 0


def test_a_quarantine_notice_is_not_cleared_by_a_save(tmp_path):
    """Unlike a migration, this one describes a file the user may want back."""
    path = tmp_path / "data.json"
    path.write_text("{ not json", "utf-8")
    data = BudgetData(path, today=AUGUST)
    data.load()
    data.save()
    assert data.note == "corrupt"
