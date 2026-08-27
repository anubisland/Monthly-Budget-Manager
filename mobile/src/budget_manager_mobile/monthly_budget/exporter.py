from __future__ import annotations

from datetime import date as _date
from typing import List, Optional

from .core import BudgetMonth


def export_ofx(bm: BudgetMonth) -> str:
    """Export budget to OFX (Open Financial Exchange) format."""
    lines: List[str] = []
    lines.append("OFXHEADER:100")
    lines.append("DATA:OFXSGML")
    lines.append("VERSION:102")
    lines.append("SECURITY:NONE")
    lines.append("ENCODING:UNICODE")
    lines.append("CHARSET:1252")
    lines.append("")
    lines.append("<OFX>")
    lines.append("  <SIGNONMSGSRSV1>")
    lines.append("    <SONRS>")
    lines.append(f"      <DTSERVER>{_date.today().strftime('%Y%m%d')}</DTSERVER>")
    lines.append("      <LANGUAGE>ENG</LANGUAGE>")
    lines.append("    </SONRS>")
    lines.append("  </SIGNONMSGSRSV1>")
    lines.append("  <BANKMSGSRSV1>")
    lines.append("    <STMTTRNRS>")
    lines.append(f"      <TRNUID>{bm.month or 'unknown'}</TRNUID>")
    lines.append("      <STMTRS>")
    lines.append("        <CURDEF>USD</CURDEF>")
    lines.append("        <BANKACCTFROM>")
    lines.append("          <BANKID>BudgetManager</BANKID>")
    lines.append(f"          <ACCTID>{bm.month or 'budget'}</ACCTID>")
    lines.append("          <ACCTTYPE>CHECKING</ACCTTYPE>")
    lines.append("        </BANKACCTFROM>")

    # Incomes as credit transactions
    if bm.incomes:
        lines.append("        <BANKTRANLIST>")
        for inc in bm.incomes:
            d = _format_ofx_date(inc.date)
            lines.append("          <STMTTRN>")
            lines.append("            <TRNTYPE>CREDIT</TRNTYPE>")
            lines.append(f"            <DTPOSTED>{d}</DTPOSTED>")
            lines.append(f"            <TRNAMT>{inc.amount:.2f}</TRNAMT>")
            lines.append(f"            <NAME>{_escape_ofx(inc.name)}</NAME>")
            lines.append("          </STMTTRN>")
        lines.append("        </BANKTRANLIST>")

    # Expenses as debit transactions
    if bm.expenses:
        if not bm.incomes:
            lines.append("        <BANKTRANLIST>")
        for exp in bm.expenses:
            d = _format_ofx_date(exp.date)
            lines.append("          <STMTTRN>")
            lines.append("            <TRNTYPE>DEBIT</TRNTYPE>")
            lines.append(f"            <DTPOSTED>{d}</DTPOSTED>")
            lines.append(f"            <TRNAMT>-{exp.amount:.2f}</TRNAMT>")
            lines.append(f"            <NAME>{_escape_ofx(exp.name)}</NAME>")
            lines.append(f"            <MEMO>{_escape_ofx(exp.category)}</MEMO>")
            lines.append("          </STMTTRN>")
        lines.append("        </BANKTRANLIST>")

    lines.append("        <LEDGERBAL>")
    lines.append(f"          <BALAMT>{bm.net():.2f}</BALAMT>")
    lines.append(f"          <DTASOF>{_date.today().strftime('%Y%m%d')}</DTASOF>")
    lines.append("        </LEDGERBAL>")
    lines.append("      </STMTRS>")
    lines.append("    </STMTTRNRS>")
    lines.append("  </BANKMSGSRSV1>")
    lines.append("</OFX>")
    return "\n".join(lines)


def _format_ofx_date(d: Optional[str]) -> str:
    if d and len(d) >= 10:
        return d.replace("-", "")
    if d and len(d) == 7:
        return d.replace("-", "") + "01"
    return _date.today().strftime("%Y%m%d")


def _escape_ofx(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def export_qif(bm: BudgetMonth) -> str:
    """Export budget to QIF (Quicken Interchange Format)."""
    lines: List[str] = []
    lines.append("!Type:Bank")
    lines.append("")

    for inc in bm.incomes:
        lines.append(f"D{inc.date or ''}")
        lines.append(f"T{inc.amount:.2f}")
        lines.append(f"P{inc.name}")
        lines.append("^")
        lines.append("")

    for exp in bm.expenses:
        lines.append(f"D{exp.date or ''}")
        lines.append(f"T-{exp.amount:.2f}")
        lines.append(f"P{exp.name}")
        lines.append(f"L{exp.category}")
        lines.append("^")
        lines.append("")

    return "\n".join(lines)


def export_pdf(bm: BudgetMonth, output_path: str) -> None:
    """Export budget to PDF using fpdf2."""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 18)
    title = f"Budget Report{f' - {bm.month}' if bm.month else ''}"
    pdf.cell(0, 12, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Summary
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "Summary", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)

    inc = bm.total_income()
    exp = bm.total_expenses()
    net = bm.net()
    margin = bm.profit_margin()

    pdf.cell(0, 6, f"Total Income:   ${inc:,.2f}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Total Expenses: ${exp:,.2f}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Net (Profit):   ${net:,.2f}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Profit Margin:  {margin:.2f}%", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Incomes
    if bm.incomes:
        pdf.set_font("Helvetica", "B", 13)
        pdf.cell(0, 8, "Income", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(80, 6, "Name", border=1)
        pdf.cell(30, 6, "Amount", border=1)
        pdf.cell(40, 6, "Date", border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 10)
        for i in bm.incomes:
            pdf.cell(80, 5, i.name[:40], border=1)
            pdf.cell(30, 5, f"${i.amount:,.2f}", border=1)
            pdf.cell(40, 5, i.date or "", border=1)
            pdf.ln()
        pdf.ln(4)

    # Expenses
    if bm.expenses:
        pdf.set_font("Helvetica", "B", 13)
        pdf.cell(0, 8, "Expenses", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(60, 6, "Name", border=1)
        pdf.cell(30, 6, "Category", border=1)
        pdf.cell(30, 6, "Amount", border=1)
        pdf.cell(40, 6, "Date", border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 10)
        for e in bm.expenses:
            pdf.cell(60, 5, e.name[:30], border=1)
            pdf.cell(30, 5, e.category[:15], border=1)
            pdf.cell(30, 5, f"${e.amount:,.2f}", border=1)
            pdf.cell(40, 5, e.date or "", border=1)
            pdf.ln()
        pdf.ln(4)

    # Category breakdown
    by_cat = bm.expenses_by_category()
    if by_cat:
        pdf.set_font("Helvetica", "B", 13)
        pdf.cell(0, 8, "Category Breakdown", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(60, 6, "Category", border=1)
        pdf.cell(40, 6, "Amount", border=1)
        pdf.cell(30, 6, "% of Total", border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 10)
        for cat, amt in sorted(by_cat.items(), key=lambda x: x[1], reverse=True):
            pct = (amt / exp * 100) if exp > 0 else 0
            pdf.cell(60, 5, cat[:30], border=1)
            pdf.cell(40, 5, f"${amt:,.2f}", border=1)
            pdf.cell(30, 5, f"{pct:.1f}%", border=1)
            pdf.ln()

    pdf.output(output_path)
