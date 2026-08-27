"""Tests for the two automation engines, now that they are reachable.

Both existed in monthly_budget.core and were called from nowhere: a search for
apply_auto_category or apply_recurring_for_month across app.py and index.html
returned zero hits before this work.
"""


import pytest

from tests.fake_app import FakeApp
from tests.mobile_app_modules import api, recurring


@pytest.fixture
def app(tmp_path):
    return FakeApp(tmp_path)


def post(app, path, payload=None):
    return api.dispatch(app, path, payload or {})


def rent(app, day=1, amount=3000, frequency="monthly"):
    post(app, "/api/add-recurring", {
        "description": "Rent", "category": "Rent",
        "amount": amount, "frequency": frequency, "day": day,
    })
    return app.data.recurring[-1]


# ── the guard that stops the rent doubling ───────────────────────────────────

def test_a_template_is_offered_before_it_is_applied(app):
    template = rent(app)
    pending = recurring.pending(app.data.recurring, app.data.current, app.data.settled_in(app.data.current))
    assert [t.id for t in pending] == [template.id]


def test_applying_a_template_adds_its_expense(app):
    template = rent(app)
    post(app, "/api/apply-recurring", {"id": template.id})

    assert app.data.month.total_expenses() == 3000.0
    assert app.data.month.expenses[0].category == "Rent"


def test_a_template_cannot_be_applied_twice_in_the_same_month(app):
    """apply_recurring_for_month is pure and has no memory: calling it on every
    month open would double the rent on the second open."""
    template = rent(app)
    post(app, "/api/apply-recurring", {"id": template.id})

    with pytest.raises(api.ApiError):
        post(app, "/api/apply-recurring", {"id": template.id})

    assert app.data.month.total_expenses() == 3000.0


def test_an_applied_template_is_no_longer_offered(app):
    template = rent(app)
    post(app, "/api/apply-recurring", {"id": template.id})
    assert recurring.pending(app.data.recurring, app.data.current,
                             app.data.settled_in(app.data.current)) == []


def test_skipping_a_template_stops_it_asking_this_month(app):
    template = rent(app)
    post(app, "/api/skip-recurring", {"id": template.id})

    assert recurring.pending(app.data.recurring, app.data.current,
                             app.data.settled_in(app.data.current)) == []
    assert app.data.month.expenses == [], "skipping must not add anything"


def test_a_skipped_template_asks_again_next_month(app):
    """The record is per-month, so declining once does not decline forever.

    The template is created in July because start_date is the month on screen:
    one created in August cannot fire in July, and September is the future.
    """
    post(app, "/api/step-month", {"delta": -1})
    template = rent(app)
    post(app, "/api/skip-recurring", {"id": template.id})
    post(app, "/api/step-month", {"delta": 1})

    pending = recurring.pending(app.data.recurring, app.data.current,
                                app.data.settled_in(app.data.current))
    assert [t.id for t in pending] == [template.id]


def test_the_guard_survives_a_restart(app, tmp_path):
    from tests.mobile_app_modules import BudgetData
    template = rent(app)
    post(app, "/api/apply-recurring", {"id": template.id})

    reopened = BudgetData(tmp_path / "data.json", today=app._today)
    reopened.load()
    assert reopened.settled_in(reopened.current) == [template.id]
    assert recurring.pending(reopened.recurring, reopened.current,
                             reopened.settled_in(reopened.current)) == []


def test_recurring_templates_survive_a_restart(app, tmp_path):
    """_coerce_v2 listed the keys it returned, so these were saved and then
    silently dropped on the next read — which also reset the applied guard."""
    from tests.mobile_app_modules import BudgetData
    rent(app)
    post(app, "/api/add-rule", {"pattern": "vodafone", "category": "Internet"})

    reopened = BudgetData(tmp_path / "data.json", today=app._today)
    reopened.load()
    assert [t.description for t in reopened.recurring] == ["Rent"]
    assert [r.pattern for r in reopened.rules] == ["vodafone"]


def test_a_weekly_template_adds_every_occurrence_and_settles_once(app):
    """A weekly item produces several expenses in one month; they stand or
    fall together, which is why the template is the unit tracked."""
    template = rent(app, day=0, amount=100, frequency="weekly")
    post(app, "/api/apply-recurring", {"id": template.id})

    assert len(app.data.month.expenses) >= 4
    assert recurring.pending(app.data.recurring, app.data.current,
                             app.data.settled_in(app.data.current)) == []


def test_a_template_does_not_backfill_months_before_it_existed(app):
    """start_date is the month on screen, so adding rent today does not invent
    a rent payment for every month you have ever recorded."""
    rent(app)
    post(app, "/api/step-month", {"delta": -1})
    assert recurring.pending(app.data.recurring, app.data.current,
                             app.data.settled_in(app.data.current)) == []


def test_deleting_a_template_leaves_the_expenses_it_already_created(app):
    """Those were real payments in a month the user has already reconciled."""
    template = rent(app)
    post(app, "/api/apply-recurring", {"id": template.id})
    post(app, "/api/delete-recurring", {"index": 0})

    assert app.data.recurring == []
    assert app.data.month.total_expenses() == 3000.0


def test_applying_an_unknown_template_is_a_404(app):
    with pytest.raises(api.ApiError) as caught:
        post(app, "/api/apply-recurring", {"id": 99})
    assert caught.value.status == 404


@pytest.mark.parametrize("payload", [
    {}, {"description": "Rent"},
    {"description": "Rent", "category": "Rent", "amount": 0, "frequency": "monthly", "day": 1},
    {"description": "Rent", "category": "Rent", "amount": 100, "frequency": "hourly", "day": 1},
    {"description": "Rent", "category": "Rent", "amount": 100, "frequency": "monthly", "day": 40},
    {"description": "Rent", "category": "Rent", "amount": 100, "frequency": "monthly", "day": True},
    {"description": "", "category": "Rent", "amount": 100, "frequency": "monthly", "day": 1},
])
def test_an_invalid_recurring_template_is_refused(app, payload):
    with pytest.raises(api.ApiError):
        post(app, "/api/add-recurring", payload)
    assert app.data.recurring == []


def test_an_unsupported_frequency_is_refused_rather_than_never_firing(app):
    """core only expands five frequencies; anything else yields no expenses at
    all, so a typo would create a template that silently never fires."""
    with pytest.raises(api.ApiError):
        post(app, "/api/add-recurring", {
            "description": "X", "category": "Misc", "amount": 10,
            "frequency": "fortnightly", "day": 1,
        })


# ── auto-categorisation ──────────────────────────────────────────────────────

def test_a_rule_categorises_a_new_expense(app):
    post(app, "/api/add-rule", {"pattern": "vodafone", "category": "Internet"})
    post(app, "/api/add-expense", {"name": "Vodafone monthly", "amount": 400})
    assert app.data.month.expenses[0].category == "Internet"


def test_matching_is_case_insensitive_and_on_a_substring(app):
    post(app, "/api/add-rule", {"pattern": "UBER", "category": "Transport"})
    post(app, "/api/add-expense", {"name": "uber trip home", "amount": 60})
    assert app.data.month.expenses[0].category == "Transport"


def test_an_explicit_category_always_beats_a_rule(app):
    """Otherwise correcting a mis-categorised row would be undone on save."""
    post(app, "/api/add-rule", {"pattern": "uber", "category": "Transport"})
    post(app, "/api/add-expense", {"name": "uber eats", "amount": 90, "category": "Food"})
    assert app.data.month.expenses[0].category == "Food"


def test_an_unmatched_name_stays_uncategorised(app):
    post(app, "/api/add-rule", {"pattern": "vodafone", "category": "Internet"})
    post(app, "/api/add-expense", {"name": "Groceries", "amount": 200})
    assert app.data.month.expenses[0].category == "Uncategorized"


def test_the_first_matching_rule_wins(app):
    post(app, "/api/add-rule", {"pattern": "cafe", "category": "Food"})
    post(app, "/api/add-rule", {"pattern": "cafe latte", "category": "Entertainment"})
    post(app, "/api/add-expense", {"name": "Cafe latte", "amount": 40})
    assert app.data.month.expenses[0].category == "Food"


def test_a_duplicate_rule_pattern_is_refused(app):
    post(app, "/api/add-rule", {"pattern": "uber", "category": "Transport"})
    with pytest.raises(api.ApiError):
        post(app, "/api/add-rule", {"pattern": "UBER", "category": "Food"})
    assert len(app.data.rules) == 1


@pytest.mark.parametrize("payload", [{}, {"pattern": "x"}, {"category": "Food"}, {"pattern": "", "category": "Food"}])
def test_an_invalid_rule_is_refused(app, payload):
    with pytest.raises(api.ApiError):
        post(app, "/api/add-rule", payload)
    assert app.data.rules == []


def test_an_id_with_settled_history_is_never_reused(app):
    """max(existing)+1 is not enough: deleting the only template empties the
    list, so the next one would take id 1 back — along with every month the
    deleted template was accepted in, appearing already handled there."""
    first = rent(app)
    post(app, "/api/apply-recurring", {"id": first.id})
    post(app, "/api/delete-recurring", {"index": 0})

    second = rent(app)
    assert second.id != first.id

    pending = recurring.pending(app.data.recurring, app.data.current,
                                app.data.settled_in(app.data.current))
    assert [t.id for t in pending] == [second.id], "the new template must still be offered"
