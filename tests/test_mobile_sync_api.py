"""Tests for the document-level sync endpoints: GET /api/doc and
POST /api/sync-apply.

These are the only surfaces sync.js needs from the host: it reads the whole
saved document to push, and hands a pulled document back to be applied. Both
go through the real HTTP server, the way the WebView reaches them.
"""

import json
import urllib.request

import pytest

from tests.mobile_app_modules import load_app_module

app_module = load_app_module()


@pytest.fixture
def live(tmp_path):
    instance = app_module.App("Test", "test.app", data_dir=tmp_path)
    instance.startup()
    yield instance
    instance._server.shutdown()
    instance._server.server_close()


def _url(live, path):
    return f"http://127.0.0.1:{live._port}{path}"


def get(live, path):
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


# ── GET /api/doc ────────────────────────────────────────────────────────────

def test_doc_returns_the_whole_saved_document_not_one_month(live):
    """It is the all-months form store writes to disk, not the /api/data view."""
    post(live, "/api/set-month", {"month": "2026-05"})
    post(live, "/api/add-income", {"name": "May salary", "amount": 4000})
    post(live, "/api/set-month", {"month": "2026-06"})
    post(live, "/api/add-expense", {"name": "Rent", "amount": 900, "category": "Home"})

    status, doc = get(live, "/api/doc")
    assert status == 200
    assert doc["version"] == 2
    assert doc["current"] == "2026-06"
    # Both months are present, not just the one on screen.
    assert set(doc["months"]) == {"2026-05", "2026-06"}
    assert doc["months"]["2026-05"]["incomes"][0]["name"] == "May salary"


# ── POST /api/sync-apply ────────────────────────────────────────────────────

def _doc_with_income(month, name, amount):
    return {
        "version": 2,
        "current": month,
        "months": {month: {"incomes": [{"name": name, "amount": amount}],
                           "expenses": [], "total_budget": 0}},
        "goals": [],
    }


def test_sync_apply_replaces_local_data_and_state_reflects_it(live):
    post(live, "/api/add-income", {"name": "Local", "amount": 1})

    status, _ = post(live, "/api/sync-apply", {"doc": _doc_with_income("2026-07", "Remote", 777)})
    assert status == 200

    _, state = get(live, "/api/data")
    assert state["month_key"] == "2026-07"
    names = [i["name"] for i in state["incomes"]]
    assert names == ["Remote"]
    assert state["total_income"] == 777


def test_sync_apply_writes_the_current_data_aside_first(live):
    """A wrong pull must stay reversible the way a restore is: the document it
    overwrote is kept as a safety copy."""
    post(live, "/api/add-income", {"name": "Keepme", "amount": 50})
    _, before = get(live, "/api/doc")

    post(live, "/api/sync-apply", {"doc": _doc_with_income("2026-07", "Other", 1)})

    safety = live.export_path(f"before-sync-{before['current']}.json")
    assert safety.exists()
    assert json.loads(safety.read_text("utf-8")) == before


def test_sync_apply_refuses_a_foreign_document_without_touching_data(live):
    post(live, "/api/add-income", {"name": "Local", "amount": 1})

    status, body = post(live, "/api/sync-apply", {"doc": {"nonsense": True}})
    assert status == 400
    assert "error" in body

    _, state = get(live, "/api/data")
    assert [i["name"] for i in state["incomes"]] == ["Local"]


def test_sync_apply_refuses_a_doc_from_the_future(live):
    status, body = post(live, "/api/sync-apply", {"doc": {"version": 99, "months": {}}})
    assert status == 400


def test_sync_apply_requires_a_doc_object(live):
    for payload in ({}, {"doc": "text"}, {"doc": [1, 2]}):
        status, body = post(live, "/api/sync-apply", payload)
        assert status == 400, payload
