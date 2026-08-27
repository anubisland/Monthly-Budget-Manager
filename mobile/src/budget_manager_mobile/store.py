"""On-disk format for the mobile app.

Owns one concern: turning the app's data into bytes on disk and back, keyed by
month. Deliberately knows nothing about Toga, HTTP or the UI, so it is testable
on its own.

Three guarantees the previous flat-file code did not offer:

* writes are atomic — a crash mid-write cannot leave a half-written file;
* a file we cannot parse is *quarantined*, never overwritten;
* a failed write raises, so the caller can tell the user instead of losing
  data silently.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, Optional, Tuple

SCHEMA_VERSION = 2

#: Returned alongside a document to describe anything the user should be told.
#: ``None`` means "loaded normally, nothing to report".
Note = Optional[str]


# ── month keys ───────────────────────────────────────────────────────────────
# "YYYY-MM" sorts lexicographically in the same order it sorts chronologically,
# which is why it is the key rather than a (year, month) tuple.

def month_key(year: int, month: int) -> str:
    return f"{int(year):04d}-{int(month):02d}"


def parse_month_key(key: str) -> Tuple[int, int]:
    """Inverse of :func:`month_key`. Raises ValueError on anything malformed."""
    parts = str(key).split("-")
    if len(parts) != 2:
        raise ValueError(f"not a month key: {key!r}")
    year, month = int(parts[0]), int(parts[1])
    if not 1 <= month <= 12:
        raise ValueError(f"month out of range: {key!r}")
    return year, month


def is_month_key(key: object) -> bool:
    try:
        parse_month_key(str(key))
        return True
    except (ValueError, TypeError):
        return False


def shift_month(key: str, delta: int) -> str:
    """The month ``delta`` months after ``key``. Negative goes backwards."""
    year, month = parse_month_key(key)
    total = year * 12 + (month - 1) + delta
    return month_key(total // 12, total % 12 + 1)


# ── the document ─────────────────────────────────────────────────────────────

def empty_doc(current: str) -> Dict:
    return {
        "version": SCHEMA_VERSION,
        "current": current,
        "months": {},
        "goals": [],
    }


def migrate(raw: object, fallback_current: str) -> Tuple[Dict, Note]:
    """Bring any document we have ever written up to :data:`SCHEMA_VERSION`.

    ``fallback_current`` is the month to use when the document does not say.
    An unrecognised shape yields an empty document *and a note*, so the caller
    can preserve the original rather than treating it as "no data yet" — the
    distinction the old code failed to make.
    """
    if not isinstance(raw, dict):
        return empty_doc(fallback_current), "unreadable"

    version = raw.get("version")

    if version == SCHEMA_VERSION:
        return _coerce_v2(raw, fallback_current), None

    if version is None and "budget" in raw:
        return _from_v1(raw, fallback_current)

    if version is None and not raw:
        return empty_doc(fallback_current), None

    # A version we do not know: almost certainly written by a *newer* build.
    # Refuse rather than silently discarding it.
    return empty_doc(fallback_current), "future-version"


def _from_v1(raw: Dict, fallback_current: str) -> Tuple[Dict, Note]:
    """v1 was a single flat budget plus a cosmetic year/month label.

    That label is the best evidence we have of which month the budget belongs
    to, so it becomes the key. A missing or malformed label falls back to
    ``fallback_current`` rather than dropping the budget on the floor.
    """
    doc = empty_doc(fallback_current)
    key = _label_of(raw) or fallback_current

    budget = raw.get("budget")
    if isinstance(budget, dict) and budget:
        doc["months"][key] = budget
    doc["goals"] = [g for g in _as_list(raw.get("goals")) if isinstance(g, dict)]
    return doc, "migrated-v1"


def _label_of(raw: Dict) -> Optional[str]:
    """The ``year``/``month`` pair a v1 document carried, or None if unusable."""
    try:
        key = month_key(raw["year"], raw["month"])
    except (KeyError, TypeError, ValueError):
        return None
    return key if is_month_key(key) else None


def _coerce_v2(raw: Dict, fallback_current: str) -> Dict:
    """Accept a v2 document defensively: containers *and* their elements.

    Validating only the containers is how the previous generation of this code
    let ``months={"2026-08": None}`` load cleanly and then throw on first use.
    """
    months = raw.get("months")
    clean_months = {
        str(k): v
        for k, v in (months.items() if isinstance(months, dict) else ())
        if is_month_key(k) and isinstance(v, dict)
    }
    current = raw.get("current")
    return {
        "version": SCHEMA_VERSION,
        "current": str(current) if is_month_key(current) else fallback_current,
        "months": clean_months,
        "goals": [g for g in _as_list(raw.get("goals")) if isinstance(g, dict)],
    }


def _as_list(value: object) -> list:
    return value if isinstance(value, list) else []


# ── disk ─────────────────────────────────────────────────────────────────────

def read_doc(path: Path, fallback_current: str) -> Tuple[Dict, Note]:
    """Load the document at ``path``, upgrading and repairing as needed.

    Never raises: a first run and an unreadable file both have to yield a
    usable document. The note distinguishes them, and any file we could not
    use is quarantined beside it before the caller writes anything.
    """
    try:
        text = path.read_text("utf-8")
    except FileNotFoundError:
        return empty_doc(fallback_current), None
    except OSError:
        return empty_doc(fallback_current), "unreadable"

    try:
        raw = json.loads(text)
    except (ValueError, UnicodeDecodeError):
        return empty_doc(fallback_current), "corrupt"

    return migrate(raw, fallback_current)


def quarantine(path: Path) -> Optional[Path]:
    """Move ``path`` aside so a later write cannot destroy it.

    Returns where it went, or None if there was nothing to move. This is the
    step whose absence made the old code destructive: it discarded a file it
    could not parse, then overwrote it on the next save.
    """
    if not path.exists():
        return None
    for suffix in ("", *(f".{n}" for n in range(1, 100))):
        target = path.with_name(f"{path.stem}.corrupt{suffix}{path.suffix}")
        if not target.exists():
            os.replace(str(path), str(target))
            return target
    return None


def backup(path: Path) -> Optional[Path]:
    """Copy ``path`` to a ``.backup`` sibling, replacing any previous one.

    Taken before a migration writes, so the pre-migration bytes survive even
    if the migration turns out to be wrong.
    """
    if not path.exists():
        return None
    target = path.with_name(f"{path.stem}.backup{path.suffix}")
    target.write_bytes(path.read_bytes())
    return target


def write_doc(path: Path, doc: Dict) -> None:
    """Write ``doc`` atomically. Raises OSError if it could not be written.

    Raising is the point. The caller is expected to surface the failure; the
    previous ``except: pass`` meant a full disk looked exactly like a save.
    """
    payload = json.dumps(doc, indent=2, ensure_ascii=False)
    tmp = path.with_name(f"{path.name}.tmp")
    tmp.write_text(payload, "utf-8")
    os.replace(str(tmp), str(path))
