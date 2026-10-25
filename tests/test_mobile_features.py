"""The five additions to the mobile app, tested where each one can break.

Envelopes and favourites touch the stored document, so those are tested through
save and load. Search is pure data in, data out. CSV is a format, so round
trips matter more than examples. The state the page renders from is checked
against a real running server, because a key missing from that document is a
feature the app cannot draw however correct the code behind it is.
"""

import json
import re
import urllib.request
from datetime import date
from pathlib import Path

import pytest

from tests.fake_app import FakeApp
from tests.mobile_app_modules import BudgetData, api, csv_transfer, search


@pytest.fixture
def app(tmp_path):
    return FakeApp(tmp_path)


def post(app, path, payload=None):
    return api.dispatch(app, path, payload or {})


# ── envelopes: a ceiling per category ───────────────────────────────────────

def test_a_ceiling_is_stored_and_removed_with_zero(app):
    post(app, "/api/set-category-limit", {"category": "Food", "amount": 500})
    assert app.data.month.budget_limits == {"Food": 500.0}

    post(app, "/api/set-category-limit", {"category": "Food", "amount": 0})
    assert app.data.month.budget_limits == {}


def test_a_ceiling_needs_a_category_and_an_amount(app):
    with pytest.raises(api.ApiError):
        post(app, "/api/set-category-limit", {"category": "", "amount": 100})
    with pytest.raises(api.ApiError):
        post(app, "/api/set-category-limit", {"category": "Food", "amount": -1})


def test_ceilings_survive_a_save_and_a_reload(tmp_path):
    """The whole feature is worthless if the plan is lost on the next start."""
    first = FakeApp(tmp_path)
    post(first, "/api/set-category-limit", {"category": "Food", "amount": 600})
    post(first, "/api/set-category-limit", {"category": "Fuel", "amount": 250})

    second = BudgetData(tmp_path / "data.json", today=date(2026, 8, 27))
    second.load()

    assert second.months[first.data.current].budget_limits == {"Food": 600.0, "Fuel": 250.0}


def test_a_month_holding_only_ceilings_is_not_dropped(tmp_path):
    """_is_blank used to look at entries alone, so a plan set up before the
    first expense vanished on the following save."""
    first = FakeApp(tmp_path)
    post(first, "/api/set-category-limit", {"category": "Food", "amount": 600})
    post(first, "/api/step-month", {"delta": -1})
    post(first, "/api/set-category-limit", {"category": "Rent", "amount": 900})

    second = BudgetData(tmp_path / "data.json", today=date(2026, 8, 27))
    second.load()

    assert "2026-07" in second.months, "the month with only a plan was dropped"


def test_a_new_month_starts_with_the_previous_months_plan(app):
    post(app, "/api/set-category-limit", {"category": "Food", "amount": 600})
    app.data.current = "2026-09"

    assert app.data.month.budget_limits == {"Food": 600.0}


def test_the_carry_forward_comes_from_the_previous_month_only(app):
    """Clearing the plan has to stay cleared: reaching further back would
    resurrect a ceiling the user deliberately removed."""
    post(app, "/api/set-category-limit", {"category": "Food", "amount": 600})
    post(app, "/api/step-month", {"delta": -1})  # 2026-07
    post(app, "/api/set-category-limit", {"category": "Rent", "amount": 900})
    post(app, "/api/set-category-limit", {"category": "Rent", "amount": 0})
    app.data.current = "2026-08"

    # August keeps its own plan and does not inherit the cleared one behind it.
    assert app.data.month.budget_limits == {"Food": 600.0}


def test_limit_rows_are_computed_not_guessed(app):
    post(app, "/api/set-category-limit", {"category": "Food", "amount": 400})
    post(app, "/api/set-category-limit", {"category": "Rent", "amount": 1000})
    post(app, "/api/add-expense", {"name": "Groceries", "amount": 460, "category": "Food"})
    post(app, "/api/add-expense", {"name": "Unbudgeted", "amount": 90, "category": "Misc"})

    rows = api_rows(app)
    by_category = {row["category"]: row for row in rows}

    assert set(by_category) == {"Food", "Rent"}, "a category with no ceiling became a row"
    assert by_category["Food"]["over"] is True
    assert by_category["Food"]["remaining"] == 0.0
    assert by_category["Food"]["pct"] == 100.0
    assert by_category["Rent"]["over"] is False
    assert by_category["Rent"]["spent"] == 0.0
    assert rows[0]["category"] == "Food", "the overspent envelope is not shown first"


def api_rows(app):
    """The envelope rows as the app builds them, without starting Toga.

    ``app.py`` needs a Toga application for anything else it does, but this one
    method is arithmetic over the month; the real class is borrowed rather than
    re-implemented so the test cannot agree with a copy that drifted.
    """
    from tests.mobile_app_modules import load_app_module

    module = load_app_module()
    return module.App._limit_rows(app, app.data.month)


# ── search across every month ───────────────────────────────────────────────

def _two_months(app):
    app.data.current = "2026-07"
    post(app, "/api/add-expense", {"name": "Carrefour", "amount": 320, "category": "Food", "date": "2026-07-04"})
    app.data.current = "2026-08"
    post(app, "/api/add-expense", {"name": "Carrefour Express", "amount": 90, "category": "Food", "date": "2026-08-11"})
    post(app, "/api/add-income", {"name": "Salary", "amount": 8000, "date": "2026-08-01"})


def test_search_finds_one_name_in_every_month(app):
    _two_months(app)
    post(app, "/api/search", {"query": "carrefour"})

    found = app.last_search
    assert found["total"] == 2
    assert [row["month"] for row in found["rows"]] == ["2026-08", "2026-07"], "not newest first"


def test_search_ignores_case_and_finds_income_too(app):
    _two_months(app)
    post(app, "/api/search", {"query": "SALARY"})

    assert [row["kind"] for row in app.last_search["rows"]] == ["income"]


def test_search_matches_the_arabic_category_name_shown_on_screen(app):
    """The screen says «طعام» and the file says Food; a user searching what they
    see should not have to know which one is stored."""
    _two_months(app)
    post(app, "/api/search", {"query": "طعام"})

    assert app.last_search["total"] == 2


def test_an_empty_query_clears_the_last_result(app):
    _two_months(app)
    post(app, "/api/search", {"query": "carrefour"})
    post(app, "/api/search", {"query": "   "})

    assert app.last_search is None


def test_searching_writes_nothing(app):
    _two_months(app)
    before = app.saved_data
    post(app, "/api/search", {"query": "carrefour"})

    assert app.saved_data == before, "a search rewrote the data file"


def test_search_is_capped_and_says_how_many_were_left(app):
    for day in range(1, 8):
        post(app, "/api/add-expense", {"name": f"Coffee {day}", "amount": 15, "category": "Food"})
    found = search.find(app.data.months, "coffee", limit=5)

    assert found["shown"] == 5
    assert found["total"] == 7


def test_the_arabic_labels_in_search_match_the_ones_on_the_page():
    """Two copies of the category names exist — one in the page, one in search —
    and a label that changes in only one place makes a search miss what the
    screen shows."""
    page = (Path(__file__).parent.parent / "mobile" / "src" / "budget_manager_mobile"
            / "web" / "index.html").read_text("utf-8")
    block = re.search(r"CAT_TRANS = \{(.*?)\n\};", page, re.S).group(1)
    arabic = re.search(r"ar: \{(.*?)\}", block, re.S).group(1)
    on_page = {
        key: value
        for key, value in re.findall(r"(\w+):'([^']*)'", arabic)
    }

    assert on_page == search.AR_CATEGORY


# ── favourites: one tap to add again ─────────────────────────────────────────

def test_a_favourite_is_saved_listed_and_removed(app):
    post(app, "/api/add-favorite", {"kind": "expense", "name": "Coffee", "amount": 15, "category": "Food"})
    assert app.data.favorites == [
        {"kind": "expense", "name": "Coffee", "category": "Food", "amount": 15.0}
    ]

    post(app, "/api/delete-favorite", {"index": 0})
    assert app.data.favorites == []


def test_the_same_favourite_is_not_stored_twice(app):
    for _ in range(3):
        post(app, "/api/add-favorite", {"kind": "expense", "name": "Coffee", "amount": 15, "category": "Food"})

    assert len(app.data.favorites) == 1


def test_a_favourite_needs_a_name_and_an_amount(app):
    with pytest.raises(api.ApiError):
        post(app, "/api/add-favorite", {"kind": "expense", "name": "  ", "amount": 15})
    with pytest.raises(api.ApiError):
        post(app, "/api/add-favorite", {"kind": "expense", "name": "Coffee", "amount": 0})
    with pytest.raises(api.ApiError):
        post(app, "/api/add-favorite", {"kind": "transfer", "name": "Coffee", "amount": 5})


def test_using_a_favourite_adds_it_to_the_month_on_screen(app):
    post(app, "/api/add-favorite", {"kind": "expense", "name": "Coffee", "amount": 15, "category": "Food"})
    post(app, "/api/use-favorite", {"index": 0})

    expense = app.data.month.expenses[0]
    assert (expense.name, expense.amount, expense.category) == ("Coffee", 15.0, "Food")
    assert expense.date == "2026-08-27", "a favourite should land on today"


def test_using_an_income_favourite_does_not_make_it_an_expense(app):
    post(app, "/api/add-favorite", {"kind": "income", "name": "Freelance", "amount": 700})
    post(app, "/api/use-favorite", {"index": 0})

    assert [i.name for i in app.data.month.incomes] == ["Freelance"]
    assert app.data.month.expenses == []


def test_favourites_survive_a_save_and_a_reload(tmp_path):
    first = FakeApp(tmp_path)
    post(first, "/api/add-favorite", {"kind": "expense", "name": "Rent", "amount": 900, "category": "Rent"})

    second = BudgetData(tmp_path / "data.json", today=date(2026, 8, 27))
    second.load()

    assert second.favorites == [
        {"kind": "expense", "name": "Rent", "category": "Rent", "amount": 900.0}
    ]


def test_a_damaged_favourite_is_dropped_and_reported(tmp_path):
    path = tmp_path / "data.json"
    path.write_text(json.dumps({
        "version": 2, "current": "2026-08", "months": {}, "goals": [],
        "favorites": [
            {"kind": "expense", "name": "Coffee", "amount": 15},
            {"kind": "expense", "name": "", "amount": 15},
            {"kind": "expense", "name": "Bad", "amount": "lots"},
        ],
    }), "utf-8")

    data = BudgetData(path, today=date(2026, 8, 27))
    data.load()

    assert [f["name"] for f in data.favorites] == ["Coffee"]
    assert data.dropped == 2
    assert data.note == "partial"


# ── CSV: out to another program, and back in ────────────────────────────────

def test_a_month_survives_a_csv_round_trip(app):
    post(app, "/api/add-income", {"name": "Salary", "amount": 8000, "date": "2026-08-01"})
    post(app, "/api/add-expense", {
        "name": "Supermarket, big", "amount": 320.5, "category": "Food", "date": "2026-08-04",
    })

    text = csv_transfer.build(app.data.month, "2026-08")
    rows, problems = csv_transfer.parse(text)

    assert problems == []
    assert [row["kind"] for row in rows] == ["income", "expense"]
    assert rows[1]["name"] == "Supermarket, big", "a comma in a name split the row"
    assert rows[1]["amount"] == 320.5


def test_importing_adds_the_rows_and_names_the_ones_it_could_not(app):
    text = (
        '"type","name","category","amount","date"\n'
        '"expense","Groceries","Food","120.00","2026-08-03"\n'
        '"income","Bonus","","500.00","2026-08-05"\n'
        '"expense","","Food","40.00","2026-08-06"\n'
        '"expense","Bad amount","Food","abc","2026-08-07"\n'
    )
    post(app, "/api/import-csv", {"text": text})

    assert app.data.month.total_expenses() == 120
    assert app.data.month.total_income() == 500
    assert app.last_csv_import["added"] == 2
    assert app.last_csv_import["skipped"] == 2
    assert [p["reason"] for p in app.last_csv_import["problems"]] == ["name", "amount"]
    assert [p["line"] for p in app.last_csv_import["problems"]] == [4, 5]


def test_a_headerless_file_is_read_in_the_documented_order(app):
    post(app, "/api/import-csv", {"text": '"expense","Tea","Food","9.00","2026-08-09"'})

    assert [e.name for e in app.data.month.expenses] == ["Tea"]


def test_an_unreadable_date_falls_back_to_the_month_not_to_nothing(app):
    post(app, "/api/import-csv", {"text": '"expense","Tea","Food","9.00","09/08/2026"'})

    assert app.data.month.expenses[0].date == "2026-08-27"


def test_an_empty_paste_is_refused(app):
    with pytest.raises(api.ApiError):
        post(app, "/api/import-csv", {"text": "   "})


def test_exporting_writes_a_file_for_the_month_on_screen(app):
    post(app, "/api/add-expense", {"name": "Tea", "amount": 9, "category": "Food"})
    post(app, "/api/export-csv", {})

    written = Path(app.last_csv_export["path"])
    assert written.exists()
    assert "\"expense\",\"Tea\",\"Food\",\"9.00\"" in written.read_text("utf-8-sig")
    # The share sheet is absent under test; the file is the part that must not
    # be lost, and the record says which of the two did not happen.
    assert app.last_csv_export["shared"] is False
    assert app.last_csv_export["reason"]


def test_the_csv_export_does_not_count_as_a_data_change(app):
    post(app, "/api/add-expense", {"name": "Tea", "amount": 9, "category": "Food"})
    before = app.saved_data
    post(app, "/api/export-csv", {})

    assert app.saved_data == before


# ── the state the page draws from ───────────────────────────────────────────

def test_the_state_carries_everything_the_new_screens_read(tmp_path):
    """A correct route behind a key missing from the state is a dead feature:
    the page cannot draw what was never sent."""
    from tests.mobile_app_modules import load_app_module

    module = load_app_module()
    live_app = module.App("Test", "test.app", data_dir=tmp_path)
    live_app.startup()
    try:
        payload = json.dumps({"name": "Groceries", "amount": 100, "category": "Food"}).encode()
        request = urllib.request.Request(
            f"http://127.0.0.1:{live_app._port}/api/add-expense",
            data=payload, headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request):
            pass
        with urllib.request.urlopen(f"http://127.0.0.1:{live_app._port}/api/data") as response:
            state = json.loads(response.read())
    finally:
        live_app._server.shutdown()
        live_app._server.server_close()

    for key in ("budget_limits", "limit_rows", "favorites", "last_search",
                "last_csv_export", "last_csv_import"):
        assert key in state, f"the page reads {key} but the state does not carry it"
