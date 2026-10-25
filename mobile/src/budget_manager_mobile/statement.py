"""Reading a bank statement pasted as CSV.

Deliberately not built on ``monthly_budget.core.read_csv``: that reads the
app's own export format, which carries a ``type`` column saying income or
expense. A bank gives you a date, a description and an amount, and expects you
to work out the rest — so the two are different problems and sharing code
between them would bend one to fit the other.

Nothing here writes anything. Parsing produces candidate rows for the user to
look at; committing them is a separate step, because dropping two hundred rows
into someone's budget unseen is not an import, it is an accident.
"""

from __future__ import annotations

import csv
import io
from typing import Dict, List, Optional, Tuple

import validate

#: Header names seen in real exports, lowercased. Matching is by substring so
#: "Transaction Date" and "Value date" both find the date column.
DATE_HEADERS = ("date", "posted", "transaction date", "value date", "التاريخ")
NAME_HEADERS = ("description", "details", "narrative", "particulars", "payee",
                "reference", "memo", "name", "البيان", "الوصف")
AMOUNT_HEADERS = ("amount", "value", "المبلغ")
DEBIT_HEADERS = ("debit", "withdrawal", "paid out", "مدين", "منصرف")
CREDIT_HEADERS = ("credit", "deposit", "paid in", "دائن", "وارد")

#: Rows beyond this are refused outright. A statement of this size is a sign
#: something else was pasted, and parsing it would hang the UI.
MAX_ROWS = 2000


class StatementError(Exception):
    """The text could not be read as a statement, with a reason to show."""


def sniff(text: str) -> csv.Dialect:
    """Work out the delimiter. Banks vary, and a semicolon file read as commas
    produces one enormous column that looks like a header problem."""
    sample = text[:4096]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel()
        dialect.delimiter = ";" if sample.count(";") > sample.count(",") else ","
        return dialect


def find_column(headers: List[str], candidates: Tuple[str, ...]) -> Optional[int]:
    """Index of the first header containing any candidate, or None.

    Exact matches are preferred over substring ones so that a file with both
    "Amount" and "Amount in account currency" picks the plain one.
    """
    lowered = [h.strip().lower() for h in headers]
    for candidate in candidates:
        if candidate in lowered:
            return lowered.index(candidate)
    for index, header in enumerate(lowered):
        if any(candidate in header for candidate in candidates):
            return index
    return None


def normalise_separators(text: str) -> str:
    """Rewrite a number into the one convention validate.amount understands.

    The most dangerous function in this module. validate.amount treats a comma
    as a thousands separator, which is right for the app's own data and wrong
    for half the world's banks: read that way "1.200,00" becomes 1.2 and
    "1200,00" becomes 120000 — a hundred times the rent. Both results are
    plausible numbers, so nothing downstream would question them.

    The rules, in order:

    * both separators present — the rightmost is the decimal point, whichever
      character it is, and the other is grouping;
    * one separator appearing more than once — grouping;
    * one separator followed by exactly three digits — grouping. "1,200" is
      genuinely ambiguous; bank amounts carry two decimals, so three digits
      after a separator means thousands far more often than not;
    * otherwise — a decimal point.
    """
    last_dot, last_comma = text.rfind("."), text.rfind(",")
    if last_dot >= 0 and last_comma >= 0:
        if last_comma > last_dot:
            return text.replace(".", "").replace(",", ".")
        return text.replace(",", "")

    separator = "." if last_dot >= 0 else ("," if last_comma >= 0 else "")
    if not separator:
        return text
    if text.count(separator) > 1:
        return text.replace(separator, "")
    if len(text) - text.rfind(separator) - 1 == 3:
        return text.replace(separator, "")
    return text.replace(separator, ".")


def parse_amount(raw: str) -> Optional[float]:
    """A statement amount, sign preserved.

    Banks write negatives three ways — a minus, parentheses, or a trailing
    DR — and separators differ by locale. ``validate.amount`` refuses negatives
    by design, so the sign is stripped here, the magnitude validated there, and
    the sign reapplied. That keeps one definition of what a number is.
    """
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None

    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative, text = True, text[1:-1]
    upper = text.upper().replace(" ", "")
    for suffix in ("DR", "DB"):
        if upper.endswith(suffix):
            negative, text = True, text[: len(text) - len(suffix)].strip()
    if upper.endswith("CR"):
        text = text[: len(text) - 2].strip()
    if text.startswith("-"):
        negative, text = True, text[1:]
    elif text.startswith("+"):
        text = text[1:]

    text = text.replace("\u00a0", "").replace(" ", "")
    for symbol in ("$", "\u00a3", "\u20ac", "\u062c.\u0645", "EGP", "USD"):
        text = text.replace(symbol, "")

    magnitude = validate.amount(normalise_separators(text), allow_zero=True)
    if magnitude is None:
        return None
    return -magnitude if negative else magnitude


def parse(text: str, month: str) -> Dict:
    """Read pasted CSV into candidate rows for ``month``.

    Returns the rows, plus counts of what was skipped and why, so the user can
    see that 40 lines produced 38 rows rather than wondering where two went.
    """
    if not text or not text.strip():
        raise StatementError("nothing to read")

    reader = csv.reader(io.StringIO(text.strip()), dialect=sniff(text))
    try:
        rows = list(reader)
    except csv.Error as err:
        raise StatementError(f"could not read the text: {err}")
    if not rows:
        raise StatementError("nothing to read")
    if len(rows) > MAX_ROWS + 1:
        raise StatementError(f"too many rows (limit {MAX_ROWS})")

    headers = rows[0]
    columns = _columns(headers)
    if columns["name"] is None:
        raise StatementError("no description column found")
    if columns["amount"] is None and columns["debit"] is None and columns["credit"] is None:
        raise StatementError("no amount column found")

    entries, skipped = [], 0
    for row in rows[1:]:
        entry = _entry(row, columns, month)
        if entry is None:
            skipped += 1
        else:
            entries.append(entry)
    return {"entries": entries, "skipped": skipped, "read": len(rows) - 1}


def _columns(headers: List[str]) -> Dict[str, Optional[int]]:
    return {
        "date": find_column(headers, DATE_HEADERS),
        "name": find_column(headers, NAME_HEADERS),
        "amount": find_column(headers, AMOUNT_HEADERS),
        "debit": find_column(headers, DEBIT_HEADERS),
        "credit": find_column(headers, CREDIT_HEADERS),
    }


def _entry(row: List[str], columns: Dict[str, Optional[int]], month: str) -> Optional[Dict]:
    """One candidate row, or None if it cannot be trusted.

    Skipped rather than guessed at: a statement usually carries running-balance
    lines and section headers among the transactions, and inventing a value for
    those would import money that was never spent.
    """
    name = validate.text(_cell(row, columns["name"]))
    if name is None:
        return None

    amount = _signed_amount(row, columns)
    if amount is None or amount == 0:
        return None

    return {
        "name": name,
        "amount": round(abs(amount), 2),
        "kind": "income" if amount > 0 else "expense",
        "date": _date(row, columns, month),
    }


def _signed_amount(row: List[str], columns: Dict[str, Optional[int]]) -> Optional[float]:
    """Positive for money in, negative for money out.

    Two layouts exist and they disagree about sign. A single amount column
    carries it; separate debit and credit columns are both written positive,
    and the column decides. Reading the second as the first turns every
    withdrawal into income.
    """
    if columns["amount"] is not None:
        amount = parse_amount(_cell(row, columns["amount"]))
        if amount is not None and amount != 0:
            return amount

    debit = parse_amount(_cell(row, columns["debit"])) if columns["debit"] is not None else None
    if debit:
        return -abs(debit)
    credit = parse_amount(_cell(row, columns["credit"])) if columns["credit"] is not None else None
    if credit:
        return abs(credit)
    return None


def _cell(row: List[str], index: Optional[int]) -> str:
    if index is None or index >= len(row):
        return ""
    return row[index]


def _date(row: List[str], columns: Dict[str, Optional[int]], month: str) -> str:
    """The row's date if it is readable and inside ``month``, else the 1st.

    A date from another month is dropped rather than kept: the import lands in
    one month, and a row dated outside it would claim to belong somewhere it
    is not stored.
    """
    raw = _cell(row, columns["date"]).strip()
    parsed = _read_date(raw)
    if parsed and parsed.startswith(month):
        return parsed
    return f"{month}-01"


def _read_date(raw: str) -> Optional[str]:
    """ISO, or day/month/year with any of - / . as the separator."""
    if not raw:
        return None
    iso = validate.date_text(raw[:10])
    if iso:
        return iso
    for separator in ("/", "-", "."):
        parts = raw.split(separator)
        if len(parts) == 3 and all(p.strip().isdigit() for p in parts):
            day, month_part, year = (p.strip() for p in parts)
            if len(year) == 2:
                year = "20" + year
            candidate = f"{year}-{int(month_part):02d}-{int(day):02d}"
            if validate.date_text(candidate):
                return candidate
    return None


def mark_duplicates(entries: List[Dict], budget) -> List[Dict]:
    """Flag candidates that already exist in ``budget``.

    Pasting the same statement twice is the obvious mistake, and an import
    that silently doubled a month would be worse than one that refused to run.
    Matching is on name, amount and date together — the three a bank line
    carries — and a repeat within the paste is flagged too, since the same
    coffee bought twice on one day is indistinguishable from a duplicated row.

    Flagged, not removed: only the user knows whether they really did buy the
    same coffee twice, so the decision is theirs at the preview.
    """
    existing = set()
    for row in list(budget.incomes) + list(budget.expenses):
        existing.add(_key(row.name, row.amount, row.date or ""))

    seen = set()
    for entry in entries:
        key = _key(entry["name"], entry["amount"], entry["date"])
        entry["duplicate"] = key in existing or key in seen
        seen.add(key)
    return entries


def _key(name: str, amount: float, date: str) -> Tuple[str, float, str]:
    return (str(name).strip().lower(), round(float(amount), 2), str(date))
