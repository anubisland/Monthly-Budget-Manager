"""Writing a report as a spreadsheet.

Thin by design: every decision about *what* the report contains lives in
``report.py``, which needs nothing installed. This module only knows how to
put those tables into a file.

XlsxWriter is already a build dependency of the mobile app and was reachable
from nothing — the export button in the UI was a message saying to use the
desktop app instead.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List


#: Every word the spreadsheet shows. English here is the fallback; the page
#: sends its own translations with the request, so the words in the file are
#: the same ones on screen. Translating them again in Python would create a
#: second source that drifts from the first — the sheet came out in English
#: under an Arabic interface because it had no idea a language existed.
LABELS = {
    "report": "Budget report",
    "summary": "Summary", "entries": "Entries", "goals": "Goals", "trend": "Trend",
    "amount": "Amount", "income": "Income", "expenses": "Expenses",
    "net": "Net", "budget": "Budget", "margin": "Margin",
    "by_category": "By category", "category": "Category", "share": "Share",
    "date": "Date", "name": "Name",
    "goal": "Goal", "target": "Target", "funded": "Funded",
    "remaining": "Remaining", "progress": "Progress", "this_month": "This month",
    "done": "Done", "yes": "Yes", "no": "No",
    "month": "Month", "recent_months": "Recent months", "average_over": "Average over {n} month(s)",
}


def _labels(report: Dict) -> Dict:
    """The report's own labels over the English defaults."""
    merged = dict(LABELS)
    supplied = report.get("labels")
    if isinstance(supplied, dict):
        for key, value in supplied.items():
            if key in merged and isinstance(value, str) and value.strip():
                merged[key] = value.strip()
    return merged

class ExportError(Exception):
    """The file could not be written, with a reason to show the user."""


def write(report: Dict, path: Path) -> Path:
    """Write ``report`` to ``path``. Raises ExportError on any failure.

    Raising rather than returning a flag: an export that quietly produced
    nothing would be the same silent failure the save path used to have, and
    the user would go looking for a file that was never written.
    """
    try:
        import xlsxwriter
        import xlsxwriter.exceptions
    except ImportError as err:
        raise ExportError(f"spreadsheet support is unavailable: {err}")

    # XlsxWriter wraps filesystem errors in its own exception hierarchy, which
    # does NOT descend from OSError: a permission failure arrives as
    # FileCreateError. Catching OSError here looks thorough and catches
    # nothing the library actually raises, so the failure would reach the user
    # as a crash instead of a message.
    failures = (OSError, ValueError, TypeError, xlsxwriter.exceptions.XlsxWriterException)

    path = Path(path)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        workbook = xlsxwriter.Workbook(str(path), {"in_memory": True})
    except failures as err:
        raise ExportError(f"could not create the file: {err}")

    try:
        styles = _styles(workbook, report.get("currency", ""))
        L = _labels(report)
        _summary_sheet(workbook, styles, report, L)
        _entries_sheet(workbook, styles, report, L)
        _goals_sheet(workbook, styles, report, L)
        _trend_sheet(workbook, styles, report, L)
        workbook.close()
    except failures as err:
        raise ExportError(f"could not write the file: {err}")
    return path


def _styles(workbook, currency: str) -> Dict:
    # The currency must be quoted. Unquoted letters in an Excel number format
    # are format codes, not text: D is day, M is month, S is second. The app
    # stores a three-letter code, so "USD#,##0.00" is read as a date format and
    # every money cell renders as 09/04/1923 instead of a number — for USD, the
    # default, and for most of the currencies in the list. A stray quote inside
    # the value would end the literal and produce a file Excel refuses to open,
    # so it is stripped first.
    safe = str(currency).replace('"', "")
    money = f'"{safe}"#,##0.00' if safe else '#,##0.00'
    return {
        "title": workbook.add_format({"bold": True, "font_size": 14}),
        "head": workbook.add_format({"bold": True, "bg_color": "#EEEEEE", "border": 1}),
        "money": workbook.add_format({"num_format": money}),
        "percent": workbook.add_format({"num_format": '0.0"%"'}),
        "text": workbook.add_format({}),
    }


def _table(sheet, styles, row: int, headers: List[str], rows: List[List], widths=None) -> int:
    """Write a header row and its data. Returns the next free row."""
    for column, header in enumerate(headers):
        sheet.write(row, column, header, styles["head"])
    if widths:
        for column, width in enumerate(widths):
            sheet.set_column(column, column, width)

    for offset, values in enumerate(rows, start=1):
        for column, (value, style) in enumerate(values):
            sheet.write(row + offset, column, value, styles[style])
    return row + len(rows) + 2


def _summary_sheet(workbook, styles, report: Dict, L: Dict) -> None:
    sheet = workbook.add_worksheet(L["summary"])
    sheet.write(0, 0, f"{L['report']} — {report['month']}", styles["title"])

    summary = report["summary"]
    row = _table(sheet, styles, 2, ["", L["amount"]], [
        [(L["income"], "text"), (summary["income"], "money")],
        [(L["expenses"], "text"), (summary["expenses"], "money")],
        [(L["net"], "text"), (summary["net"], "money")],
        [(L["budget"], "text"), (summary["budget"], "money")],
        [(L["margin"], "text"), (summary["margin"], "percent")],
    ], widths=[22, 16, 12])

    sheet.write(row, 0, L["by_category"], styles["title"])
    _table(sheet, styles, row + 1, [L["category"], L["amount"], L["share"]], [
        [(item["category"], "text"), (item["amount"], "money"), (item["share"], "percent")]
        for item in report["categories"]
    ])


def _entries_sheet(workbook, styles, report: Dict, L: Dict) -> None:
    """Income and expenses on one sheet, each as its own table.

    One sheet rather than two: the question a reader has is "what happened
    this month", and answering it should not need tab switching.
    """
    sheet = workbook.add_worksheet(L["entries"])
    sheet.write(0, 0, L["income"], styles["title"])
    row = _table(sheet, styles, 1, [L["date"], L["name"], L["amount"]], [
        [(item["date"], "text"), (item["name"], "text"), (item["amount"], "money")]
        for item in report["incomes"]
    ], widths=[12, 30, 14, 18])

    sheet.write(row, 0, L["expenses"], styles["title"])
    _table(sheet, styles, row + 1, [L["date"], L["name"], L["amount"], L["category"]], [
        [(item["date"], "text"), (item["name"], "text"),
         (item["amount"], "money"), (item["category"], "text")]
        for item in report["expenses"]
    ])


def _goals_sheet(workbook, styles, report: Dict, L: Dict) -> None:
    sheet = workbook.add_worksheet(L["goals"])
    sheet.write(0, 0, L["goals"], styles["title"])
    _table(sheet, styles, 1,
           [L["goal"], L["target"], L["funded"], L["remaining"],
            L["progress"], L["this_month"], L["done"]], [
               [(g["name"], "text"), (g["target"], "money"), (g["funded"], "money"),
                (g["remaining"], "money"), (g["percent"], "percent"),
                (g["this_month"], "money"), (L["yes"] if g["done"] else L["no"], "text")]
               for g in report["goals"]
           ], widths=[24, 14, 14, 14, 12, 14, 8])


def _trend_sheet(workbook, styles, report: Dict, L: Dict) -> None:
    sheet = workbook.add_worksheet(L["trend"])
    sheet.write(0, 0, L["recent_months"], styles["title"])
    # An empty month is written as a blank row rather than zeros: the
    # spreadsheet carries the same distinction the chart does, since a zero
    # would be averaged and charted as a real result.
    _table(sheet, styles, 1, [L["month"], L["income"], L["expenses"], L["net"]], [
        [(point["month"], "text")] + (
            [("", "text"), ("", "text"), ("", "text")] if point["empty"] else
            [(point["income"], "money"), (point["expenses"], "money"), (point["net"], "money")]
        )
        for point in report["trend"]
    ], widths=[12, 14, 14, 14])

    average = report["trend_average"]
    row = len(report["trend"]) + 4
    sheet.write(row, 0, L["average_over"].replace("{n}", str(average["months"])), styles["head"])
    sheet.write(row, 1, average["income"], styles["money"])
    sheet.write(row, 2, average["expenses"], styles["money"])
    sheet.write(row, 3, average["net"], styles["money"])
