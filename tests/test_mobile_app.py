"""End-to-end tests against the real app module and a real HTTP server.

Everything below goes through the same socket the WebView uses, so it exercises
app.py's wiring — routing, status codes, the state document — rather than a
re-implementation of it.
"""

import json
import urllib.error
import urllib.request

import pytest

from tests.mobile_app_modules import load_app_module

app_module = load_app_module()


@pytest.fixture
def live(tmp_path):
    """A started app with its server running, torn down afterwards."""
    instance = app_module.App("Test", "test.app", data_dir=tmp_path)
    instance.startup()
    yield instance
    instance._server.shutdown()
    instance._server.server_close()


def _url(live, path):
    return f"http://127.0.0.1:{live._port}{path}"


def get(live, path="/api/data"):
    with urllib.request.urlopen(_url(live, path)) as response:
        return response.status, json.loads(response.read())


def post(live, path, payload=None):
    body = json.dumps(payload or {}).encode()
    request = urllib.request.Request(
        _url(live, path), data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read())


# ── it starts, and it serves ─────────────────────────────────────────────────

def test_the_app_starts_and_shows_its_window(live):
    assert live.main_window.shown is True
    assert live._web.url == f"http://127.0.0.1:{live._port}/"


def test_the_page_itself_is_served(live):
    with urllib.request.urlopen(_url(live, "/")) as response:
        body = response.read().decode("utf-8")
    assert response.status == 200 and "<html" in body.lower()


def test_the_state_document_reports_the_current_month(live):
    status, state = get(live)
    assert status == 200
    assert state["month_key"] == live.data.this_month()
    assert state["is_current_month"] is True
    assert state["can_go_forward"] is False


# ── the month bar, over the wire ─────────────────────────────────────────────

def test_stepping_back_and_forward_moves_the_month(live):
    _, state = post(live, "/api/step-month", {"delta": -1})
    first = state["month_key"]
    assert state["can_go_forward"] is True

    _, state = post(live, "/api/step-month", {"delta": 1})
    assert state["month_key"] != first
    assert state["is_current_month"] is True


def test_stepping_into_the_future_is_refused_with_a_reason(live):
    status, body = post(live, "/api/step-month", {"delta": 1})
    assert status == 400 and "error" in body


def test_an_unknown_endpoint_answers_404(live):
    status, body = post(live, "/api/does-not-exist", {})
    assert status == 404 and "error" in body


def test_a_malformed_body_answers_400_not_a_traceback(live):
    request = urllib.request.Request(_url(live, "/api/add-income"), data=b"{ truncated")
    with pytest.raises(urllib.error.HTTPError) as caught:
        urllib.request.urlopen(request)
    assert caught.value.code == 400


# ── the guarantee the user asked for by name ─────────────────────────────────

def test_entries_survive_a_restart_of_the_whole_app(tmp_path):
    first = app_module.App("Test", "test.app", data_dir=tmp_path)
    first.startup()
    try:
        post(first, "/api/add-income", {"name": "راتب", "amount": 8000})
        post(first, "/api/add-expense", {"name": "إيجار", "amount": 3800, "category": "Rent"})
        post(first, "/api/step-month", {"delta": -1})
        post(first, "/api/add-income", {"name": "يوليو", "amount": 7000})
    finally:
        first._server.shutdown(); first._server.server_close()

    second = app_module.App("Test", "test.app", data_dir=tmp_path)
    second.startup()
    try:
        _, state = get(second)
        assert state["total_income"] == 7000.0, "the month being viewed is remembered"
        assert second.data.known_months() == ["2026-07", "2026-08"] or             len(second.data.known_months()) == 2, "both months survived"
        other = second.data.months[[k for k in second.data.known_months()
                                    if k != state["month_key"]][0]]
        assert other.total_income() == 8000.0, "the month navigated away from is intact"
        assert other.total_expenses() == 3800.0
    finally:
        second._server.shutdown(); second._server.server_close()


def test_a_goal_funded_over_two_months_reads_back_correctly(tmp_path):
    live = app_module.App("Test", "test.app", data_dir=tmp_path)
    live.startup()
    try:
        post(live, "/api/add-goal", {"name": "سيارة", "target": 1000, "icon": "🚗"})
        post(live, "/api/step-month", {"delta": -1})
        post(live, "/api/fund-goal", {"index": 0, "amount": 300})
        post(live, "/api/step-month", {"delta": 1})
        status, state = post(live, "/api/fund-goal", {"index": 0, "amount": 200})

        goal = state["goals"][0]
        assert status == 200
        assert goal["current"] == 500.0, "progress accumulates across months"
        assert goal["this_month"] == 200.0
        assert goal["carried_over"] is True
        assert goal["done"] is False
        assert state["total_expenses"] == 200.0, "only this month's deposit is spent here"
    finally:
        live._server.shutdown(); live._server.server_close()


def test_the_comparison_section_has_no_predecessor_until_there_is_one(live):
    _, state = get(live)
    assert state["previous"] is None

    post(live, "/api/step-month", {"delta": -1})
    post(live, "/api/add-expense", {"name": "Rent", "amount": 3000, "category": "Rent"})
    _, state = post(live, "/api/step-month", {"delta": 1})

    assert state["previous"] is not None
    assert state["previous"]["total_expenses"] == 3000.0


# ── serving files: staying inside the web directory ──────────────────────────

@pytest.mark.parametrize("path", [
    "/../app.py",
    "/../../budget_manager_mobile/app.py",
    "/..%2fapp.py",
    "/./../app.py",
])
def test_a_request_cannot_escape_the_web_directory(live, path):
    """The server is bound to loopback, but any local process can reach it."""
    try:
        with urllib.request.urlopen(_url(live, path)) as response:
            body = response.read().decode("utf-8", "replace")
        assert "BudgetAPIHandler" not in body, f"{path} served application source"
    except urllib.error.HTTPError as err:
        assert err.code in (400, 404)
