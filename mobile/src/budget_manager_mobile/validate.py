"""Turning untrusted values into trusted ones.

Both entry points need this and need it to agree: values read off disk (a file
that may have been edited, truncated or written by another build) and values
arriving over the local HTTP API from the WebView. Keeping one implementation
means a payload that is rejected by one is rejected by the other.

Every function returns ``None`` for "not usable" rather than raising, because
every caller has to decide for itself whether that means "drop this row" or
"reject this request".
"""

from __future__ import annotations

from typing import Optional

#: Amounts above this are rejected as data-entry accidents rather than money.
#: Chosen well above any plausible personal budget while staying far from the
#: float range where addition stops being exact.
MAX_AMOUNT = 1e12


def amount(value: object, allow_zero: bool = False) -> Optional[float]:
    """A finite, non-negative float, or None.

    Rejects, in order of how easily each slips through:

    * ``bool`` — ``isinstance(True, int)`` is true in Python, so an unguarded
      numeric check accepts ``True`` and files it as 1.00;
    * ``NaN`` — the only value not equal to itself, and it poisons every total
      it reaches without raising anywhere;
    * infinities, and anything past :data:`MAX_AMOUNT`;
    * negatives, which the UI has no way to enter and no way to display.

    Strings are accepted with thousands separators stripped, because
    ``float('1,500.00')`` raises and the obvious fallback turns a rent into
    zero.
    """
    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        result = float(value)
    elif isinstance(value, str):
        try:
            result = float(value.replace(",", "").replace("\u066c", "").strip())
        except ValueError:
            return None
    else:
        return None

    if result != result or abs(result) == float("inf"):
        return None
    if abs(result) > MAX_AMOUNT:
        return None
    if result < 0:
        return None
    if result == 0 and not allow_zero:
        return None
    return round(result, 2)


def index(value: object, length: int) -> Optional[int]:
    """A position that really is inside a list of ``length``.

    Negative values are refused rather than wrapped. Python's ``pop(-1)``
    removes the *last* item, so passing an unchecked index through means a
    request for row -1 silently deletes a row the user never named.
    """
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if not 0 <= value < length:
        return None
    return value


def text(value: object, limit: int = 120) -> Optional[str]:
    """A non-empty single-line string, trimmed and length-capped.

    Newlines are stripped because the UI renders names in a single row, and an
    unbounded name is a way to make the stored file grow without adding data.
    """
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    if not cleaned:
        return None
    return cleaned[:limit]


def date_text(value: object) -> Optional[str]:
    """A ``YYYY-MM-DD`` string, or None. Does not check the day is real."""
    if not isinstance(value, str):
        return None
    parts = value.strip().split("-")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        return None
    if (len(parts[0]), len(parts[1]), len(parts[2])) != (4, 2, 2):
        return None
    if not 1 <= int(parts[1]) <= 12 or not 1 <= int(parts[2]) <= 31:
        return None
    return "-".join(parts)
