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
        _summary_sheet(workbook, styles, report)
        _entries_sheet(workbook, styles, report)
        _goals_sheet(workbook, styles, report)
        _trend_sheet(workbook, styles, report)
        workbook.close()
    except failures as err:
        raise ExportError(f"could not write the file: {err}")
    return path


def _styles(workbook, currency: str) -> Dict:
    money = f'{currency}#,##0.00' if currency else '#,##0.00'
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


def _summary_sheet(workbook, styles, report: Dict) -> None:
    sheet = workbook.add_worksheet("Summary")
    sheet.write(0, 0, f"Budget report — {report['month']}", styles["title"])

    summary = report["summary"]
    row = _table(sheet, styles, 2, ["", "Amount"], [
        [("Income", "text"), (summary["income"], "money")],
        [("Expenses", "text"), (summary["expenses"], "money")],
        [("Net", "text"), (summary["net"], "money")],
        [("Budget", "text"), (summary["budget"], "money")],
        [("Margin", "text"), (summary["margin"], "percent")],
    ], widths=[22, 16, 12])

    sheet.write(row, 0, "By category", styles["title"])
    _table(sheet, styles, row + 1, ["Category", "Amount", "Share"], [
        [(item["category"], "text"), (item["amount"], "money"), (item["share"], "percent")]
        for item in report["categories"]
    ])


def _entries_sheet(workbook, styles, report: Dict) -> None:
    """Income and expenses on one sheet, each as its own table.

    One sheet rather than two: the question a reader has is "what happened
    this month", and answering it should not need tab switching.
    """
    sheet = workbook.add_worksheet("Entries")
    sheet.write(0, 0, "Income", styles["title"])
    row = _table(sheet, styles, 1, ["Date", "Name", "Amount"], [
        [(item["date"], "text"), (item["name"], "text"), (item["amount"], "money")]
        for item in report["incomes"]
    ], widths=[12, 30, 14, 18])

    sheet.write(row, 0, "Expenses", styles["title"])
    _table(sheet, styles, row + 1, ["Date", "Name", "Amount", "Category"], [
        [(item["date"], "text"), (item["name"], "text"),
         (item["amount"], "money"), (item["category"], "text")]
        for item in report["expenses"]
    ])


def _goals_sheet(workbook, styles, report: Dict) -> None:
    sheet = workbook.add_worksheet("Goals")
    sheet.write(0, 0, "Goals", styles["title"])
    _table(sheet, styles, 1,
           ["Goal", "Target", "Funded", "Remaining", "Progress", "This month", "Done"], [
               [(g["name"], "text"), (g["target"], "money"), (g["funded"], "money"),
                (g["remaining"], "money"), (g["percent"], "percent"),
                (g["this_month"], "money"), ("yes" if g["done"] else "no", "text")]
               for g in report["goals"]
           ], widths=[24, 14, 14, 14, 12, 14, 8])


def _trend_sheet(workbook, styles, report: Dict) -> None:
    sheet = workbook.add_worksheet("Trend")
    sheet.write(0, 0, "Recent months", styles["title"])
    # An empty month is written as a blank row rather than zeros: the
    # spreadsheet carries the same distinction the chart does, since a zero
    # would be averaged and charted as a real result.
    _table(sheet, styles, 1, ["Month", "Income", "Expenses", "Net"], [
        [(point["month"], "text")] + (
            [("", "text"), ("", "text"), ("", "text")] if point["empty"] else
            [(point["income"], "money"), (point["expenses"], "money"), (point["net"], "money")]
        )
        for point in report["trend"]
    ], widths=[12, 14, 14, 14])

    average = report["trend_average"]
    row = len(report["trend"]) + 4
    sheet.write(row, 0, f"Average over {average['months']} month(s)", styles["head"])
    sheet.write(row, 1, average["income"], styles["money"])
    sheet.write(row, 2, average["expenses"], styles["money"])
    sheet.write(row, 3, average["net"], styles["money"])
