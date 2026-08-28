"""Tests for the exported report.

The report's content is plain data and is tested directly; the spreadsheet is
then verified by reading the written file back, rather than by trusting that
the writer was called.
"""

import pathlib
import zipfile
from datetime import date

import pytest

from tests.mobile_app_modules import BudgetData, Goal, goals, report, xlsx

AUGUST = date(2026, 8, 27)


@pytest.fixture
def data(tmp_path):
    d = BudgetData(tmp_path / "data.json", today=AUGUST)
    d.go_to("2026-07")
    d.month.add_income("Salary", 8000.0, "2026-07-01")
    d.month.add_expense("Rent", 3000.0, "Rent", "2026-07-02")
    d.go_to("2026-08")
    d.month.add_income("Salary", 8500.0, "2026-08-01")
    d.month.add_expense("Rent", 3000.0, "Rent", "2026-08-02")
    d.month.add_expense("Food", 1200.0, "Food", "2026-08-10")
    d.month.total_budget = 6000.0
    d.goals.append(Goal(name="Car", target=10000.0))
    goals.fund(d.goals[0], d.month, 500.0, "2026-08-15", d.months)
    return d


# ── the report's content ─────────────────────────────────────────────────────

def test_the_summary_reports_the_month_on_its_own(data):
    built = report.build(data, "2026-08")
    assert built["summary"]["income"] == 8500.0
    assert built["summary"]["expenses"] == 4700.0, "3000 rent + 1200 food + 500 goal deposit"
    assert built["summary"]["net"] == 3800.0
    assert built["summary"]["budget"] == 6000.0


def test_entries_are_ordered_by_date(data):
    built = report.build(data, "2026-08")
    assert [e["date"] for e in built["expenses"]] == ["2026-08-02", "2026-08-10", "2026-08-15"]


def test_an_entry_without_a_day_sorts_last_not_first(data):
    """Two shapes of incomplete date reach the sort and both would lead.

    An empty string sorts before every real date. Less obviously,
    add_expense fills a missing date with the month alone, so "2026-08" sorts
    before "2026-08-02" purely by being shorter — the row nobody dated would
    head the month.
    """
    data.month.add_expense("Unknown", 50.0, "Misc", None)
    assert data.month.expenses[-1].date == "2026-08", "stored as a month, not blank"

    built = report.build(data, "2026-08")
    assert built["expenses"][-1]["name"] == "Unknown"
    assert [e["date"] for e in built["expenses"][:-1]] == sorted(
        e["date"] for e in built["expenses"][:-1]
    )


def test_categories_are_largest_first_with_their_share(data):
    built = report.build(data, "2026-08")
    assert [c["category"] for c in built["categories"]][0] == "Rent"
    assert built["categories"][0]["share"] == pytest.approx(63.8, abs=0.1)


def test_goal_progress_is_taken_across_months_not_from_this_one(data):
    """A goal's funding is the sum of its deposits everywhere; reporting only
    this month's would understate every goal that has been running a while."""
    goals.fund(data.goals[0], data.months["2026-07"], 300.0, "2026-07-20", data.months)
    built = report.build(data, "2026-08")
    assert built["goals"][0]["funded"] == 800.0
    assert built["goals"][0]["this_month"] == 500.0


def test_the_trend_is_carried_into_the_report(data):
    built = report.build(data, "2026-08")
    assert len(built["trend"]) == 6
    assert built["trend_average"]["months"] == 2


def test_a_month_with_no_data_reports_zeros_rather_than_failing(data):
    built = report.build(data, "2026-03")
    assert built["summary"]["income"] == 0.0
    assert built["incomes"] == [] and built["categories"] == []


# ── the spreadsheet, verified by reading it back ─────────────────────────────

def test_the_workbook_is_written_and_is_a_real_xlsx(data, tmp_path):
    """An .xlsx is a zip. Opening it proves a file was produced rather than a
    zero-byte placeholder that a later reader would reject."""
    path = xlsx.write(report.build(data, "2026-08", "EGP"), tmp_path / "report.xlsx")

    assert path.exists() and path.stat().st_size > 0
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
    assert "xl/workbook.xml" in names


def test_every_section_gets_its_own_sheet(data, tmp_path):
    path = xlsx.write(report.build(data, "2026-08"), tmp_path / "report.xlsx")
    with zipfile.ZipFile(path) as archive:
        workbook = archive.read("xl/workbook.xml").decode("utf-8")
    for sheet in ("Summary", "Entries", "Goals", "Trend"):
        assert f'name="{sheet}"' in workbook


def test_arabic_names_survive_into_the_file(data, tmp_path):
    """Written through the shared-strings table, so a mangled encoding here
    would show as broken text in every spreadsheet application."""
    data.month.add_expense("\u0625\u064a\u062c\u0627\u0631 \u0627\u0644\u0634\u0642\u0629", 500.0, "Rent", "2026-08-20")
    path = xlsx.write(report.build(data, "2026-08"), tmp_path / "report.xlsx")

    with zipfile.ZipFile(path) as archive:
        strings = archive.read("xl/sharedStrings.xml").decode("utf-8")
    assert "\u0625\u064a\u062c\u0627\u0631 \u0627\u0644\u0634\u0642\u0629" in strings


def test_a_month_with_nothing_in_it_still_produces_a_file(data, tmp_path):
    path = xlsx.write(report.build(data, "2026-03"), tmp_path / "empty.xlsx")
    assert path.exists() and zipfile.is_zipfile(path)


def test_an_unwritable_path_raises_rather_than_reporting_success(data, tmp_path):
    """A silent failure here sends the user looking for a file that was never
    written — the same shape as the save bug this project started with."""
    target = tmp_path / "report.xlsx"
    target.mkdir()
    with pytest.raises(xlsx.ExportError):
        xlsx.write(report.build(data, "2026-08"), target)


def test_missing_spreadsheet_support_is_reported_not_swallowed(data, tmp_path, monkeypatch):
    """XlsxWriter is in the Android build, but a build could drop it."""
    import builtins
    real_import = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "xlsxwriter":
            raise ImportError("no module named xlsxwriter")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    with pytest.raises(xlsx.ExportError) as caught:
        xlsx.write(report.build(data, "2026-08"), tmp_path / "r.xlsx")
    assert "unavailable" in caught.value.args[0]


# ── the export route ─────────────────────────────────────────────────────────

def _app(tmp_path):
    from tests.fake_app import FakeApp
    app = FakeApp(tmp_path)
    app.data.month.add_income("Salary", 8000.0, "2026-08-01")
    app.data.month.add_expense("Rent", 3000.0, "Rent", "2026-08-02")
    return app


def test_exporting_writes_a_file_and_reports_where(tmp_path):
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/export", {})

    result = app.last_export
    assert result is not None
    written = pathlib.Path(result["path"])
    assert written.exists() and zipfile.is_zipfile(written)
    assert written.name == "budget-2026-08.xlsx"


def test_a_failed_share_still_leaves_the_user_with_the_file(tmp_path):
    """Off a device there is no share sheet, which must not lose the export."""
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/export", {})

    assert app.last_export["shared"] is False
    assert app.last_export["reason"], "and the reason is reported, not blank"
    assert pathlib.Path(app.last_export["path"]).exists()


def test_exporting_does_not_rewrite_the_data_file(tmp_path):
    """It reads; saving after it would rewrite everything for a read."""
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/export", {})
    assert app.saved_data == 0


def test_a_past_month_can_be_exported_by_name(tmp_path):
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/export", {"month": "2026-07"})
    assert pathlib.Path(app.last_export["path"]).name == "budget-2026-07.xlsx"


def test_an_invalid_month_falls_back_to_the_one_on_screen(tmp_path):
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/export", {"month": "garbage"})
    assert pathlib.Path(app.last_export["path"]).name == "budget-2026-08.xlsx"


# ── sharing, as far as it can be exercised off a device ──────────────────────

def test_sharing_a_file_that_was_never_written_says_so(tmp_path):
    from tests.mobile_app_modules import share
    shared, reason = share.share(tmp_path / "absent.xlsx")
    assert shared is False and "not created" in reason


def test_sharing_off_android_reports_the_platform_not_a_crash(tmp_path):
    from tests.mobile_app_modules import share
    target = tmp_path / "present.xlsx"
    target.write_bytes(b"x")
    shared, reason = share.share(target)
    assert shared is False and "not available" in reason


def test_the_spreadsheet_mime_type_is_the_real_one(tmp_path):
    """A wrong type sends the file to the wrong apps in the share sheet."""
    from tests.mobile_app_modules import share
    assert share.mime_for(pathlib.Path("a.xlsx")).endswith("spreadsheetml.sheet")
    assert share.mime_for(pathlib.Path("a.unknown")) == "application/octet-stream"
