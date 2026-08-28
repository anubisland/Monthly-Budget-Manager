"""Every handler the page names must exist.

This file exists because of a defect that 580 tests missed. The restore
functions were written, then silently removed when a later edit replaced the
range of text they sat in. The button stayed in the HTML calling
`toggleRestore()`, which no longer existed, so the feature was dead on the
device — and every restore test passed, because they all called the Python
route directly and none of them opened the page.

The lesson is about where tests were pointed, not how many there were. These
check the seam between the page and the code behind it, which is where that
defect lived and where nothing was looking.
"""

import re
from pathlib import Path

import pytest

from tests.mobile_app_modules import load_app_module

PAGE = (Path(load_app_module().__file__).parent / "web" / "index.html").read_text("utf-8")

#: Functions the browser provides, so a reference to one is not a missing
#: definition.
BUILT_IN = {
    "setTimeout", "clearTimeout", "parseInt", "parseFloat", "isNaN",
    "String", "Number", "Math", "JSON", "Object", "Array", "Date",
    "fetch", "alert", "confirm", "prompt", "encodeURIComponent",
}


def _defined() -> set:
    return set(re.findall(r"(?:async\s+)?function\s+(\w+)\s*\(", PAGE))


def test_every_onclick_names_a_function_that_exists():
    """The exact defect: a button calling a function that had been deleted."""
    handlers = set(re.findall(r'onclick="(\w+)\(', PAGE))
    missing = sorted(handlers - _defined() - BUILT_IN)
    assert not missing, f"buttons call functions that do not exist: {missing}"


def test_every_handler_in_generated_markup_exists_too():
    """Buttons built inside template strings are the easier ones to lose:
    they are not visible as markup, so nothing about the page looks wrong."""
    handlers = set(re.findall(r"onclick=\?[\"']\s*(\w+)\(", PAGE))
    missing = sorted(handlers - _defined() - BUILT_IN)
    assert not missing, f"generated markup calls: {missing}"


@pytest.mark.parametrize("feature,button,handler", [
    ("restore", "btn-restore", "toggleRestore"),
    ("backup", "btn-backup", "backup"),
    ("export", "btn-export", "exportXLSX"),
    ("reset", "btn-reset", "resetAll"),
    ("add rule", "btn-add-rule", "addRule"),
    ("add recurring", "btn-add-recurring", "addRecurring"),
])
def test_each_settings_feature_is_wired_end_to_end(feature, button, handler):
    """Named one by one so a failure says which feature is dead, rather than
    that some count changed."""
    assert f'id="{button}"' in PAGE, f"{feature}: the button is missing"
    assert re.search(rf'id="{button}"[^>]*onclick="{handler}\(', PAGE), \
        f"{feature}: the button does not call {handler}"
    assert re.search(rf"(?:async\s+)?function\s+{handler}\s*\(", PAGE), \
        f"{feature}: {handler} is not defined"


@pytest.mark.parametrize("route", [
    "/api/preview-restore", "/api/restore", "/api/backup-file", "/api/export",
    "/api/add-rule", "/api/add-recurring", "/api/apply-recurring",
    "/api/fund-goal", "/api/step-month", "/api/set-month",
])
def test_the_page_calls_every_route_it_should(route):
    """A route with no caller is a feature the server offers and the app never
    asks for — which is what a dead button amounts to."""
    assert route in PAGE, f"nothing in the page calls {route}"


def test_every_route_the_page_calls_is_one_the_server_serves():
    """The other direction: a typo in a path would 404 at the user rather
    than at the suite."""
    from tests.mobile_app_modules import api

    called = set(re.findall(r"'(/api/[a-z-]+)'", PAGE))
    served = set(api.ROUTES) | {"/api/data", "/api/backup"}
    unknown = sorted(called - served)
    assert not unknown, f"the page calls routes that do not exist: {unknown}"
