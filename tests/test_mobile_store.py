"""Tests for the mobile app's on-disk format.

The persistence guarantees are the ones the user asked for by name — data must
survive a restart and must never be lost — so they are tested directly rather
than through the app.
"""

import json
import pytest

from tests.mobile_app_modules import store  # noqa: E402


# ── month keys ───────────────────────────────────────────────────────────────

def test_month_key_zero_pads_so_keys_sort_chronologically():
    keys = [store.month_key(2026, 9), store.month_key(2026, 10), store.month_key(2026, 2)]
    assert sorted(keys) == ["2026-02", "2026-09", "2026-10"]


@pytest.mark.parametrize("bad", ["2026", "2026-13", "2026-00", "", "not-a-month", "2026-1-1"])
def test_is_month_key_rejects_malformed(bad):
    assert not store.is_month_key(bad)


def test_shift_month_crosses_the_year_boundary_backwards():
    assert store.shift_month("2026-01", -1) == "2025-12"


def test_shift_month_handles_deltas_larger_than_a_year():
    assert store.shift_month("2026-08", -37) == "2023-07"
    assert store.shift_month("2026-08", 17) == "2028-01"


def test_shift_month_round_trips():
    assert store.shift_month(store.shift_month("2026-08", -1), 1) == "2026-08"


# ── migration off the old flat format ────────────────────────────────────────

V1 = {
    "year": 2026,
    "month": 7,
    "budget": {"month": None, "incomes": [{"name": "Salary", "amount": 8000.0, "date": "2026-07-01"}]},
    "goals": [{"name": "Car", "target": 50000.0, "current": 0.0, "icon": "🚗", "target_month": ""}],
}


def test_v1_budget_lands_under_the_month_its_label_claimed():
    doc, note = store.migrate(V1, "2026-08")
    assert note == "migrated-v1"
    assert list(doc["months"]) == ["2026-07"]
    assert doc["months"]["2026-07"]["incomes"][0]["amount"] == 8000.0


def test_v1_migration_keeps_goals_verbatim():
    doc, _ = store.migrate(V1, "2026-08")
    assert doc["goals"] == V1["goals"]


def test_v1_without_a_usable_label_falls_back_rather_than_dropping_the_budget():
    doc, _ = store.migrate({"budget": {"incomes": [{"name": "x", "amount": 1.0}]}}, "2026-08")
    assert list(doc["months"]) == ["2026-08"], "a labelless budget must not vanish"


@pytest.mark.parametrize("label", [{"year": None, "month": None}, {"year": 2026, "month": 99}, {"year": "abc", "month": 7}])
def test_v1_malformed_labels_fall_back_instead_of_raising(label):
    doc, _ = store.migrate({**label, "budget": {"incomes": [{"name": "x", "amount": 1.0}]}}, "2026-08")
    assert list(doc["months"]) == ["2026-08"]


def test_an_empty_v1_budget_creates_no_month():
    doc, _ = store.migrate({"year": 2026, "month": 7, "budget": {}}, "2026-08")
    assert doc["months"] == {}


# ── refusing to destroy what we do not understand ────────────────────────────

def test_a_newer_schema_is_reported_not_silently_treated_as_empty():
    doc, note = store.migrate({"version": 99, "months": {"2026-08": {}}}, "2026-08")
    assert note == "future-version", "a future file must be flagged, or the next save destroys it"
    assert doc["months"] == {}


@pytest.mark.parametrize("raw", [[], "text", 42, None])
def test_a_non_object_document_is_reported_unreadable(raw):
    _, note = store.migrate(raw, "2026-08")
    assert note == "unreadable"


# ── defensive reading of our own format ──────────────────────────────────────

def test_a_month_whose_value_is_not_an_object_is_dropped_not_loaded():
    doc, _ = store.migrate(
        {"version": 2, "current": "2026-08", "months": {"2026-08": None, "2026-07": {"incomes": []}}, "goals": []},
        "2026-08",
    )
    assert list(doc["months"]) == ["2026-07"], "None would throw on first use"


def test_a_key_that_is_not_a_month_is_dropped():
    doc, _ = store.migrate(
        {"version": 2, "current": "2026-08", "months": {"garbage": {}, "2026-08": {}}, "goals": []}, "2026-08"
    )
    assert list(doc["months"]) == ["2026-08"]


def test_a_current_month_that_is_malformed_falls_back():
    doc, _ = store.migrate({"version": 2, "current": "2026-99", "months": {}, "goals": []}, "2026-08")
    assert doc["current"] == "2026-08"


def test_non_object_goals_are_dropped_but_the_rest_survive():
    doc, _ = store.migrate(
        {"version": 2, "current": "2026-08", "months": {}, "goals": [None, {"name": "Car"}, "x"]}, "2026-08"
    )
    assert doc["goals"] == [{"name": "Car"}]


# ── disk ─────────────────────────────────────────────────────────────────────

def test_a_written_document_reads_back_identical(tmp_path):
    path = tmp_path / "data.json"
    doc = store.empty_doc("2026-08")
    doc["months"]["2026-08"] = {"incomes": [{"name": "راتب", "amount": 8000.0}]}
    store.write_doc(path, doc)
    assert store.read_doc(path, "2026-01") == (doc, None)


def test_arabic_survives_the_round_trip_unescaped(tmp_path):
    path = tmp_path / "data.json"
    doc = store.empty_doc("2026-08")
    doc["months"]["2026-08"] = {"incomes": [{"name": "راتب", "amount": 1.0}]}
    store.write_doc(path, doc)
    assert "راتب" in path.read_text("utf-8"), "ensure_ascii would mangle it in the file"


def test_a_missing_file_is_a_first_run_not_an_error(tmp_path):
    doc, note = store.read_doc(tmp_path / "absent.json", "2026-08")
    assert note is None and doc == store.empty_doc("2026-08")


def test_unparseable_json_is_reported_corrupt(tmp_path):
    path = tmp_path / "data.json"
    path.write_text("{not json", "utf-8")
    _, note = store.read_doc(path, "2026-08")
    assert note == "corrupt"


def test_quarantine_moves_a_bad_file_aside_so_a_save_cannot_destroy_it(tmp_path):
    path = tmp_path / "data.json"
    path.write_text("{not json", "utf-8")

    moved = store.quarantine(path)

    assert moved is not None and moved.read_text("utf-8") == "{not json"
    assert not path.exists()
    store.write_doc(path, store.empty_doc("2026-08"))
    assert moved.read_text("utf-8") == "{not json", "the original bytes must still be there"


def test_quarantine_does_not_overwrite_an_earlier_quarantine(tmp_path):
    path = tmp_path / "data.json"
    path.write_text("first", "utf-8")
    first = store.quarantine(path)
    path.write_text("second", "utf-8")
    second = store.quarantine(path)

    assert first != second
    assert first.read_text("utf-8") == "first"
    assert second.read_text("utf-8") == "second"


def test_backup_captures_the_bytes_before_a_migration_writes(tmp_path):
    path = tmp_path / "data.json"
    path.write_text(json.dumps(V1), "utf-8")

    kept = store.backup(path)
    store.write_doc(path, store.migrate(V1, "2026-08")[0])

    assert json.loads(kept.read_text("utf-8")) == V1


def test_write_failure_raises_instead_of_passing_silently(tmp_path):
    unwritable = tmp_path / "no-such-dir" / "data.json"
    with pytest.raises(OSError):
        store.write_doc(unwritable, store.empty_doc("2026-08"))


def test_write_leaves_no_temp_file_behind(tmp_path):
    path = tmp_path / "data.json"
    store.write_doc(path, store.empty_doc("2026-08"))
    assert [p.name for p in tmp_path.iterdir()] == ["data.json"]


def test_a_failed_write_leaves_the_previous_contents_intact(tmp_path, monkeypatch):
    """The reason writes go via a temp file and os.replace.

    A direct write truncates first, so a failure part-way through destroys the
    data that was already there. Here the swap is forced to fail *after* the
    new bytes are staged, and the old file must be untouched.
    """
    path = tmp_path / "data.json"
    good = store.empty_doc("2026-07")
    good["months"]["2026-07"] = {"incomes": [{"name": "Salary", "amount": 8000.0}]}
    store.write_doc(path, good)

    def boom(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(store.os, "replace", boom)
    with pytest.raises(OSError):
        store.write_doc(path, store.empty_doc("2026-08"))

    assert store.read_doc(path, "2026-01") == (good, None), "the old month must survive"
