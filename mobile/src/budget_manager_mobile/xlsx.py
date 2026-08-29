"""Writing a report as a spreadsheet.

Thin by design: every decision about *what* the report contains lives in
``report.py``, which needs nothing installed. This module only knows how to
put those tables into a file.

XlsxWriter is already a build dependency of the mobile app and was reachable
from nothing — the export button in the UI was a message saying to use the
desktop app instead.
"""

from __future__ import annotations

from datetime import date as _date
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
    "date": "Date", "name": "Name", "item": "Item",
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
    # The backslash goes with it. In a number format it escapes the next
    # character, so a symbol ending in one turns the closing quote into a
    # literal and leaves the string unterminated — the same file Excel refuses
    # to open. This mattered less when the currency came from a fixed list;
    # the page now sends the symbol it is showing, so it is request text.
    safe = str(currency).replace('"', "").replace("\\", "")
    money = f'"{safe}"#,##0.00' if safe else '#,##0.00'
    # Data cells carry the same border as the header. Bordering only the
    # header left a boxed heading floating over unruled rows, which reads as a
    # heap of values rather than a table — the complaint the file drew.
    # Every cell is centred and bordered. Left to itself Excel aligns text to
    # one edge and numbers to the other, so a table came out with one column
    # against the right margin and the next against the left — the columns
    # stopped lining up with their own headings. Centring is also the only
    # alignment that reads the same whichever direction the sheet runs.
    # One explicit size everywhere. Left to the theme default the money cells
    # — the only ones carrying the currency inside the number format — ended up
    # sized differently from the text beside them.
    cell = {"border": 1, "align": "center", "valign": "vcenter", "font_size": 11}
    #: A money cell renders the currency and the digits together, so at the
    #: same size as the words beside it the amount is the longest thing on the
    #: row and crowds its column. A step down keeps the numbers reading as
    #: figures rather than as more text.
    figure = {**cell, "font_size": 10}
    return {
        "title": workbook.add_format({"bold": True, "font_size": 14,
                                      "align": "center", "valign": "vcenter"}),
        "head": workbook.add_format({"bold": True, "bg_color": "#EEEEEE", **cell}),
        "money": workbook.add_format({"num_format": money, **figure}),
        # A real percentage, not a number with a "%" glued to it. Written the
        # old way the cell held 21.5, so anything the reader built on it — a
        # sum, a chart, a comparison — was out by a factor of a hundred.
        "percent": workbook.add_format({"num_format": "0.0%", **figure}),
        "text": workbook.add_format(dict(cell)),
        "date": workbook.add_format({"num_format": "yyyy-mm-dd", **figure}),
    }


def _new_sheet(workbook, name: str, report: Dict):
    """A worksheet that reads in the report's own direction.

    Without this the columns run left to right under Arabic headings, so the
    first column of a table sits where an Arabic reader looks last. Excel and
    every viewer honour the sheet-level flag, and it is per sheet, so it has
    to be set on each one.
    """
    sheet = workbook.add_worksheet(name)
    if report.get("rtl"):
        sheet.right_to_left()
    # Printing and PDF export both read these. Without them a wide table breaks
    # across two pages at an arbitrary column, which is how a tidy sheet turns
    # back into a mess the moment it leaves the app.
    # The tables draw their own borders; the sheet grid behind them only adds
    # lines that stop where the data does.
    sheet.hide_gridlines(2)
    sheet.set_landscape()
    sheet.fit_to_pages(1, 0)
    sheet.set_margins(0.4, 0.4, 0.5, 0.5)
    return sheet


def _money_width(currency: str) -> int:
    """Column width for a money column, given the currency shown inside it.

    The code sits in the number format, so the rendered text is the currency
    plus the digits. A fixed width fits "$" and turns "ج.م" into ####, which
    reads as a broken file rather than a narrow column.
    """
    return 14 + len(str(currency or ""))


def _title(sheet, styles, row: int, text: str, span: int) -> None:
    """A heading centred over the table it introduces.

    Left in a single cell it sits under one column and reads as a stray
    value; merged across the table it reads as its heading, and does so from
    whichever side the sheet runs.
    """
    sheet.set_row(row, 24)
    if span > 1:
        sheet.merge_range(row, 0, row, span - 1, text, styles["title"])
    else:
        sheet.write(row, 0, text, styles["title"])


def _table(sheet, styles, row: int, headers: List[str], rows: List[List], widths=None) -> int:
    """Write a header row and its data. Returns the next free row."""
    #: Arabic sits taller than Latin; the default row clips its descenders.
    sheet.set_row(row, 20)
    for column, header in enumerate(headers):
        sheet.write(row, column, header, styles["head"])
    if widths:
        for column, width in enumerate(widths):
            sheet.set_column(column, column, width)

    for offset, values in enumerate(rows, start=1):
        for column, (value, style) in enumerate(values):
            if style == "date":
                _write_date(sheet, row + offset, column, value, styles)
            elif style == "percent":
                sheet.write_number(row + offset, column, _fraction(value),
                                   styles["percent"])
            elif value == "":
                # A blank that still carries its border, so an empty month
                # leaves a gap in the table rather than a hole in the grid.
                sheet.write_blank(row + offset, column, None, styles[style])
            else:
                sheet.write(row + offset, column, value, styles[style])
    return row + len(rows) + 2


def _fraction(value: object) -> float:
    """A 0-100 report figure as the 0-1 fraction a percent format expects."""
    try:
        return float(value) / 100.0
    except (TypeError, ValueError):
        return 0.0


def _write_date(sheet, row: int, column: int, value: object, styles: Dict) -> None:
    """A real date where the day is known, text where it is not.

    Written as text a date cannot be sorted or filtered, which is most of what
    a reader opens a spreadsheet to do. ``add_expense`` fills a missing date
    with the month alone, and there is no such thing as a date without a day,
    so those stay as they are rather than being invented into the first.
    """
    try:
        parsed = _date.fromisoformat(str(value))
    except ValueError:
        sheet.write(row, column, value, styles["text"])
        return
    sheet.write_datetime(row, column, parsed, styles["date"])


def _category(report: Dict, name: str) -> str:
    """A category or entry name in the reader's language.

    These are stored in English — "Rent", "Salary/Wage" — and translated only
    when drawn on screen, so a report built straight from storage came out as
    a mix: the names the user typed in Arabic beside the ones the app chose in
    English. The page sends its own table so the file matches the screen.
    """
    names = report.get("names")
    if isinstance(names, dict):
        translated = names.get(name)
        if isinstance(translated, str) and translated.strip():
            return translated.strip()
    return name


def _summary_sheet(workbook, styles, report: Dict, L: Dict) -> None:
    sheet = _new_sheet(workbook, L["summary"], report)
    money_width = _money_width(report.get("currency", ""))
    _title(sheet, styles, 0, f"{L['report']} — {report['month']}", 3)

    summary = report["summary"]
    row = _table(sheet, styles, 2, [L["item"], L["amount"]], [
        [(L["income"], "text"), (summary["income"], "money")],
        [(L["expenses"], "text"), (summary["expenses"], "money")],
        [(L["net"], "text"), (summary["net"], "money")],
        [(L["budget"], "text"), (summary["budget"], "money")],
        [(L["margin"], "text"), (summary["margin"], "percent")],
    ], widths=[22, money_width, 12])
    # The heading row stays put while the tables below it scroll; on a phone
    # the columns otherwise lose their names after the first few rows.
    sheet.freeze_panes(3, 0)

    _title(sheet, styles, row, L["by_category"], 3)
    _table(sheet, styles, row + 1, [L["category"], L["amount"], L["share"]], [
        [(_category(report, item["category"]), "text"),
         (item["amount"], "money"), (item["share"], "percent")]
        for item in report["categories"]
    ])


def _entries_sheet(workbook, styles, report: Dict, L: Dict) -> None:
    """Income and expenses on one sheet, each as its own table.

    One sheet rather than two: the question a reader has is "what happened
    this month", and answering it should not need tab switching.
    """
    sheet = _new_sheet(workbook, L["entries"], report)
    money_width = _money_width(report.get("currency", ""))
    _title(sheet, styles, 0, L["income"], 4)
    row = _table(sheet, styles, 1, [L["date"], L["name"], L["amount"]], [
        [(item["date"], "date"), (_category(report, item["name"]), "text"),
         (item["amount"], "money")]
        for item in report["incomes"]
    ], widths=[12, 30, money_width, 18])
    sheet.freeze_panes(2, 0)

    _title(sheet, styles, row, L["expenses"], 4)
    _table(sheet, styles, row + 1, [L["date"], L["name"], L["amount"], L["category"]], [
        [(item["date"], "date"), (_category(report, item["name"]), "text"),
         (item["amount"], "money"), (_category(report, item["category"]), "text")]
        for item in report["expenses"]
    ])


def _goals_sheet(workbook, styles, report: Dict, L: Dict) -> None:
    sheet = _new_sheet(workbook, L["goals"], report)
    money_width = _money_width(report.get("currency", ""))
    _title(sheet, styles, 0, L["goals"], 7)
    _table(sheet, styles, 1,
           [L["goal"], L["target"], L["funded"], L["remaining"],
            L["progress"], L["this_month"], L["done"]], [
               [(_category(report, g["name"]), "text"),
                (g["target"], "money"), (g["funded"], "money"),
                (g["remaining"], "money"), (g["percent"], "percent"),
                (g["this_month"], "money"), (L["yes"] if g["done"] else L["no"], "text")]
               for g in report["goals"]
           ], widths=[24, money_width, money_width, money_width,
                      12, money_width, 8])
    sheet.freeze_panes(2, 0)


def _trend_sheet(workbook, styles, report: Dict, L: Dict) -> None:
    sheet = _new_sheet(workbook, L["trend"], report)
    money_width = _money_width(report.get("currency", ""))
    _title(sheet, styles, 0, L["recent_months"], 4)
    # An empty month is written as a blank row rather than zeros: the
    # spreadsheet carries the same distinction the chart does, since a zero
    # would be averaged and charted as a real result.
    _table(sheet, styles, 1, [L["month"], L["income"], L["expenses"], L["net"]], [
        [(point["month"], "text")] + (
            [("", "text"), ("", "text"), ("", "text")] if point["empty"] else
            [(point["income"], "money"), (point["expenses"], "money"), (point["net"], "money")]
        )
        for point in report["trend"]
    ], widths=[12, money_width, money_width, money_width])
    sheet.freeze_panes(2, 0)

    average = report["trend_average"]
    row = len(report["trend"]) + 4
    sheet.write(row, 0, L["average_over"].replace("{n}", str(average["months"])), styles["head"])
    sheet.write(row, 1, average["income"], styles["money"])
    sheet.write(row, 2, average["expenses"], styles["money"])
    sheet.write(row, 3, average["net"], styles["money"])
