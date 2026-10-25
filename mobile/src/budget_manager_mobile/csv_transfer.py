"""A month as a comma-separated file, and that file as rows again.

The spreadsheet export already exists, but a spreadsheet is for reading. A CSV
is for moving: into another budget app, into a spreadsheet on a computer, or
back into this one after someone edited the rows in Excel.

The column order is ``type,name,category,amount,date`` — the same one the web
app writes and reads, so a file from either app opens in the other. Quoting is
the conservative form: every field is quoted and inner quotes are doubled,
which is what spreadsheet programs emit and what they expect to read.

Import is deliberately picky in one direction only: a row is accepted when its
type, name and amount are usable, and refused (with a reason and its line
number) otherwise. A date that cannot be read is not a reason to lose an
expense — it falls back to the month being imported into.
"""

from __future__ import annotations

import csv
import io
from typing import Dict, List, Optional, Tuple

HEADER = ("type", "name", "category", "amount", "date")

#: What a user might type in the type column. Excel loves to capitalise these.
_INCOME_WORDS = {"income", "in", "inc", "دخل", "إيراد", "ايراد"}
_EXPENSE_WORDS = {"expense", "out", "exp", "مصروف", "مصروفات", "خرج"}


def build(budget, month: str = "") -> str:
    """The month as CSV text, one line per entry.

    ``month`` is only used to fill a missing date, the way the web export does:
    a row with no date belongs to the month it came from.
    """
    out = io.StringIO()
    out.write(",".join(f'"{h}"' for h in HEADER) + "\n")
    for item in getattr(budget, "incomes", []):
        _write(out, "income", item.name, "", item.amount, item.date or month)
    for item in getattr(budget, "expenses", []):
        _write(
            out, "expense", item.name, getattr(item, "category", ""), item.amount,
            item.date or month,
        )
    return out.getvalue()


def _write(out, kind: str, name: str, category: str, amount: float, date: str) -> None:
    fields = [
        kind,
        name or "",
        category or "",
        f"{float(amount):.2f}",
        date or "",
    ]
    out.write(",".join('"' + str(f).replace('"', '""') + '"' for f in fields) + "\n")


def parse(text: str, default_date: str = "") -> Tuple[List[Dict], List[Dict]]:
    """``(rows, problems)`` — usable rows, and one record per refused line.

    Each problem is ``{"line": n, "reason": "..."}``. Reasons are short keys,
    not sentences: the caller translates them, because this module has no idea
    what language the screen is in.
    """
    # Excel writes a byte-order mark before the header, which would otherwise
    # make the first column name "\ufefftype" and hide the header row.
    reader = csv.reader(io.StringIO((text or "").lstrip("\ufeff")))
    rows: List[Dict] = []
    problems: List[Dict] = []
    header: Optional[List[str]] = None

    for line, raw in enumerate(reader, start=1):
        fields = [(f or "").strip() for f in raw]
        if not any(fields):
            continue  # A blank line between blocks is not an error.
        lowered = [f.lower() for f in fields]
        if header is None:
            if "name" in lowered and "amount" in lowered:
                header = lowered
                continue
            # No header: treat the line as data with the standard order, which
            # is what a hand-written file looks like.
            header = list(HEADER)

        row, reason = _row(fields, header, default_date)
        if row is None:
            problems.append({"line": line, "reason": reason})
        else:
            rows.append(row)

    if header is None:
        problems.append({"line": 0, "reason": "empty"})
    return rows, problems


def _cell(fields: List[str], header: List[str], name: str) -> str:
    if name not in header:
        return ""
    index = header.index(name)
    return fields[index] if index < len(fields) else ""


def _row(fields: List[str], header: List[str], default_date: str):
    kind_text = _cell(fields, header, "type").lower()
    if kind_text in _INCOME_WORDS:
        kind = "income"
    elif kind_text in _EXPENSE_WORDS or not kind_text:
        # No type column at all means an expense: it is the common case, and a
        # guessed income would inflate the month's headline number.
        kind = "expense"
    else:
        return None, "type"

    name = _cell(fields, header, "name")[:80]
    if not name:
        return None, "name"

    amount_text = _cell(fields, header, "amount").replace(",", "").replace(" ", "")
    try:
        amount = float(amount_text)
    except ValueError:
        return None, "amount"
    if amount <= 0:
        return None, "amount"

    date = _cell(fields, header, "date")[:10]
    if not _looks_like_date(date):
        date = default_date

    category = _cell(fields, header, "category")[:40] if kind == "expense" else ""
    return {
        "kind": kind,
        "name": name,
        "category": category,
        "amount": amount,
        "date": date,
    }, None


def _looks_like_date(value: str) -> bool:
    if len(value) != 10 or value[4] != "-" or value[7] != "-":
        return False
    return value[:4].isdigit() and value[5:7].isdigit() and value[8:].isdigit()
