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

import ast
import re
from pathlib import Path

import pytest

from tests.mobile_app_modules import load_app_module

MOBILE = Path(load_app_module().__file__).parent
PAGE = (MOBILE / "web" / "index.html").read_text("utf-8")

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
    "/api/fund-goal", "/api/step-month", "/api/set-month",
    "/api/add-income", "/api/add-expense", "/api/add-goal", "/api/set-budget",
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


def test_every_function_the_page_calls_is_defined():
    """The failure mode that produced this file, and then repeated three times
    while removing a feature.

    Editing this page by cutting between two text anchors takes everything
    between them. When the second anchor moves — because an earlier edit
    changed the file — the cut silently swallows unrelated functions. That is
    how the restore panel, the trend chart and the pace marker each stopped
    existing while the code calling them stayed put.

    A reference with no definition is the signature of that mistake, whatever
    caused it.
    """
    called = set(re.findall(r"\b(\w+)\(\)\s*;", PAGE))
    called |= set(re.findall(r"\$\{(\w+)\(", PAGE))
    called |= set(re.findall(r'onclick="(\w+)\(', PAGE))

    #: Methods reached on an object are not functions this page defines, and
    #: neither are arrow functions held in a local variable — `let bar = v =>`
    #: is called by name but is not a declaration. Counting those would make
    #: the check cry wolf, and a test that cries wolf gets switched off,
    #: taking the real warning with it.
    on_something = set(re.findall(r"\.(\w+)\(", PAGE))
    arrows = set(re.findall(r"(?:let|const|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*=>", PAGE))
    missing = sorted(called - _defined() - BUILT_IN - on_something - arrows)
    assert not missing, f"called but never defined: {missing}"


def test_every_uppercase_constant_the_page_uses_is_declared():
    """A constant read but never declared is a typo the page fails on silently.

    Only count a name where it is actually *read* — indexed, called, or a
    member expression whose dot is followed by an identifier. Matching every
    capitalised word instead flagged the DOCTYPE, prose in comments, and the
    tail of camelCase names like exportXLSX. A check that cries wolf gets
    switched off, taking the real warning with it.
    """
    read = re.compile(
        r"(?<![A-Za-z0-9_$])([A-Z][A-Z_0-9]{3,})(?:\s*[\[(]|\.[A-Za-z_])"
    )
    used = set(read.findall(PAGE))
    declared = set(re.findall(r"(?:const|let|var)\s+([A-Z][A-Z_0-9]{3,})\s*=", PAGE))
    #: Browser globals, not ours to declare.
    globals_ = {"JSON"}
    missing = sorted(used - declared - globals_)
    assert not missing, f"used but never declared: {missing}"


def test_the_file_runs_the_same_direction_as_the_screen():
    """The exported sheet's direction and the page's own must come from one
    rule. Written out twice they drift, and the file then disagrees with the
    interface it was exported from."""
    assert "function isRTL()" in PAGE
    assert "dir = isRTL()" in PAGE, "the page direction bypasses the rule"
    assert "rtl: isRTL()" in PAGE, "the export bypasses the rule"
    assert "rtl: state.lang" not in PAGE, "a second copy of the rule came back"


def test_the_page_sends_every_label_the_spreadsheet_uses():
    """A label added to xlsx.py but not to reportLabels() falls back to its
    English default, so it appears in English inside an Arabic file — and only
    someone reading that file would ever see it."""
    source = (MOBILE / "xlsx.py").read_text("utf-8")
    defaults = set(re.findall(
        r'"(\w+)":\s*"', re.search(r"LABELS = \{(.*?)\n\}", source, re.S).group(1)))
    sent = set(re.findall(
        r"(\w+):\s*t\(",
        re.search(r"function reportLabels\(\)\s*\{(.*?)\n\}", PAGE, re.S).group(1)))
    missing = sorted(defaults - sent)
    assert not missing, f"the file uses these but the page never sends them: {missing}"


def test_the_export_sends_everything_the_writer_presents():
    """Three times now the same bug: a value stored one way and displayed
    another reached the file in its stored form — English category names, then
    the reading direction, then the currency code behind its symbol. Every key
    the presentation step reads must be one the page actually sends.

    Read from the syntax tree rather than by matching text. A regex over
    _presentation stops seeing anything the moment that function is split —
    which is the refactor this project's own conventions push toward — and an
    empty set of reads passes for ever while guarding nothing.
    """
    tree = ast.parse((MOBILE / "api.py").read_text("utf-8"))
    presentation = next(
        node for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == "_presentation"
    )
    helpers = {
        node.func.id for node in ast.walk(presentation)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }
    bodies = [presentation] + [
        node for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name in helpers
    ]
    read = {
        call.args[0].value
        for body in bodies for call in ast.walk(body)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Attribute) and call.func.attr == "get"
        and call.args and isinstance(call.args[0], ast.Constant)
        and isinstance(call.args[0].value, str)
    }
    sent = set(re.findall(
        r"(\w+):", re.search(r"/api/export',\s*\{(.*?)\}\)\)", PAGE, re.S).group(1)))
    #: _export reads the month itself, before presentation runs.
    missing = sorted(read - sent - {"month"})
    assert not missing, f"the writer reads these but the page never sends them: {missing}"
