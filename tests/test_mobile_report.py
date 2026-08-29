"""Tests for the exported report.

The report's content is plain data and is tested directly; the spreadsheet is
then verified by reading the written file back, rather than by trusting that
the writer was called.
"""

import json
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


def test_sharing_without_an_android_activity_says_so_precisely(tmp_path):
    """The reason used to read "not available on this platform", which blamed
    Android for a mistake of mine: the probe imported android.content.Intent,
    the Pyjnius idiom, while Briefcase packages this app with Chaquopy, whose
    bridge is java.jclass. The import failed on a real phone and the app
    reported the platform as lacking a feature it has. A wrong diagnosis in an
    error message is worse than none — it sends the next reader away from the
    cause.
    """
    from tests.mobile_app_modules import share
    target = tmp_path / "present.xlsx"
    target.write_bytes(b"x")

    shared, reason = share.share(target)
    assert shared is False
    assert "activity" in reason, "name the missing piece, not the platform"


def test_share_reaches_the_activity_the_way_toga_does(tmp_path):
    """Pinned because I got it wrong twice by guessing.

    First I probed for android.content.Intent as a Pyjnius import; then I
    rewrote everything around java.jclass for Chaquopy. Reading toga-android
    settled it: it imports `from android.content import Intent` plainly, and
    it holds the Activity as `MainActivity.singletonThis` — which was the part
    that was actually wrong, and neither rewrite touched it.
    """
    import inspect

    from tests.mobile_app_modules import share

    source = inspect.getsource(share)
    assert "from org.beeware.android import MainActivity" in source
    assert "singletonThis" in source
    assert "jclass" not in source, "the Chaquopy detour was a wrong turn"


def test_the_spreadsheet_mime_type_is_the_real_one(tmp_path):
    """A wrong type sends the file to the wrong apps in the share sheet."""
    from tests.mobile_app_modules import share
    assert share.mime_for(pathlib.Path("a.xlsx")).endswith("spreadsheetml.sheet")
    assert share.mime_for(pathlib.Path("a.unknown")) == "application/octet-stream"


# ── defects found by independent review ──────────────────────────────────────

def _format_codes(path):
    import re
    with zipfile.ZipFile(path) as archive:
        return re.findall(r'formatCode="([^"]*)"', archive.read("xl/styles.xml").decode("utf-8"))


@pytest.mark.parametrize("currency", ["USD", "SAR", "AED", "MAD", "EGP", "JPY"])
def test_the_currency_is_quoted_so_money_is_not_read_as_a_date(data, tmp_path, currency):
    """Unquoted letters in an Excel number format are format codes, not text:
    D is day, M is month, S is second. "USD#,##0.00" is therefore a date
    format, and 8500 renders as 09/04/1923 — for the default currency, on a
    fresh install, in every money cell of every sheet.
    """
    path = xlsx.write(report.build(data, "2026-08", currency), tmp_path / "r.xlsx")
    assert f'&quot;{currency}&quot;#,##0.00' in _format_codes(path)


def test_a_quote_inside_the_currency_cannot_break_the_file(data, tmp_path):
    """It would close the literal early and produce a workbook Excel refuses
    to open. The currency comes from a request and is only length-checked."""
    path = xlsx.write(report.build(data, "2026-08", 'A"B'), tmp_path / "r.xlsx")
    assert zipfile.is_zipfile(path)
    assert '&quot;AB&quot;#,##0.00' in _format_codes(path)


def test_no_currency_leaves_a_plain_number_format(data, tmp_path):
    path = xlsx.write(report.build(data, "2026-08", ""), tmp_path / "r.xlsx")
    assert "#,##0.00" in _format_codes(path)


def test_an_export_survives_a_share_that_raises(tmp_path, monkeypatch):
    """share() promises a (shared, reason) pair, but it drives a platform
    bridge. One escaping exception would cost the user a spreadsheet that was
    already written, and they would be told only that the request failed.
    """
    from tests.mobile_app_modules import api, share
    app = _app(tmp_path)

    def explode(*_args, **_kwargs):
        raise RuntimeError("java bridge went sideways")

    monkeypatch.setattr(share, "share", explode)
    api.dispatch(app, "/api/export", {})

    assert app.last_export["shared"] is False
    assert "java bridge" in app.last_export["reason"]
    assert pathlib.Path(app.last_export["path"]).exists(), "the file must still be there"


def test_share_returns_a_pair_even_when_finding_the_activity_raises(tmp_path, monkeypatch):
    """_activity() sat outside the try, so anything it raised beyond
    ImportError and AttributeError escaped share() entirely."""
    from tests.mobile_app_modules import share
    target = tmp_path / "present.xlsx"
    target.write_bytes(b"x")

    def explode():
        raise RuntimeError("bridge failure")

    monkeypatch.setattr(share, "_activity", explode)
    shared, reason = share.share(target)
    assert shared is False and "bridge failure" in reason


# ── the backup button ────────────────────────────────────────────────────────

def test_a_backup_writes_a_file_and_offers_it_to_the_share_sheet(tmp_path):
    """It used to build a Blob and click an <a download>, which needs a
    DownloadListener the Android WebView does not register — so nothing was
    written, nothing was shared, and the toast said "saved" regardless."""
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/backup-file", {})

    written = pathlib.Path(app.last_export["path"])
    assert written.exists() and written.name.startswith("budget-backup-")


def test_the_backup_holds_everything_needed_to_restore(tmp_path):
    """A backup that omits a month is worse than none: it restores, looks
    plausible, and quietly loses what it left out."""
    from tests.mobile_app_modules import Goal, api
    app = _app(tmp_path)
    app.data.go_to("2026-07")
    app.data.month.add_income("July", 7000.0, "2026-07-01")
    app.data.go_to("2026-08")
    app.data.goals.append(Goal(name="Car", target=1000.0))
    api.dispatch(app, "/api/backup-file", {})

    saved = json.loads(pathlib.Path(app.last_export["path"]).read_text("utf-8"))
    assert sorted(saved["months"]) == ["2026-07", "2026-08"]
    assert saved["goals"][0]["name"] == "Car"
    assert saved["current"] == "2026-08"


def test_the_backup_round_trips_into_a_fresh_install(tmp_path):
    """The point of the file: it has to open on the other device."""
    from tests.mobile_app_modules import BudgetData, api
    app = _app(tmp_path)
    api.dispatch(app, "/api/backup-file", {})

    other = tmp_path / "tablet" / "data.json"
    other.parent.mkdir()
    other.write_text(pathlib.Path(app.last_export["path"]).read_text("utf-8"), "utf-8")

    restored = BudgetData(other, today=app._today)
    restored.load()
    assert restored.note is None, "a backup must load as ordinary data"
    assert restored.month.total_income() == 8000.0


def test_arabic_survives_the_backup_unescaped(tmp_path):
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    app.data.month.add_expense("إيجار الشقة", 3000.0, "Rent", "2026-08-02")
    api.dispatch(app, "/api/backup-file", {})
    assert "إيجار الشقة" in pathlib.Path(app.last_export["path"]).read_text("utf-8")


def test_a_backup_does_not_rewrite_the_data_file(tmp_path):
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/backup-file", {})
    assert app.saved_data == 0


def test_the_backup_name_says_which_month_it_was_taken_in(tmp_path):
    """Two backups on one device should not overwrite each other silently."""
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/backup-file", {})
    assert app.data.current in pathlib.Path(app.last_export["path"]).name


# ── restoring: the one operation that replaces everything ────────────────────

def _backup_text(tmp_path, month="2026-07", income=7000.0):
    """A backup taken on another device."""
    from tests.mobile_app_modules import BudgetData
    other = BudgetData(tmp_path / "other" / "data.json", today=date(2026, 8, 27))
    other._path.parent.mkdir(parents=True, exist_ok=True)
    other.go_to(month)
    other.month.add_income("Tablet", income, f"{month}-01")
    return json.dumps(other.to_doc(), ensure_ascii=False)


def test_a_preview_changes_nothing(tmp_path):
    """Reading a backup must never be the same act as applying it."""
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    before = app.data.month.total_income()

    api.dispatch(app, "/api/preview-restore", {"text": _backup_text(tmp_path)})

    assert app.data.month.total_income() == before
    assert app.restore_preview is not None


def test_the_preview_shows_both_sides_month_by_month(tmp_path):
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/preview-restore", {"text": _backup_text(tmp_path)})

    rows = {r["month"]: r for r in app.restore_preview["months"]}
    assert rows["2026-08"]["mine"]["income"] == 8000.0
    assert rows["2026-08"]["theirs"] is None, "the backup has no August"
    assert rows["2026-07"]["theirs"]["income"] == 7000.0


def test_restoring_requires_a_preview_first(tmp_path):
    """No single request may replace the data."""
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    with pytest.raises(api.ApiError) as caught:
        api.dispatch(app, "/api/restore", {})
    assert caught.value.status == 409
    assert app.data.month.total_income() == 8000.0


def test_restoring_replaces_the_data(tmp_path):
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/preview-restore", {"text": _backup_text(tmp_path)})
    api.dispatch(app, "/api/restore", {})

    assert app.data.months["2026-07"].total_income() == 7000.0
    assert "2026-08" not in app.data.months, "the backup did not have it"


def test_the_previous_data_is_kept_before_it_is_replaced(tmp_path):
    """A restore is reversible for as long as that file survives, which is
    what makes trying one a safe thing to do."""
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/preview-restore", {"text": _backup_text(tmp_path)})
    api.dispatch(app, "/api/restore", {})

    kept = json.loads(pathlib.Path(app.last_export["path"]).read_text("utf-8"))
    assert kept["months"]["2026-08"]["incomes"][0]["amount"] == 8000.0


def test_a_second_restore_needs_a_second_preview(tmp_path):
    """The pending document is consumed, so a stray tap cannot repeat it."""
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/preview-restore", {"text": _backup_text(tmp_path)})
    api.dispatch(app, "/api/restore", {})
    with pytest.raises(api.ApiError):
        api.dispatch(app, "/api/restore", {})


@pytest.mark.parametrize("text", ["", "   ", "not json", "[]", '{"version": 99}'])
def test_something_that_is_not_a_backup_is_refused(tmp_path, text):
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    with pytest.raises(api.ApiError):
        api.dispatch(app, "/api/preview-restore", {"text": text})
    assert app.data.month.total_income() == 8000.0


def test_a_backup_from_this_app_restores_with_no_complaint(tmp_path):
    """The round trip that matters: back up here, restore there."""
    from tests.mobile_app_modules import api
    app = _app(tmp_path)
    api.dispatch(app, "/api/backup-file", {})
    text = pathlib.Path(app.last_export["path"]).read_text("utf-8")

    api.dispatch(app, "/api/preview-restore", {"text": text})
    api.dispatch(app, "/api/restore", {})
    assert app.data.month.total_income() == 8000.0
    assert app.data.note is None


def test_a_failed_share_says_which_step_was_missing(tmp_path):
    """Four releases went out guessing at which piece of the Android path was
    unavailable. The app knew and did not say: share() returned a reason and
    the UI printed a file name instead. One message back now settles what four
    rounds of guessing did not."""
    from tests.mobile_app_modules import share
    target = tmp_path / "present.xlsx"
    target.write_bytes(b"x")

    shared, reason = share.share(target)
    assert shared is False
    for step in ("MainActivity", "Intent", "MediaStore"):
        assert step in reason, f"{step} must be reported either way"


def test_the_diagnosis_names_every_step_of_the_path():
    from tests.mobile_app_modules import share
    line = share.diagnose()
    assert line.count("=") >= 3, "one verdict per step"


def test_no_bare_integer_is_handed_to_contentvalues():
    """The whole share failure was one line.

    ContentValues.put has nine numeric overloads, so a bare Python int leaves
    the Java bridge unable to choose and it refuses:

        ContentValues.put is ambiguous for arguments (str, int)

    Every other step reported working. This guards the shape rather than the
    behaviour, because the behaviour needs a device — a literal number passed
    to put() is the mistake, and it must not come back.
    """
    import inspect
    import re

    from tests.mobile_app_modules import share

    source = inspect.getsource(share)
    bare = re.findall(r"\.put\([^)]*,\s*-?\d+\s*\)", source)
    assert not bare, f"pass these through _int(): {bare}"


def test_the_integer_helper_degrades_instead_of_raising():
    """Off a device neither bridge exists. Publishing must continue without
    the pending flag rather than lose the share to it."""
    from tests.mobile_app_modules import share
    assert share._int(1) is None


def test_the_spreadsheet_speaks_the_language_the_app_is_in(tmp_path):
    """It came out in English under an Arabic interface: xlsx.py had every
    word written into it and no idea a language existed. The page now sends
    the words it is showing, so there is one source for them rather than two
    that drift."""
    built = report.build(_app(tmp_path).data, "2026-08", "EGP")
    built["labels"] = {
        "report": "\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u0645\u064a\u0632\u0627\u0646\u064a\u0629",
        "summary": "\u0627\u0644\u0645\u064a\u0632\u0627\u0646\u064a\u0629",
        "income": "\u0627\u0644\u062f\u062e\u0644",
        "expenses": "\u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062a",
    }
    path = xlsx.write(built, tmp_path / "ar.xlsx")

    with zipfile.ZipFile(path) as archive:
        strings = archive.read("xl/sharedStrings.xml").decode("utf-8")
        workbook = archive.read("xl/workbook.xml").decode("utf-8")
    assert "\u0627\u0644\u062f\u062e\u0644" in strings
    assert "\u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062a" in strings
    assert 'name="\u0627\u0644\u0645\u064a\u0632\u0627\u0646\u064a\u0629"' in workbook, "sheet tabs too"


def test_missing_labels_fall_back_to_english_rather_than_blank(tmp_path):
    """A gap in the table must not produce an empty column heading."""
    built = report.build(_app(tmp_path).data, "2026-08", "EGP")
    built["labels"] = {"income": "\u0627\u0644\u062f\u062e\u0644"}
    path = xlsx.write(built, tmp_path / "partial.xlsx")

    with zipfile.ZipFile(path) as archive:
        strings = archive.read("xl/sharedStrings.xml").decode("utf-8")
    assert "\u0627\u0644\u062f\u062e\u0644" in strings
    assert "Expenses" in strings, "the untranslated ones keep their English"


def test_a_label_that_is_not_a_string_is_ignored(tmp_path):
    """The labels arrive from a request, so they are not trusted."""
    built = report.build(_app(tmp_path).data, "2026-08", "EGP")
    built["labels"] = {"income": 42, "expenses": None, "net": "  "}
    path = xlsx.write(built, tmp_path / "junk.xlsx")

    with zipfile.ZipFile(path) as archive:
        strings = archive.read("xl/sharedStrings.xml").decode("utf-8")
    for word in ("Income", "Expenses", "Net"):
        assert word in strings
