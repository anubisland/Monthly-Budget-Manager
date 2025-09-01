#!/usr/bin/env python3
"""
Budget Manager GUI (Tkinter)
- Add/remove income and expense items with per-entry Date (YYYY-MM or YYYY-MM-DD)
- CSV import/export compatible with CLI; includes 'date' column
- Live report totals, profit margin, and category percentages
Run: python budget_manager_gui.py
"""
from __future__ import annotations

import csv
import json
import os
import datetime as _dt
import calendar as _cal
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from budget_manager import BudgetMonth, read_csv


def _valid_ym(s: str) -> bool:
    return len(s) == 7 and s[4] == '-' and s[:4].isdigit() and s[5:].isdigit() and 1 <= int(s[5:]) <= 12


def _valid_ymd(s: str) -> bool:
    return (
        len(s) == 10 and s[4] == '-' and s[7] == '-' and s[:4].isdigit() and s[5:7].isdigit() and s[8:].isdigit()
        and 1 <= int(s[5:7]) <= 12 and 1 <= int(s[8:]) <= 31
    )


class BudgetApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Monthly Budget Manager")
        self.geometry("920x680")
        self.minsize(860, 600)

        self.bm = BudgetMonth()

        # UI state
        self.var_month = tk.StringVar(value="")
        self.var_income_name = tk.StringVar()
        self.var_income_amount = tk.StringVar()
        self.var_income_date = tk.StringVar()
        self.var_expense_name = tk.StringVar()
        self.var_expense_category = tk.StringVar()
        self.var_expense_amount = tk.StringVar()
        self.var_expense_date = tk.StringVar()

        self._build_menu()
        self._build_toolbar()
        self._build_body()
        self._build_statusbar()
        self.update_report()

    def _build_menu(self) -> None:
        m = tk.Menu(self)
        filem = tk.Menu(m, tearoff=0)
        filem.add_command(label="New Budget", command=self.new_budget)
        filem.add_separator()
        filem.add_command(label="Open CSV…", command=self.open_csv)
        filem.add_command(label="Save CSV As…", command=self.save_csv)
        filem.add_separator()
        filem.add_command(label="Export JSON Report…", command=self.export_json)
        filem.add_separator()
        filem.add_command(label="Exit", command=self.quit)
        m.add_cascade(label="File", menu=filem)
        self.config(menu=m)

    def _build_toolbar(self) -> None:
        bar = ttk.Frame(self, padding=(8, 6))
        ttk.Label(bar, text="Month (YYYY-MM)").grid(row=0, column=0, sticky="w")
        e = ttk.Entry(bar, textvariable=self.var_month, width=12)
        e.grid(row=0, column=1, padx=(6, 16))
        e.bind("<FocusOut>", lambda _e: self._on_month_changed())
        ttk.Button(bar, text="New", command=self.new_budget).grid(row=0, column=2, padx=4)
        ttk.Button(bar, text="Open CSV…", command=self.open_csv).grid(row=0, column=3, padx=4)
        ttk.Button(bar, text="Save CSV…", command=self.save_csv).grid(row=0, column=4, padx=4)
        ttk.Button(bar, text="Export JSON…", command=self.export_json).grid(row=0, column=5, padx=4)
        ttk.Button(bar, text="Refresh Report", command=self.update_report).grid(row=0, column=6, padx=16)
        bar.columnconfigure(7, weight=1)
        bar.grid(row=0, column=0, sticky="ew")

    def _build_body(self) -> None:
        nb = ttk.Notebook(self)
        tab_income = ttk.Frame(nb, padding=8)
        tab_expense = ttk.Frame(nb, padding=8)
        tab_report = ttk.Frame(nb, padding=8)
        nb.add(tab_income, text="Income")
        nb.add(tab_expense, text="Expenses")
        nb.add(tab_report, text="Report")
        nb.grid(row=1, column=0, sticky="nsew")
        self.rowconfigure(1, weight=1)
        self.columnconfigure(0, weight=1)

        # Income tab
        form = ttk.Frame(tab_income)
        ttk.Label(form, text="Name").grid(row=0, column=0, sticky="w")
        ttk.Entry(form, textvariable=self.var_income_name, width=24).grid(row=1, column=0, padx=(0, 8))
        ttk.Label(form, text="Amount").grid(row=0, column=1, sticky="w")
        ttk.Entry(form, textvariable=self.var_income_amount, width=12).grid(row=1, column=1, padx=(0, 8))
        ttk.Label(form, text="Date (YYYY-MM, YYYY-MM-DD, or DD)").grid(row=0, column=2, sticky="w")
        ttk.Entry(form, textvariable=self.var_income_date, width=12).grid(row=1, column=2, padx=(0, 4))
        ttk.Button(form, text="Pick…", command=self.pick_income_date).grid(row=1, column=3, padx=(0,4))
        ttk.Button(form, text="Today", command=self.use_today_income_date).grid(row=1, column=4, padx=(0,8))
        ttk.Button(form, text="Add Income", command=self.add_income).grid(row=1, column=5)
        form.grid(row=0, column=0, sticky="w", pady=(0, 8))

        self.tv_income = ttk.Treeview(tab_income, columns=("name", "amount", "date"), show="headings", selectmode="extended")
        self.tv_income.heading("name", text="Name")
        self.tv_income.heading("amount", text="Amount ($)")
        self.tv_income.heading("date", text="Day (weekday)")
        self.tv_income.column("name", width=300, anchor="w")
        self.tv_income.column("amount", width=120, anchor="e")
        self.tv_income.column("date", width=110, anchor="center")
        vsb = ttk.Scrollbar(tab_income, orient="vertical", command=self.tv_income.yview)
        self.tv_income.configure(yscrollcommand=vsb.set)
        self.tv_income.grid(row=1, column=0, sticky="nsew")
        vsb.grid(row=1, column=1, sticky="ns")
        btns = ttk.Frame(tab_income)
        ttk.Button(btns, text="Remove Selected", command=self.remove_income_selected).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(btns, text="Clear All", command=self.clear_incomes).grid(row=0, column=1)
        btns.grid(row=2, column=0, pady=8, sticky="w")
        tab_income.columnconfigure(0, weight=1)
        tab_income.rowconfigure(1, weight=1)

        # Expense tab
        form2 = ttk.Frame(tab_expense)
        ttk.Label(form2, text="Name").grid(row=0, column=0, sticky="w")
        ttk.Entry(form2, textvariable=self.var_expense_name, width=24).grid(row=1, column=0, padx=(0, 8))
        ttk.Label(form2, text="Category").grid(row=0, column=1, sticky="w")
        ttk.Entry(form2, textvariable=self.var_expense_category, width=18).grid(row=1, column=1, padx=(0, 8))
        ttk.Label(form2, text="Amount").grid(row=0, column=2, sticky="w")
        ttk.Entry(form2, textvariable=self.var_expense_amount, width=12).grid(row=1, column=2, padx=(0, 8))
        ttk.Label(form2, text="Date (YYYY-MM, YYYY-MM-DD, or DD)").grid(row=0, column=3, sticky="w")
        ttk.Entry(form2, textvariable=self.var_expense_date, width=12).grid(row=1, column=3, padx=(0, 4))
        ttk.Button(form2, text="Pick…", command=self.pick_expense_date).grid(row=1, column=4, padx=(0,4))
        ttk.Button(form2, text="Today", command=self.use_today_expense_date).grid(row=1, column=5, padx=(0,8))
        ttk.Button(form2, text="Add Expense", command=self.add_expense).grid(row=1, column=6)
        form2.grid(row=0, column=0, sticky="w", pady=(0, 8))

        self.tv_expense = ttk.Treeview(tab_expense, columns=("name", "category", "amount", "date"), show="headings", selectmode="extended")
        self.tv_expense.heading("name", text="Name")
        self.tv_expense.heading("category", text="Category")
        self.tv_expense.heading("amount", text="Amount ($)")
        self.tv_expense.heading("date", text="Day (weekday)")
        self.tv_expense.column("name", width=260, anchor="w")
        self.tv_expense.column("category", width=180, anchor="w")
        self.tv_expense.column("amount", width=120, anchor="e")
        self.tv_expense.column("date", width=110, anchor="center")
        vsb2 = ttk.Scrollbar(tab_expense, orient="vertical", command=self.tv_expense.yview)
        self.tv_expense.configure(yscrollcommand=vsb2.set)
        self.tv_expense.grid(row=1, column=0, sticky="nsew")
        vsb2.grid(row=1, column=1, sticky="ns")
        btns2 = ttk.Frame(tab_expense)
        ttk.Button(btns2, text="Remove Selected", command=self.remove_expense_selected).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(btns2, text="Clear All", command=self.clear_expenses).grid(row=0, column=1)
        btns2.grid(row=2, column=0, pady=8, sticky="w")
        tab_expense.columnconfigure(0, weight=1)
        tab_expense.rowconfigure(1, weight=1)

        # Report tab
        summary = ttk.LabelFrame(tab_report, text="Summary", padding=8)
        self.lbl_income = ttk.Label(summary, text="Total Income: $0.00")
        self.lbl_expenses = ttk.Label(summary, text="Total Expenses: $0.00")
        self.lbl_net = ttk.Label(summary, text="Net (Profit): $0.00")
        self.lbl_margin = ttk.Label(summary, text="Profit Margin: 0.00%")
        self.lbl_income.grid(row=0, column=0, sticky="w", padx=(0, 16))
        self.lbl_expenses.grid(row=0, column=1, sticky="w", padx=(0, 16))
        self.lbl_net.grid(row=0, column=2, sticky="w", padx=(0, 16))
        self.lbl_margin.grid(row=0, column=3, sticky="w")
        summary.grid(row=0, column=0, sticky="ew", pady=(0, 8))

        self.tv_breakdown = ttk.Treeview(tab_report, columns=("category", "amount", "p_income", "p_expenses"), show="headings")
        self.tv_breakdown.heading("category", text="Category")
        self.tv_breakdown.heading("amount", text="Amount ($)")
        self.tv_breakdown.heading("p_income", text="% of Income")
        self.tv_breakdown.heading("p_expenses", text="% of Expenses")
        self.tv_breakdown.column("category", anchor="w", width=260)
        self.tv_breakdown.column("amount", anchor="e", width=120)
        self.tv_breakdown.column("p_income", anchor="e", width=120)
        self.tv_breakdown.column("p_expenses", anchor="e", width=120)
        vsb3 = ttk.Scrollbar(tab_report, orient="vertical", command=self.tv_breakdown.yview)
        self.tv_breakdown.configure(yscrollcommand=vsb3.set)
        self.tv_breakdown.grid(row=1, column=0, sticky="nsew")
        vsb3.grid(row=1, column=1, sticky="ns")
        tab_report.columnconfigure(0, weight=1)
        tab_report.rowconfigure(1, weight=1)

    def _build_statusbar(self) -> None:
        self.status = tk.StringVar(value="Ready")
        bar = ttk.Frame(self, padding=(8, 4))
        ttk.Label(bar, textvariable=self.status, anchor="w").grid(row=0, column=0, sticky="ew")
        bar.columnconfigure(0, weight=1)
        bar.grid(row=2, column=0, sticky="ew")

    # Actions
    def _on_month_changed(self) -> None:
        self.bm.month = self.var_month.get().strip() or None
        self.update_report()

    def add_income(self) -> None:
        name = (self.var_income_name.get() or "Income").strip()
        amt_str = (self.var_income_amount.get() or "0").replace(",", "").strip()
        raw_date = (self.var_income_date.get() or "").strip()
        try:
            amt = float(amt_str)
            if amt < 0:
                raise ValueError
        except ValueError:
            messagebox.showerror("Invalid amount", "Income amount must be non-negative.")
            return
        norm_date, err = self._normalize_date_input(raw_date)
        if err:
            messagebox.showerror("Invalid date", err)
            return
        self.bm.add_income(name, amt, norm_date)
        self.var_income_name.set("")
        self.var_income_amount.set("")
        self.var_income_date.set("")
        self.refresh_income_view()
        self.update_report()
        self.status.set("Income added.")

    def add_expense(self) -> None:
        name = (self.var_expense_name.get() or "Expense").strip()
        category = (self.var_expense_category.get() or "Uncategorized").strip()
        amt_str = (self.var_expense_amount.get() or "0").replace(",", "").strip()
        raw_date = (self.var_expense_date.get() or "").strip()
        try:
            amt = float(amt_str)
            if amt < 0:
                raise ValueError
        except ValueError:
            messagebox.showerror("Invalid amount", "Expense amount must be non-negative.")
            return
        norm_date, err = self._normalize_date_input(raw_date)
        if err:
            messagebox.showerror("Invalid date", err)
            return
        self.bm.add_expense(name, amt, category, norm_date)
        self.var_expense_name.set("")
        self.var_expense_category.set("")
        self.var_expense_amount.set("")
        self.var_expense_date.set("")
        self.refresh_expense_view()
        self.update_report()
        self.status.set("Expense added.")

    def remove_income_selected(self) -> None:
        sel = list(self.tv_income.selection())
        if not sel:
            return
        indices = sorted((self.tv_income.index(i) for i in sel), reverse=True)
        for idx in indices:
            if 0 <= idx < len(self.bm.incomes):
                del self.bm.incomes[idx]
        self.refresh_income_view()
        self.update_report()
        self.status.set("Income removed.")

    def remove_expense_selected(self) -> None:
        sel = list(self.tv_expense.selection())
        if not sel:
            return
        indices = sorted((self.tv_expense.index(i) for i in sel), reverse=True)
        for idx in indices:
            if 0 <= idx < len(self.bm.expenses):
                del self.bm.expenses[idx]
        self.refresh_expense_view()
        self.update_report()
        self.status.set("Expense removed.")

    # Date helpers
    def _open_calendar(self, target_var: tk.StringVar) -> None:
        base = (self.var_month.get() or "").strip()
        today = _dt.date.today()
        year = today.year
        month = today.month
        if _valid_ym(base):
            year = int(base[:4])
            month = int(base[5:7])
        sel = _CalendarPopup(self, year, month).show()
        if sel:
            target_var.set(sel)

    def pick_income_date(self) -> None:
        self._open_calendar(self.var_income_date)

    def pick_expense_date(self) -> None:
        self._open_calendar(self.var_expense_date)

    def use_today_income_date(self) -> None:
        self.var_income_date.set(_dt.date.today().strftime("%Y-%m-%d"))

    def use_today_expense_date(self) -> None:
        self.var_expense_date.set(_dt.date.today().strftime("%Y-%m-%d"))

    def clear_incomes(self) -> None:
        if messagebox.askyesno("Clear incomes", "Remove all income entries?"):
            self.bm.incomes.clear()
            self.refresh_income_view()
            self.update_report()
            self.status.set("All incomes cleared.")

    def clear_expenses(self) -> None:
        if messagebox.askyesno("Clear expenses", "Remove all expense entries?"):
            self.bm.expenses.clear()
            self.refresh_expense_view()
            self.update_report()
            self.status.set("All expenses cleared.")

    def new_budget(self) -> None:
        if not self._confirm_discard_changes():
            return
        self.bm = BudgetMonth()
        self.var_month.set("")
        self.refresh_income_view()
        self.refresh_expense_view()
        self.update_report()
        self.status.set("New budget created.")

    # File ops
    def open_csv(self) -> None:
        path = filedialog.askopenfilename(title="Open CSV", filetypes=[["CSV files", "*.csv"], ["All files", "*.*"]])
        if not path:
            return
        try:
            incomes, expenses = read_csv(Path(path))
        except Exception as exc:
            messagebox.showerror("Failed to open CSV", str(exc))
            return
        self.bm.incomes = list(incomes)
        self.bm.expenses = list(expenses)
        # Try to infer the month (YYYY-MM) from loaded entries
        inferred = self._infer_month_from_entries()
        if inferred:
            self.var_month.set(inferred)
            self.bm.month = inferred
        self.refresh_income_view()
        self.refresh_expense_view()
        self.update_report()
        self.status.set(f"Loaded {os.path.basename(path)}")

    def save_csv(self) -> None:
        path = filedialog.asksaveasfilename(title="Save CSV", defaultextension=".csv", filetypes=[["CSV files", "*.csv"], ["All files", "*.*"]], initialfile="budget.csv")
        if not path:
            return
        try:
            with open(path, "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(["type", "name", "category", "amount", "date"])  # date = YYYY-MM or YYYY-MM-DD
                for inc in self.bm.incomes:
                    w.writerow(["income", inc.name, "", f"{inc.amount:.2f}", (inc.date or self.bm.month or "")])
                for exp in self.bm.expenses:
                    w.writerow(["expense", exp.name, exp.category, f"{exp.amount:.2f}", (exp.date or self.bm.month or "")])
        except Exception as exc:
            messagebox.showerror("Failed to save CSV", str(exc))
            return
        self.status.set(f"Saved to {os.path.basename(path)}")

    def export_json(self) -> None:
        path = filedialog.asksaveasfilename(title="Export JSON Report", defaultextension=".json", filetypes=[["JSON files", "*.json"], ["All files", "*.*"]], initialfile="budget_report.json")
        if not path:
            return
        try:
            data = self.bm.to_dict()
            data["month"] = self.var_month.get().strip() or self.bm.month
            Path(path).write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as exc:
            messagebox.showerror("Failed to export JSON", str(exc))
            return
        self.status.set(f"JSON report saved: {os.path.basename(path)}")

    # Views
    def refresh_income_view(self) -> None:
        self.tv_income.delete(*self.tv_income.get_children())
        for inc in self.bm.incomes:
            self.tv_income.insert("", "end", values=(inc.name, f"{inc.amount:,.2f}", self._format_day_display(inc.date)))

    def refresh_expense_view(self) -> None:
        self.tv_expense.delete(*self.tv_expense.get_children())
        for exp in self.bm.expenses:
            self.tv_expense.insert("", "end", values=(exp.name, exp.category, f"{exp.amount:,.2f}", self._format_day_display(exp.date)))

    def update_report(self) -> None:
        self.bm.month = self.var_month.get().strip() or self.bm.month
        inc = self.bm.total_income()
        exp = self.bm.total_expenses()
        net = self.bm.net()
        pm = self.bm.profit_margin()
        self.lbl_income.config(text=f"Total Income: ${inc:,.2f}")
        self.lbl_expenses.config(text=f"Total Expenses: ${exp:,.2f}")
        self.lbl_net.config(text=f"Net (Profit): ${net:,.2f}")
        self.lbl_margin.config(text=f"Profit Margin: {pm:.2f}%")
        self.tv_breakdown.delete(*self.tv_breakdown.get_children())
        by_cat = self.bm.expenses_by_category()
        p_inc = self.bm.expense_percentages_by_category("income")
        p_exp = self.bm.expense_percentages_by_category("expenses")
        for cat in sorted(by_cat):
            amt = by_cat[cat]
            self.tv_breakdown.insert("", "end", values=(cat, f"{amt:,.2f}", f"{p_inc.get(cat, 0.0):.2f}%", f"{p_exp.get(cat, 0.0):.2f}%"))

    def _confirm_discard_changes(self) -> bool:
        if self.bm.incomes or self.bm.expenses:
            return messagebox.askyesno("Discard changes", "Discard current entries?")
        return True

    def _format_day_display(self, ds: str | None) -> str:
        """Return a display string like '31 (Sun)' for YYYY-MM-DD; blank otherwise.
        - If ds is YYYY-MM, returns an empty string as day is unknown.
        - If ds is invalid, returns the original string for visibility.
        """
        if not ds:
            return ""
        try:
            if len(ds) == 10:
                d = _dt.datetime.strptime(ds, "%Y-%m-%d").date()
                return f"{d.day} ({d.strftime('%a')})"
            # month-level date has no exact day -> omit
            return ""
        except Exception:
            return ds

    def _normalize_date_input(self, s: str) -> tuple["str | None", "str | None"]:
        """Normalize user-entered date string into one of:
        - YYYY-MM-DD if day-only provided (uses Month field or today's month)
        - YYYY-MM or YYYY-MM-DD if already valid
        - None if left blank and no Month provided
        Returns (normalized_value, error_message). error_message is None on success.
        """
        s = s.strip()
        # If blank, fall back to Month or None
        if not s:
            m = (self.var_month.get() or "").strip()
            if _valid_ym(m):
                return m, None
            return None, None
        # If already valid YYYY-MM or YYYY-MM-DD
        if _valid_ym(s) or _valid_ymd(s):
            return s, None
        # Day-of-month only (e.g., "5" or "05")
        if s.isdigit():
            try:
                day = int(s)
            except ValueError:
                return None, "Enter date as YYYY-MM, YYYY-MM-DD, or day-of-month (DD)."
            if not (1 <= day <= 31):
                return None, "Day must be between 1 and 31."
            base = (self.var_month.get() or "").strip()
            if not _valid_ym(base):
                base = _dt.date.today().strftime("%Y-%m")
            y = int(base[:4])
            m = int(base[5:7])
            try:
                d = _dt.date(y, m, day)
            except ValueError:
                return None, f"Day {day:02d} is not valid for {base}."
            return d.strftime("%Y-%m-%d"), None
        return None, "Enter date as YYYY-MM, YYYY-MM-DD, or day-of-month (DD)."

    def _infer_month_from_entries(self) -> str | None:
        """Infer YYYY-MM from existing entries by taking the most common month among dates.
        Returns None if no dates are present.
        """
        counts: dict[str, int] = {}
        def add_date(ds: str | None) -> None:
            if not ds:
                return
            ym: str | None = None
            if _valid_ymd(ds):
                ym = ds[:7]
            elif _valid_ym(ds):
                ym = ds
            if ym:
                counts[ym] = counts.get(ym, 0) + 1

        for inc in self.bm.incomes:
            add_date(getattr(inc, 'date', None))
        for exp in self.bm.expenses:
            add_date(getattr(exp, 'date', None))
        if not counts:
            return None
        # Pick the month with max occurrences; tie-breaker uses lexicographic order (earlier month first)
        return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def main() -> int:
    app = BudgetApp()
    try:
        import datetime as _dt
        app.var_month.set(_dt.date.today().strftime("%Y-%m"))
    except Exception:
        pass
    app.mainloop()
    return 0


class _CalendarPopup(tk.Toplevel):
    def __init__(self, master: tk.Misc, year: int, month: int) -> None:
        super().__init__(master)
        self.title("Pick a date")
        self.resizable(False, False)
        self.transient(master)
        self.grab_set()
        self._selected: str | None = None
        self._year = year
        self._month = month
        self._build()
        self.protocol("WM_DELETE_WINDOW", self._on_cancel)

    def _build(self) -> None:
        hdr = ttk.Frame(self, padding=8)
        ttk.Button(hdr, text="◀", width=3, command=self._prev_month).grid(row=0, column=0)
        ttk.Label(hdr, text=f"{self._year}-{self._month:02d}", width=10, anchor="center").grid(row=0, column=1, padx=8)
        ttk.Button(hdr, text="▶", width=3, command=self._next_month).grid(row=0, column=2)
        hdr.grid(row=0, column=0, sticky="ew")

        self.grid_days = ttk.Frame(self, padding=(8, 0))
        self.grid_days.grid(row=1, column=0)
        self._render_days()

        btns = ttk.Frame(self, padding=8)
        ttk.Button(btns, text="Cancel", command=self._on_cancel).grid(row=0, column=0, padx=4)
        btns.grid(row=2, column=0)

    def _render_days(self) -> None:
        for w in list(self.grid_days.winfo_children()):
            w.destroy()
        # Weekday headers
        for i, wd in enumerate(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]):
            ttk.Label(self.grid_days, text=wd, width=4, anchor="center").grid(row=0, column=i, padx=1, pady=2)
        cal = _cal.Calendar(firstweekday=0)  # Monday first
        row = 1
        for week in cal.monthdayscalendar(self._year, self._month):
            for col, day in enumerate(week):
                if day == 0:
                    ttk.Label(self.grid_days, text="", width=4).grid(row=row, column=col, padx=1, pady=1)
                else:
                    def make_cmd(d=day):
                        return lambda: self._on_pick(d)
                    ttk.Button(self.grid_days, text=f"{day:02d}", width=4, command=make_cmd()).grid(row=row, column=col, padx=1, pady=1)
            row += 1

    def _on_pick(self, day: int) -> None:
        d = _dt.date(self._year, self._month, day)
        self._selected = d.strftime("%Y-%m-%d")
        self.destroy()

    def _on_cancel(self) -> None:
        self._selected = None
        self.destroy()

    def _prev_month(self) -> None:
        if self._month == 1:
            self._month = 12
            self._year -= 1
        else:
            self._month -= 1
        self._render_days()

    def _next_month(self) -> None:
        if self._month == 12:
            self._month = 1
            self._year += 1
        else:
            self._month += 1
        self._render_days()

    def show(self) -> str | None:
        self.wait_window()
        return self._selected


if __name__ == "__main__":
    raise SystemExit(main())
