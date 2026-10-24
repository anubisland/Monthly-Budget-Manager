"""One version number, enforced.

The repository used to carry four of them: `pyproject.toml` said 1.0.0, the
package said 2.0.0, the Briefcase project said 1.2.2, and the release tags used
a date scheme. `mobile/pyproject.toml` cannot be dynamic — Briefcase needs a
literal — so the single source in `monthly_budget/__init__.py` can only stay
single if something fails when the two drift apart.

Parsed with a regex rather than `tomllib`, which needs Python 3.11; CI also runs
the suite on 3.10.
"""

from __future__ import annotations

import re
from pathlib import Path

import monthly_budget

ROOT = Path(__file__).resolve().parent.parent


def _mobile_version() -> str:
    text = (ROOT / "mobile" / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
    assert match, "mobile/pyproject.toml has no version"
    return match.group(1)


def test_mobile_version_matches_the_package():
    assert _mobile_version() == monthly_budget.__version__


def test_release_gate_reads_the_package_not_a_shim():
    """The gate grepped `budget_manager.py`, which re-exports but never defines
    `__version__`, so the comparison silently skipped. It must point at the
    package, and the package must actually define a literal there."""
    workflow = (ROOT / ".github" / "workflows" / "release-gates.yml").read_text(encoding="utf-8")
    gate = workflow.split("Verify version on tag", 1)[1]
    # The line that reads the version, not every mention of a filename: the
    # surrounding comments name the old target on purpose.
    reads = [line for line in gate.splitlines() if "CODE_VERSION=" in line]
    assert reads, "the version gate no longer computes CODE_VERSION"
    assert "monthly_budget/__init__.py" in reads[0]
    assert "budget_manager.py" not in reads[0]


def test_version_is_a_literal_so_the_build_can_read_it_statically():
    source = (ROOT / "monthly_budget" / "__init__.py").read_text(encoding="utf-8")
    assert re.search(r'^__version__\s*=\s*"[0-9]+\.[0-9]+\.[0-9]+"$', source, re.MULTILINE)
