from __future__ import annotations

import math as _math
import datetime as _dt
import calendar as _cal
import tkinter as tk
from typing import Optional

import customtkinter as ctk

from .core import BudgetMonth
from .i18n import I18n
from .theme import colors as theme_colors, set_dark_mode
from .storage import Storage

ctk.set_appearance_mode("system")
ctk.set_default_color_theme("blue")

FONT_FAMILY = "Segoe UI"
FONT_FAMILY_AR = "Segoe UI"
SIDEBAR_WIDTH = 200
HEADER_HEIGHT = 56
STATUS_HEIGHT = 32


class BudgetApp(ctk.CTk):
    def __init__(self) -> None:
        super().__init__()
        self._i18n = I18n.get_instance()
        self._ = self._i18n.t

        self.bm = BudgetMonth()
        self._storage = Storage()
        self._current_month: str = ""

        self._current_view: Optional[ctk.CTkFrame] = None
        self._dark_mode = ctk.get_appearance_mode() == "Dark"
        set_dark_mode(self._dark_mode)

        self._build_window()
        self._build_sidebar()
        self._build_header()
        self._build_content_area()
        self._build_statusbar()
        self._load_prefs()
        self._show_view("dashboard")
        self.update_report()

    def _build_window(self) -> None:
        c = theme_colors()
        self.title(self._("app.title"))
        self.geometry("1100x700")
        self.minsize(900, 600)
        self.configure(fg_color=c.bg)
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(2, weight=1)

    def _build_header(self) -> None:
        c = theme_colors()
        header = ctk.CTkFrame(self, height=HEADER_HEIGHT, fg_color=c.card_bg, corner_radius=0)
        header.grid(row=0, column=0, columnspan=2, sticky="ew", padx=0, pady=0)
        header.grid_columnconfigure(3, weight=1)
        header.grid_propagate(False)

        title = ctk.CTkLabel(
            header,
            text=self._("app.title"),
            font=(FONT_FAMILY, 16, "bold"),
            text_color=c.primary,
        )
        title.grid(row=0, column=0, padx=(20, 10), pady=12, sticky="w")

        sep = ctk.CTkLabel(header, text="|", text_color=c.text_secondary, font=(FONT_FAMILY, 14))
        sep.grid(row=0, column=1, padx=4, sticky="w")

        month_frame = ctk.CTkFrame(header, fg_color="transparent")
        month_frame.grid(row=0, column=2, padx=(10, 0), sticky="w")

        self._month_var = ctk.StringVar()
        self._month_combo = ctk.CTkComboBox(
            month_frame,
            variable=self._month_var,
            values=[],  # populated dynamically
            width=110,
            height=32,
            font=(FONT_FAMILY, 13),
            state="normal",
        )
        self._month_combo.grid(row=0, column=0, padx=(0, 6))
        self._month_combo.bind("<FocusOut>", lambda _e: self._on_month_changed())
        self._month_combo.bind("<<ComboboxSelected>>", lambda _e: self._on_month_changed())

        refresh_btn = ctk.CTkButton(
            month_frame,
            text=self._("header.refresh"),
            width=80,
            height=32,
            command=self.update_report,
            font=(FONT_FAMILY, 12),
        )
        refresh_btn.grid(row=0, column=1, padx=(0, 8))

        self._save_indicator = ctk.CTkLabel(
            month_frame,
            text="",
            width=60,
            font=(FONT_FAMILY, 10),
            text_color=theme_colors().text_secondary,
        )
        self._save_indicator.grid(row=0, column=2, padx=(0, 8), sticky="w")

        # Theme toggle
        theme_frame = ctk.CTkFrame(header, fg_color="transparent")
        theme_frame.grid(row=0, column=4, padx=4, sticky="e")

        theme_icon = "\u263E" if self._dark_mode else "\u2600"
        self._theme_btn = ctk.CTkButton(
            theme_frame,
            text=theme_icon,
            width=36,
            height=32,
            command=self._toggle_theme,
            font=(FONT_FAMILY, 14),
        )
        self._theme_btn.grid(row=0, column=0, padx=2)

        self._lang_btn = ctk.CTkButton(
            theme_frame,
            text="EN" if self._i18n.lang == "en" else "AR",
            width=40,
            height=32,
            command=self._toggle_language,
            font=(FONT_FAMILY, 12, "bold"),
        )
        self._lang_btn.grid(row=0, column=1, padx=(2, 12))

    def _build_sidebar(self) -> None:
        c = theme_colors()
        self._sidebar = ctk.CTkFrame(
            self,
            width=SIDEBAR_WIDTH,
            fg_color=c.sidebar_bg,
            corner_radius=0,
        )
        self._sidebar.grid(row=1, column=0, rowspan=2, sticky="nsw", padx=0, pady=0)
        self._sidebar.grid_propagate(False)

        # Nav items
        self._nav_btns: dict[str, ctk.CTkButton] = {}
        nav_items = [
            ("dashboard", "\u2302", "nav.dashboard"),
            ("income", "\u2191", "nav.income"),
            ("expenses", "\u2193", "nav.expenses"),
            ("recurring", "\u21bb", "nav.recurring"),
            ("reports", "\u2261", "nav.reports"),
            ("settings", "\u2699", "nav.settings"),
        ]

        logo = ctk.CTkLabel(
            self._sidebar,
            text="$",
            font=(FONT_FAMILY, 28, "bold"),
            text_color=c.accent,
        )
        logo.grid(row=0, column=0, pady=(24, 16), padx=10)

        for i, (key, icon, label_key) in enumerate(nav_items):
            row = i + 1
            btn = ctk.CTkButton(
                self._sidebar,
                text=f"  {icon}  {self._(label_key)}",
                anchor="w",
                height=40,
                fg_color="transparent",
                text_color=c.sidebar_text,
                hover_color=c.sidebar_hover,
                corner_radius=0,
                font=(FONT_FAMILY, 13),
                command=lambda k=key: self._show_view(k),
            )
            btn.grid(row=row, column=0, sticky="ew", padx=0, pady=0)
            self._nav_btns[key] = btn

        # Spacer
        self._sidebar.grid_rowconfigure(len(nav_items) + 1, weight=1)

    def _build_content_area(self) -> None:
        c = theme_colors()
        self._content_frame = ctk.CTkFrame(self, fg_color=c.bg, corner_radius=0)
        self._content_frame.grid(row=1, column=1, sticky="nsew", padx=0, pady=0)
        self._content_frame.grid_columnconfigure(0, weight=1)
        self._content_frame.grid_rowconfigure(0, weight=1)

    def _build_statusbar(self) -> None:
        c = theme_colors()
        status_frame = ctk.CTkFrame(self, height=STATUS_HEIGHT, fg_color=c.card_bg, corner_radius=0)
        status_frame.grid(row=3, column=0, columnspan=2, sticky="ew", padx=0, pady=0)
        status_frame.grid_propagate(False)

        self._status_var = ctk.StringVar(value=self._("app.ready"))
        self._status_label = ctk.CTkLabel(
            status_frame,
            textvariable=self._status_var,
            font=(FONT_FAMILY, 11),
            text_color=c.text_secondary,
            anchor="w",
        )
        self._status_label.grid(row=0, column=0, padx=(16, 0), pady=4, sticky="w")

    def _show_view(self, view_name: str) -> None:
        c = theme_colors()

        # Highlight active nav button
        for key, btn in self._nav_btns.items():
            btn.configure(fg_color=c.sidebar_active if key == view_name else "transparent")

        # Destroy current view
        if self._current_view:
            self._current_view.destroy()

        # Create new view
        if view_name == "dashboard":
            self._current_view = self._build_dashboard_view()
        elif view_name == "income":
            self._current_view = self._build_income_view()
        elif view_name == "expenses":
            self._current_view = self._build_expenses_view()
        elif view_name == "recurring":
            self._current_view = self._build_recurring_view()
        elif view_name == "reports":
            self._current_view = self._build_reports_view()
        elif view_name == "settings":
            self._current_view = self._build_settings_view()

        if self._current_view:
            self._current_view.grid(row=0, column=0, sticky="nsew", padx=16, pady=16)
            self._current_view.grid_columnconfigure(0, weight=1)

    # ─── DASHBOARD VIEW ────────────────────────────────────────────────

    def _build_dashboard_view(self) -> ctk.CTkFrame:
        _ = self._
        c = theme_colors()
        frame = ctk.CTkScrollableFrame(self._content_frame, fg_color="transparent")
        frame.grid_columnconfigure(0, weight=1)

        # Title
        title = ctk.CTkLabel(
            frame,
            text=_("nav.dashboard"),
            font=(FONT_FAMILY, 22, "bold"),
            text_color=c.text,
            anchor="w",
        )
        title.grid(row=0, column=0, sticky="w", pady=(0, 16))

        # Summary cards row
        cards_frame = ctk.CTkFrame(frame, fg_color="transparent")
        cards_frame.grid(row=1, column=0, sticky="ew", pady=(0, 16))
        for i in range(4):
            cards_frame.grid_columnconfigure(i, weight=1, uniform="card")

        inc = self.bm.total_income()
        exp = self.bm.total_expenses()
        net = self.bm.net()
        pm = self.bm.profit_margin()

        cards = [
            ("dashboard.total_income", f"${inc:,.2f}", c.primary, "\u2191"),
            ("dashboard.total_expenses", f"${exp:,.2f}", c.danger, "\u2193"),
            ("dashboard.net_profit", f"${net:,.2f}", c.positive if net >= 0 else c.danger, "\u00B1"),
            ("dashboard.profit_margin", f"{pm:.1f}%", c.accent, "%"),
        ]

        for i, (label_key, value, color, icon) in enumerate(cards):
            card = ctk.CTkFrame(cards_frame, fg_color=c.card_bg, corner_radius=12, border_width=0)
            card.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 6, 6 if i < 3 else 0))

            icon_label = ctk.CTkLabel(card, text=icon, font=(FONT_FAMILY, 20), text_color=color)
            icon_label.grid(row=0, column=0, padx=(16, 0), pady=(16, 0), sticky="w")

            val_label = ctk.CTkLabel(
                card,
                text=value,
                font=(FONT_FAMILY, 22, "bold"),
                text_color=color,
                anchor="w",
            )
            val_label.grid(row=1, column=0, padx=16, pady=(4, 0), sticky="w")

            desc_label = ctk.CTkLabel(
                card,
                text=_(label_key),
                font=(FONT_FAMILY, 11),
                text_color=c.text_secondary,
                anchor="w",
            )
            desc_label.grid(row=2, column=0, padx=16, pady=(0, 16), sticky="w")

        # Quick stats row
        stats_frame = ctk.CTkFrame(frame, fg_color="transparent")
        stats_frame.grid(row=2, column=0, sticky="ew", pady=(0, 16))
        stats_frame.grid_columnconfigure(0, weight=1)
        stats_frame.grid_columnconfigure(1, weight=1)

        # Income vs Expense mini chart
        chart_card = ctk.CTkFrame(stats_frame, fg_color=c.card_bg, corner_radius=12)
        chart_card.grid(row=0, column=0, sticky="nsew", padx=(0, 6))
        chart_label = ctk.CTkLabel(
            chart_card,
            text=_("report.chart_income_vs_expenses"),
            font=(FONT_FAMILY, 13, "bold"),
            text_color=c.text,
            anchor="w",
        )
        chart_label.grid(row=0, column=0, padx=16, pady=(12, 4), sticky="w")

        self._dash_bar_canvas = ctk.CTkCanvas(
            chart_card,
            height=180,
            bg=c.card_bg,
            highlightthickness=0,
        )
        self._dash_bar_canvas.grid(row=1, column=0, padx=16, pady=(0, 16), sticky="ew")
        self._dash_bar_canvas.bind("<Configure>", lambda e: self._redraw_dashboard_charts())

        # Category mini pie
        pie_card = ctk.CTkFrame(stats_frame, fg_color=c.card_bg, corner_radius=12)
        pie_card.grid(row=0, column=1, sticky="nsew", padx=(6, 0))
        pie_label = ctk.CTkLabel(
            pie_card,
            text=_("report.chart_categories"),
            font=(FONT_FAMILY, 13, "bold"),
            text_color=c.text,
            anchor="w",
        )
        pie_label.grid(row=0, column=0, padx=16, pady=(12, 4), sticky="w")

        self._dash_pie_canvas = ctk.CTkCanvas(
            pie_card,
            height=180,
            bg=c.card_bg,
            highlightthickness=0,
        )
        self._dash_pie_canvas.grid(row=1, column=0, padx=16, pady=(0, 16), sticky="ew")
        self._dash_pie_canvas.bind("<Configure>", lambda e: self._redraw_dashboard_charts())

        # Insights
        insights_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        insights_card.grid(row=3, column=0, sticky="ew", pady=(0, 16))
        insights_card.grid_columnconfigure(0, weight=1)

        insights_label = ctk.CTkLabel(
            insights_card,
            text=self._get_insight_text(),
            font=(FONT_FAMILY, 13),
            text_color=c.text_secondary,
            anchor="w",
            wraplength=700,
        )
        insights_label.grid(row=0, column=0, padx=16, pady=12, sticky="w")

        self._dash_insights = insights_label

        # Budget progress
        budget_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        budget_card.grid(row=4, column=0, sticky="ew", pady=(0, 16))
        budget_card.grid_columnconfigure(0, weight=1)

        budget_label = ctk.CTkLabel(
            budget_card,
            text=_("budget.progress"),
            font=(FONT_FAMILY, 14, "bold"),
            text_color=c.text,
            anchor="w",
        )
        budget_label.grid(row=0, column=0, padx=16, pady=(12, 4), sticky="w")

        self._budget_progress_frame = ctk.CTkFrame(budget_card, fg_color="transparent")
        self._budget_progress_frame.grid(row=1, column=0, padx=16, pady=(0, 12), sticky="ew")
        self._budget_progress_frame.grid_columnconfigure(1, weight=1)
        self._refresh_budget_progress()

        return frame

    def _refresh_budget_progress(self) -> None:
        _ = self._
        c = theme_colors()
        for w in list(self._budget_progress_frame.winfo_children()):
            w.destroy()

        cat_data = self.bm.category_with_limits()
        row = 0
        for cat, data in cat_data.items():
            budget = data["budget"]
            spent = data["spent"]
            remaining = data["remaining"]
            if budget <= 0 and spent <= 0:
                continue
            pct = self.bm.budget_progress(cat)
            bar_color = c.positive if remaining >= 0 else c.danger

            name = ctk.CTkLabel(
                self._budget_progress_frame, text=cat,
                font=(FONT_FAMILY, 12), text_color=c.text, anchor="w", width=100,
            )
            name.grid(row=row, column=0, padx=(0, 8), pady=3, sticky="w")

            progress = ctk.CTkProgressBar(
                self._budget_progress_frame,
                height=18,
                corner_radius=4,
                fg_color=c.border,
                progress_color=bar_color,
            )
            progress.grid(row=row, column=1, padx=(0, 8), pady=3, sticky="ew")
            progress.set(pct)

            if budget > 0:
                status = ctk.CTkLabel(
                    self._budget_progress_frame,
                    text=f"${spent:,.0f} / ${budget:,.0f} ({'+' if remaining >= 0 else ''}{remaining:,.0f})",
                    font=(FONT_FAMILY, 11),
                    text_color=bar_color,
                    anchor="e",
                    width=200,
                )
            else:
                status = ctk.CTkLabel(
                    self._budget_progress_frame,
                    text=f"${spent:,.0f} ({_('budget.no_limit_label')})",
                    font=(FONT_FAMILY, 11),
                    text_color=c.text_secondary,
                    anchor="e",
                    width=200,
                )
            status.grid(row=row, column=2, padx=(0, 0), pady=3, sticky="e")
            row += 1

        if row == 0:
            empty = ctk.CTkLabel(
                self._budget_progress_frame,
                text=_("budget.no_limits"),
                font=(FONT_FAMILY, 12),
                text_color=c.text_secondary,
                anchor="w",
            )
            empty.grid(row=0, column=0, columnspan=3, pady=8, sticky="w")

    def _get_insight_text(self) -> str:
        _ = self._
        inc = self.bm.total_income()
        exp = self.bm.total_expenses()
        net = self.bm.net()

        parts = []
        parts.append(_("dashboard.income_count", count=len(self.bm.incomes)))
        parts.append(_("dashboard.expense_count", count=len(self.bm.expenses)))

        if inc == 0 and exp == 0:
            parts.append(_("dashboard.no_data"))
        elif net > 0:
            parts.append(_("dashboard.positive_net"))
        elif net < 0:
            parts.append(_("dashboard.negative_net"))
        else:
            parts.append(_("dashboard.zero_net"))

        by_cat = self.bm.expenses_by_category()
        if by_cat:
            top_cat = max(by_cat.items(), key=lambda x: x[1])
            parts.append(f"{_('dashboard.top_category')}: {top_cat[0]} (${top_cat[1]:,.2f})")

        over = self.bm.over_budget_categories()
        if over:
            parts.append(_("budget.over", cats=", ".join(over)))

        return "  |  ".join(parts)

    def _redraw_dashboard_charts(self) -> None:
        self._draw_bar_chart(self._dash_bar_canvas)
        self._draw_pie_chart(self._dash_pie_canvas)

    # ─── INCOME VIEW ───────────────────────────────────────────────────

    def _build_income_view(self) -> ctk.CTkFrame:
        _ = self._
        c = theme_colors()
        frame = ctk.CTkFrame(self._content_frame, fg_color="transparent")
        frame.grid_columnconfigure(0, weight=1)
        frame.grid_rowconfigure(4, weight=1)

        title = ctk.CTkLabel(
            frame,
            text=_("income.title"),
            font=(FONT_FAMILY, 22, "bold"),
            text_color=c.text,
            anchor="w",
        )
        title.grid(row=0, column=0, sticky="w", pady=(0, 16))

        # Form
        form = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        form.grid(row=1, column=0, sticky="ew", pady=(0, 16))
        for i in range(5):
            form.grid_columnconfigure(i, weight=0)

        self._inc_name_var = ctk.StringVar()
        self._inc_amount_var = ctk.StringVar()
        self._inc_date_var = ctk.StringVar()

        ctk.CTkLabel(form, text=_("income.name"), font=(FONT_FAMILY, 12), text_color=c.text_secondary).grid(
            row=0, column=0, padx=(16, 4), pady=(12, 0), sticky="w"
        )
        ctk.CTkEntry(form, textvariable=self._inc_name_var, width=180, height=34, font=(FONT_FAMILY, 13)).grid(
            row=1, column=0, padx=(16, 4), pady=(0, 12)
        )

        ctk.CTkLabel(form, text=_("income.amount"), font=(FONT_FAMILY, 12), text_color=c.text_secondary).grid(
            row=0, column=1, padx=4, pady=(12, 0), sticky="w"
        )
        self._inc_amount_entry = ctk.CTkEntry(form, textvariable=self._inc_amount_var, width=110, height=34, font=(FONT_FAMILY, 13))
        self._inc_amount_entry.grid(row=1, column=1, padx=4, pady=(0, 12))

        ctk.CTkLabel(form, text=_("income.date"), font=(FONT_FAMILY, 12), text_color=c.text_secondary).grid(
            row=0, column=2, padx=4, pady=(12, 0), sticky="w"
        )
        date_frame = ctk.CTkFrame(form, fg_color="transparent")
        date_frame.grid(row=1, column=2, padx=4, pady=(0, 12))
        ctk.CTkEntry(date_frame, textvariable=self._inc_date_var, width=110, height=34, font=(FONT_FAMILY, 13)).grid(
            row=0, column=0, padx=(0, 4)
        )
        ctk.CTkButton(date_frame, text=_("income.pick_date"), width=56, height=34, font=(FONT_FAMILY, 11),
                       command=lambda: self._open_calendar(self._inc_date_var)).grid(row=0, column=1, padx=2)
        ctk.CTkButton(date_frame, text=_("income.today"), width=56, height=34, font=(FONT_FAMILY, 11),
                       command=lambda: self._inc_date_var.set(_dt.date.today().strftime("%Y-%m-%d"))).grid(row=0, column=2, padx=2)

        ctk.CTkButton(
            form,
            text=_("income.add"),
            height=34,
            font=(FONT_FAMILY, 13, "bold"),
            fg_color=c.primary,
            command=self._add_income,
        ).grid(row=1, column=4, padx=(12, 16), pady=(0, 12))

        # Tree table
        table_frame = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        table_frame.grid(row=2, column=0, sticky="nsew", pady=(0, 8))
        table_frame.grid_columnconfigure(0, weight=1)
        table_frame.grid_rowconfigure(1, weight=1)

        self._income_tree = ctk.CTkTextbox(table_frame, font=(FONT_FAMILY, 13), fg_color="transparent")
        self._income_tree.grid(row=0, column=0, sticky="nsew", padx=8, pady=8)

        # Buttons
        btn_frame = ctk.CTkFrame(frame, fg_color="transparent")
        btn_frame.grid(row=3, column=0, sticky="w")
        ctk.CTkButton(btn_frame, text=_("income.remove_selected"), height=32, font=(FONT_FAMILY, 12),
                       command=self._remove_selected_income).grid(row=0, column=0, padx=(0, 8))
        ctk.CTkButton(btn_frame, text=_("income.clear_all"), height=32, font=(FONT_FAMILY, 12),
                       fg_color=c.danger, command=self._clear_incomes).grid(row=0, column=1)

        self._refresh_income_table()

        return frame

    def _refresh_income_table(self) -> None:
        _ = self._
        c = theme_colors()
        text = self._income_tree
        text.delete("1.0", "end")
        header = f"{_('income.column_name'):<30}  {_('income.column_amount'):>12}  {_('income.column_date'):<16}\n"
        text.insert("end", header, ("header",))
        text.tag_config("header", font=(FONT_FAMILY, 12, "bold"), foreground=c.primary)
        sep = "-" * 60 + "\n"
        text.insert("end", sep)
        for inc in self.bm.incomes:
            row = f"{inc.name:<30}  ${inc.amount:>8,.2f}  {self._format_day(inc.date):<16}\n"
            text.insert("end", row)
        text.configure(state="disabled")

    def _add_income(self) -> None:
        _ = self._
        name = (self._inc_name_var.get() or _("income.empty_name_default")).strip()
        amt_str = self._inc_amount_var.get().strip().replace(",", "")
        raw_date = self._inc_date_var.get().strip()
        try:
            amt = float(amt_str)
            if amt < 0:
                raise ValueError
        except ValueError:
            self._show_error(_("dialog.error_invalid_amount"), _("dialog.error_amount_non_negative"))
            return
        norm_date, err = self._normalize_date(raw_date)
        if err:
            self._show_error(_("dialog.error_invalid_date"), err)
            return
        self.bm.add_income(name, amt, norm_date)
        self._inc_name_var.set("")
        self._inc_amount_var.set("")
        self._inc_date_var.set("")
        self._refresh_income_table()
        self.update_report()
        self._auto_save()
        self._set_saved()
        self._set_status(_("app.income_added"))

    def _remove_selected_income(self) -> None:
        _ = self._
        if not self.bm.incomes:
            return
        self.bm.incomes.pop()
        self._refresh_income_table()
        self.update_report()
        self._auto_save()
        self._set_saved()
        self._set_status(_("app.income_removed"))

    def _clear_incomes(self) -> None:
        _ = self._
        if self._confirm(_("dialog.confirm_clear_incomes_title"), _("dialog.confirm_clear_incomes")):
            self.bm.incomes.clear()
            self._refresh_income_table()
            self.update_report()
            self._auto_save()
            self._set_saved()
            self._set_status(_("app.incomes_cleared"))

    # ─── EXPENSES VIEW ─────────────────────────────────────────────────

    def _build_expenses_view(self) -> ctk.CTkFrame:
        _ = self._
        c = theme_colors()
        frame = ctk.CTkFrame(self._content_frame, fg_color="transparent")
        frame.grid_columnconfigure(0, weight=1)
        frame.grid_rowconfigure(4, weight=1)

        title = ctk.CTkLabel(
            frame,
            text=_("expense.title"),
            font=(FONT_FAMILY, 22, "bold"),
            text_color=c.text,
            anchor="w",
        )
        title.grid(row=0, column=0, sticky="w", pady=(0, 16))

        # Form
        form = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        form.grid(row=1, column=0, sticky="ew", pady=(0, 16))
        for i in range(6):
            form.grid_columnconfigure(i, weight=0)

        self._exp_name_var = ctk.StringVar()
        self._exp_cat_var = ctk.StringVar()
        self._exp_amount_var = ctk.StringVar()
        self._exp_date_var = ctk.StringVar()

        ctk.CTkLabel(form, text=_("expense.name"), font=(FONT_FAMILY, 12), text_color=c.text_secondary).grid(
            row=0, column=0, padx=(16, 4), pady=(12, 0), sticky="w"
        )
        ctk.CTkEntry(form, textvariable=self._exp_name_var, width=150, height=34, font=(FONT_FAMILY, 13)).grid(
            row=1, column=0, padx=(16, 4), pady=(0, 12)
        )

        ctk.CTkLabel(form, text=_("expense.category"), font=(FONT_FAMILY, 12), text_color=c.text_secondary).grid(
            row=0, column=1, padx=4, pady=(12, 0), sticky="w"
        )
        cat_frame = ctk.CTkFrame(form, fg_color="transparent")
        cat_frame.grid(row=1, column=1, padx=4, pady=(0, 12))
        ctk.CTkEntry(cat_frame, textvariable=self._exp_cat_var, width=120, height=34, font=(FONT_FAMILY, 13)).grid(
            row=0, column=0, padx=(0, 4)
        )
        ctk.CTkButton(cat_frame, text=_("expense.pick_category"), width=56, height=34, font=(FONT_FAMILY, 11),
                       command=self._pick_category).grid(row=0, column=1)

        ctk.CTkLabel(form, text=_("expense.amount"), font=(FONT_FAMILY, 12), text_color=c.text_secondary).grid(
            row=0, column=2, padx=4, pady=(12, 0), sticky="w"
        )
        ctk.CTkEntry(form, textvariable=self._exp_amount_var, width=110, height=34, font=(FONT_FAMILY, 13)).grid(
            row=1, column=2, padx=4, pady=(0, 12)
        )

        ctk.CTkLabel(form, text=_("expense.date"), font=(FONT_FAMILY, 12), text_color=c.text_secondary).grid(
            row=0, column=3, padx=4, pady=(12, 0), sticky="w"
        )
        date_frame = ctk.CTkFrame(form, fg_color="transparent")
        date_frame.grid(row=1, column=3, padx=4, pady=(0, 12))
        ctk.CTkEntry(date_frame, textvariable=self._exp_date_var, width=110, height=34, font=(FONT_FAMILY, 13)).grid(
            row=0, column=0, padx=(0, 4)
        )
        ctk.CTkButton(date_frame, text=_("expense.pick_date"), width=56, height=34, font=(FONT_FAMILY, 11),
                       command=lambda: self._open_calendar(self._exp_date_var)).grid(row=0, column=1, padx=2)
        ctk.CTkButton(date_frame, text=_("expense.today"), width=56, height=34, font=(FONT_FAMILY, 11),
                       command=lambda: self._exp_date_var.set(_dt.date.today().strftime("%Y-%m-%d"))).grid(row=0, column=2, padx=2)

        ctk.CTkButton(
            form,
            text=_("expense.add"),
            height=34,
            font=(FONT_FAMILY, 13, "bold"),
            fg_color=c.primary,
            command=self._add_expense,
        ).grid(row=1, column=5, padx=(12, 16), pady=(0, 12))

        # Table
        table_frame = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        table_frame.grid(row=2, column=0, sticky="nsew", pady=(0, 8))
        table_frame.grid_columnconfigure(0, weight=1)
        table_frame.grid_rowconfigure(1, weight=1)

        self._expense_tree = ctk.CTkTextbox(table_frame, font=(FONT_FAMILY, 13), fg_color="transparent")
        self._expense_tree.grid(row=0, column=0, sticky="nsew", padx=8, pady=8)

        btn_frame = ctk.CTkFrame(frame, fg_color="transparent")
        btn_frame.grid(row=3, column=0, sticky="w")
        ctk.CTkButton(btn_frame, text=_("expense.remove_selected"), height=32, font=(FONT_FAMILY, 12),
                       command=self._remove_selected_expense).grid(row=0, column=0, padx=(0, 8))
        ctk.CTkButton(btn_frame, text=_("expense.clear_all"), height=32, font=(FONT_FAMILY, 12),
                       fg_color=c.danger, command=self._clear_expenses).grid(row=0, column=1)

        self._refresh_expense_table()
        return frame

    def _refresh_expense_table(self) -> None:
        _ = self._
        c = theme_colors()
        text = self._expense_tree
        text.delete("1.0", "end")
        header = f"{_('expense.column_name'):<25}  {_('expense.column_category'):<18}  {_('expense.column_amount'):>10}  {_('expense.column_date'):<16}\n"
        text.insert("end", header, ("header",))
        text.tag_config("header", font=(FONT_FAMILY, 12, "bold"), foreground=c.primary)
        sep = "-" * 72 + "\n"
        text.insert("end", sep)
        for exp in self.bm.expenses:
            row = f"{exp.name:<25}  {exp.category:<18}  ${exp.amount:>7,.2f}  {self._format_day(exp.date):<16}\n"
            text.insert("end", row)
        text.configure(state="disabled")

    def _add_expense(self) -> None:
        _ = self._
        name = (self._exp_name_var.get() or _("expense.empty_name_default")).strip()
        category = (self._exp_cat_var.get() or _("expense.empty_category_default")).strip()
        amt_str = self._exp_amount_var.get().strip().replace(",", "")
        raw_date = self._exp_date_var.get().strip()
        try:
            amt = float(amt_str)
            if amt < 0:
                raise ValueError
        except ValueError:
            self._show_error(_("dialog.error_invalid_amount"), _("dialog.error_amount_non_negative"))
            return
        norm_date, err = self._normalize_date(raw_date)
        if err:
            self._show_error(_("dialog.error_invalid_date"), err)
            return
        self.bm.add_expense(name, amt, category, norm_date)
        self._exp_name_var.set("")
        self._exp_cat_var.set("")
        self._exp_amount_var.set("")
        self._exp_date_var.set("")
        self._refresh_expense_table()
        self.update_report()
        self._auto_save()
        self._set_saved()
        self._set_status(_("app.expense_added"))

    def _remove_selected_expense(self) -> None:
        _ = self._
        if not self.bm.expenses:
            return
        self.bm.expenses.pop()
        self._refresh_expense_table()
        self.update_report()
        self._auto_save()
        self._set_saved()
        self._set_status(_("app.expense_removed"))

    def _clear_expenses(self) -> None:
        _ = self._
        if self._confirm(_("dialog.confirm_clear_expenses_title"), _("dialog.confirm_clear_expenses")):
            self.bm.expenses.clear()
            self._refresh_expense_table()
            self.update_report()
            self._auto_save()
            self._set_saved()
            self._set_status(_("app.expenses_cleared"))

    # ─── RECURRING VIEW ─────────────────────────────────────────────────

    def _build_recurring_view(self) -> ctk.CTkFrame:
        _ = self._
        c = theme_colors()
        frame = ctk.CTkScrollableFrame(self._content_frame, fg_color="transparent")
        frame.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            frame, text=_("recurring.title"),
            font=(FONT_FAMILY, 22, "bold"), text_color=c.text, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w", pady=(0, 4))

        desc = ctk.CTkLabel(
            frame, text=_("recurring.desc"),
            font=(FONT_FAMILY, 12), text_color=c.text_secondary, anchor="w",
        )
        desc.grid(row=1, column=0, sticky="w", pady=(0, 16))

        # ── Add/Edit form card ──
        form_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        form_card.grid(row=2, column=0, sticky="ew", pady=(0, 12))
        form_card.grid_columnconfigure(1, weight=1)

        self._recur_edit_id = 0
        self._recur_desc_var = ctk.StringVar()
        self._recur_cat_var = ctk.StringVar(value="Uncategorized")
        self._recur_amount_var = ctk.StringVar()
        self._recur_freq_var = ctk.StringVar(value="monthly")
        self._recur_day_var = ctk.StringVar(value="1")
        self._recur_start_var = ctk.StringVar()
        self._recur_end_var = ctk.StringVar()

        row = 0
        ctk.CTkLabel(form_card, text=_("recurring.description"), font=(FONT_FAMILY, 12), text_color=c.text).grid(
            row=row, column=0, padx=(16, 4), pady=(16, 4), sticky="w")
        ctk.CTkEntry(form_card, textvariable=self._recur_desc_var, width=200, height=32,
                      font=(FONT_FAMILY, 12)).grid(row=row, column=1, padx=4, pady=(16, 4), sticky="w")

        row = 1
        ctk.CTkLabel(form_card, text=_("recurring.category"), font=(FONT_FAMILY, 12), text_color=c.text).grid(
            row=row, column=0, padx=(16, 4), pady=4, sticky="w")
        cat_combo = ctk.CTkComboBox(
            form_card,
            values=["Food", "Rent", "Utilities", "Transport", "Healthcare",
                    "Entertainment", "Education", "Clothing", "Savings",
                    "Debt", "Subscriptions", "Gifts", "Misc", "Uncategorized"],
            variable=self._recur_cat_var, width=200, height=32, font=(FONT_FAMILY, 12),
        )
        cat_combo.grid(row=row, column=1, padx=4, pady=4, sticky="w")

        row = 2
        ctk.CTkLabel(form_card, text=_("recurring.amount"), font=(FONT_FAMILY, 12), text_color=c.text).grid(
            row=row, column=0, padx=(16, 4), pady=4, sticky="w")
        ctk.CTkEntry(form_card, textvariable=self._recur_amount_var, width=120, height=32,
                      font=(FONT_FAMILY, 12)).grid(row=row, column=1, padx=4, pady=4, sticky="w")

        row = 3
        ctk.CTkLabel(form_card, text=_("recurring.frequency"), font=(FONT_FAMILY, 12), text_color=c.text).grid(
            row=row, column=0, padx=(16, 4), pady=4, sticky="w")
        freq_combo = ctk.CTkComboBox(
            form_card,
            values=["monthly", "weekly", "biweekly", "quarterly", "yearly"],
            variable=self._recur_freq_var, width=120, height=32, font=(FONT_FAMILY, 12),
        )
        freq_combo.grid(row=row, column=1, padx=4, pady=4, sticky="w")

        row = 4
        ctk.CTkLabel(form_card, text=_("recurring.day"), font=(FONT_FAMILY, 12), text_color=c.text).grid(
            row=row, column=0, padx=(16, 4), pady=4, sticky="w")
        ctk.CTkEntry(form_card, textvariable=self._recur_day_var, width=60, height=32,
                      font=(FONT_FAMILY, 12)).grid(row=row, column=1, padx=4, pady=4, sticky="w")

        row = 5
        ctk.CTkLabel(form_card, text=_("recurring.start_date"), font=(FONT_FAMILY, 12), text_color=c.text).grid(
            row=row, column=0, padx=(16, 4), pady=4, sticky="w")
        ctk.CTkEntry(form_card, textvariable=self._recur_start_var, width=120, height=32,
                      font=(FONT_FAMILY, 12)).grid(row=row, column=1, padx=4, pady=4, sticky="w")

        row = 6
        ctk.CTkLabel(form_card, text=_("recurring.end_date"), font=(FONT_FAMILY, 12), text_color=c.text).grid(
            row=row, column=0, padx=(16, 4), pady=4, sticky="w")
        ctk.CTkEntry(form_card, textvariable=self._recur_end_var, width=120, height=32,
                      font=(FONT_FAMILY, 12)).grid(row=row, column=1, padx=4, pady=4, sticky="w")

        # Buttons
        row = 7
        btn_frame = ctk.CTkFrame(form_card, fg_color="transparent")
        btn_frame.grid(row=row, column=0, columnspan=2, padx=16, pady=(12, 16), sticky="w")

        self._recur_add_btn = ctk.CTkButton(
            btn_frame, text=_("recurring.add"), height=32, font=(FONT_FAMILY, 12),
            fg_color=c.primary, command=self._recur_add,
        )
        self._recur_add_btn.pack(side="left", padx=(0, 8))

        self._recur_update_btn = ctk.CTkButton(
            btn_frame, text=_("recurring.update"), height=32, font=(FONT_FAMILY, 12),
            fg_color=c.primary, command=self._recur_update,
        )
        self._recur_update_btn.pack(side="left", padx=4)

        self._recur_cancel_btn = ctk.CTkButton(
            btn_frame, text=_("recurring.cancel"), height=32, font=(FONT_FAMILY, 12),
            fg_color="transparent", text_color=c.text,
            hover_color=c.hover, command=self._recur_cancel_edit,
        )
        self._recur_cancel_btn.pack(side="left", padx=4)

        # ── Recurring list ──
        list_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        list_card.grid(row=3, column=0, sticky="nsew", pady=(0, 12))
        list_card.grid_columnconfigure(0, weight=1)
        list_card.grid_rowconfigure(2, weight=1)

        # Header row: title + apply button
        header_frame = ctk.CTkFrame(list_card, fg_color="transparent")
        header_frame.grid(row=0, column=0, padx=20, pady=(16, 4), sticky="ew")
        header_frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            header_frame, text=_("recurring.title"),
            font=(FONT_FAMILY, 14, "bold"), text_color=c.text, anchor="w",
        ).grid(row=0, column=0, sticky="w")

        ctk.CTkButton(
            header_frame, text="Apply to Current Month", height=28, font=(FONT_FAMILY, 11),
            fg_color=c.primary, command=self._recur_apply_to_current,
        ).grid(row=0, column=1, sticky="e")

        # Action row: ID entry + Edit/Delete buttons
        action_frame = ctk.CTkFrame(list_card, fg_color="transparent")
        action_frame.grid(row=1, column=0, padx=20, pady=(4, 4), sticky="w")

        self._recur_action_id_var = ctk.StringVar()
        ctk.CTkLabel(action_frame, text="ID:", font=(FONT_FAMILY, 12), text_color=c.text).pack(side="left", padx=(0, 4))
        ctk.CTkEntry(action_frame, textvariable=self._recur_action_id_var, width=50, height=28,
                      font=(FONT_FAMILY, 12)).pack(side="left", padx=4)
        ctk.CTkButton(
            action_frame, text=_("recurring.update"), height=28, width=60, font=(FONT_FAMILY, 11),
            fg_color=c.primary, command=self._recur_edit_by_id,
        ).pack(side="left", padx=4)
        ctk.CTkButton(
            action_frame, text=_("recurring.delete"), height=28, width=60, font=(FONT_FAMILY, 11),
            fg_color=c.negative, command=self._recur_delete_by_id,
        ).pack(side="left", padx=4)

        self._recur_list_text = ctk.CTkTextbox(
            list_card, font=(FONT_FAMILY, 12), fg_color="transparent", wrap="none",
        )
        self._recur_list_text.grid(row=2, column=0, padx=20, pady=(4, 8), sticky="nsew")
        self._recur_refresh_list()

        return frame

    def _recur_refresh_list(self) -> None:
        _ = self._
        text = self._recur_list_text
        text.configure(state="normal")
        text.delete("1.0", "end")
        rows = self._storage.list_recurring()
        if not rows:
            text.insert("end", _("recurring.empty"))
            text.configure(state="disabled")
            return

        header = f"{'ID':<4} {'Description':<24} {'Category':<14} {'Amount':>8} {'Freq':<10} {'Day':<4} {'Start':<10} {'End':<10} {'Active':<6}"
        text.insert("end", header + "\n")
        text.insert("end", "-" * len(header) + "\n")
        for rt in rows:
            active_flag = _("recurring.active_word") if hasattr(self, '_') and False else ("Y" if rt.active else "N")
            line = (
                f"{rt.id:<4} {rt.description:<24} {rt.category:<14} "
                f"${rt.amount:>6,.2f} {rt.frequency:<10} {rt.day:<4} "
                f"{rt.start_date:<10} {(rt.end_date or '-'):<10} {active_flag:<6}"
            )
            text.insert("end", line + "\n")
        text.configure(state="disabled")

    def _recur_add(self) -> None:
        _ = self._
        desc = self._recur_desc_var.get().strip()
        if not desc:
            return
        try:
            amount = float(self._recur_amount_var.get().strip().replace(",", ""))
            if amount < 0:
                raise ValueError
        except ValueError:
            return
        cat = self._recur_cat_var.get().strip() or "Uncategorized"
        freq = self._recur_freq_var.get().strip()
        try:
            day = int(self._recur_day_var.get().strip())
        except ValueError:
            return
        start = self._recur_start_var.get().strip() or "2000-01"
        end = self._recur_end_var.get().strip() or None

        from .core import RecurringTransaction
        rt = RecurringTransaction(
            category=cat, description=desc, amount=amount,
            frequency=freq, day=day, start_date=start, end_date=end, active=True,
        )
        self._storage.save_recurring(rt)
        self._recur_clear_form()
        self._recur_refresh_list()
        self._set_saved()

    def _recur_update(self) -> None:
        if self._recur_edit_id <= 0:
            return
        _ = self._
        desc = self._recur_desc_var.get().strip()
        if not desc:
            return
        try:
            amount = float(self._recur_amount_var.get().strip().replace(",", ""))
            if amount < 0:
                raise ValueError
        except ValueError:
            return
        cat = self._recur_cat_var.get().strip() or "Uncategorized"
        freq = self._recur_freq_var.get().strip()
        try:
            day = int(self._recur_day_var.get().strip())
        except ValueError:
            return
        start = self._recur_start_var.get().strip() or "2000-01"
        end = self._recur_end_var.get().strip() or None

        from .core import RecurringTransaction
        rt = RecurringTransaction(
            id=self._recur_edit_id,
            category=cat, description=desc, amount=amount,
            frequency=freq, day=day, start_date=start, end_date=end, active=True,
        )
        self._storage.save_recurring(rt)
        self._recur_cancel_edit()
        self._recur_refresh_list()
        self._set_saved()

    def _recur_cancel_edit(self) -> None:
        self._recur_edit_id = 0
        self._recur_clear_form()
        _ = self._
        self._recur_add_btn.configure(text=_("recurring.add"))

    def _recur_clear_form(self) -> None:
        self._recur_desc_var.set("")
        self._recur_cat_var.set("Uncategorized")
        self._recur_amount_var.set("")
        self._recur_freq_var.set("monthly")
        self._recur_day_var.set("1")
        self._recur_start_var.set("")
        self._recur_end_var.set("")

    def _recur_edit_by_id(self) -> None:
        _ = self._
        try:
            rt_id = int(self._recur_action_id_var.get().strip())
        except ValueError:
            return
        rt = self._storage.load_recurring(rt_id)
        if rt is None:
            return
        self._recur_edit_id = rt.id
        self._recur_desc_var.set(rt.description)
        self._recur_cat_var.set(rt.category)
        self._recur_amount_var.set(str(rt.amount))
        self._recur_freq_var.set(rt.frequency)
        self._recur_day_var.set(str(rt.day))
        self._recur_start_var.set(rt.start_date)
        self._recur_end_var.set(rt.end_date or "")

    def _recur_delete_by_id(self) -> None:
        _ = self._
        try:
            rt_id = int(self._recur_action_id_var.get().strip())
        except ValueError:
            return
        rt = self._storage.load_recurring(rt_id)
        if rt is None:
            return
        self._storage.delete_recurring(rt_id)
        self._recur_refresh_list()
        self._set_saved()

    def _recur_apply_to_current(self) -> None:
        _ = self._
        if not self._current_month:
            return
        try:
            ym = self._current_month.split("-")
            year = int(ym[0])
            month = int(ym[1])
        except (IndexError, ValueError):
            return

        recurring_list = self._storage.list_recurring()
        from .core import apply_recurring_for_month
        new_expenses = apply_recurring_for_month(recurring_list, year, month)
        existing = {(e.name, e.amount, e.category, e.date) for e in self.bm.expenses}
        count = 0
        for exp in new_expenses:
            key = (exp.name, exp.amount, exp.category, exp.date)
            if key not in existing:
                self.bm.expenses.append(exp)
                existing.add(key)
                count += 1

        self._status_var.set(_("recurring.applied", count=count, month=self._current_month))
        if count > 0:
            self._auto_save()
            self._set_saved()
            self.update_report()

    # ─── REPORTS VIEW ──────────────────────────────────────────────────

    def _build_reports_view(self) -> ctk.CTkFrame:
        _ = self._
        c = theme_colors()
        frame = ctk.CTkScrollableFrame(self._content_frame, fg_color="transparent")
        frame.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            frame,
            text=_("report.title"),
            font=(FONT_FAMILY, 22, "bold"),
            text_color=c.text,
            anchor="w",
        )
        title.grid(row=0, column=0, sticky="w", pady=(0, 16))

        # Summary section
        summary_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        summary_card.grid(row=1, column=0, sticky="ew", pady=(0, 16))
        summary_card.grid_columnconfigure(0, weight=1)

        inc = self.bm.total_income()
        exp = self.bm.total_expenses()
        net = self.bm.net()
        pm = self.bm.profit_margin()

        self._rep_income_label = ctk.CTkLabel(
            summary_card, text=_("report.total_income", amount=f"${inc:,.2f}"),
            font=(FONT_FAMILY, 14), text_color=c.positive, anchor="w",
        )
        self._rep_income_label.grid(row=0, column=0, padx=20, pady=(14, 4), sticky="w")

        self._rep_expenses_label = ctk.CTkLabel(
            summary_card, text=_("report.total_expenses", amount=f"${exp:,.2f}"),
            font=(FONT_FAMILY, 14), text_color=c.danger, anchor="w",
        )
        self._rep_expenses_label.grid(row=1, column=0, padx=20, pady=4, sticky="w")

        self._rep_net_label = ctk.CTkLabel(
            summary_card, text=_("report.net", amount=f"${net:,.2f}"),
            font=(FONT_FAMILY, 14), text_color=c.text, anchor="w",
        )
        self._rep_net_label.grid(row=2, column=0, padx=20, pady=4, sticky="w")

        self._rep_margin_label = ctk.CTkLabel(
            summary_card, text=_("report.margin", percent=f"{pm:.2f}"),
            font=(FONT_FAMILY, 14), text_color=c.accent, anchor="w",
        )
        self._rep_margin_label.grid(row=3, column=0, padx=20, pady=(4, 14), sticky="w")

        # Charts section
        charts_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        charts_card.grid(row=2, column=0, sticky="ew", pady=(0, 16))
        charts_card.grid_columnconfigure(0, weight=1)
        charts_card.grid_columnconfigure(1, weight=1)

        bar_label = ctk.CTkLabel(
            charts_card, text=_("report.chart_income_vs_expenses"),
            font=(FONT_FAMILY, 13, "bold"), text_color=c.text, anchor="w",
        )
        bar_label.grid(row=0, column=0, padx=16, pady=(12, 4), sticky="w")

        pie_label = ctk.CTkLabel(
            charts_card, text=_("report.chart_categories"),
            font=(FONT_FAMILY, 13, "bold"), text_color=c.text, anchor="w",
        )
        pie_label.grid(row=0, column=1, padx=16, pady=(12, 4), sticky="w")

        self._rep_bar_canvas = ctk.CTkCanvas(
            charts_card, height=220, bg=c.card_bg, highlightthickness=0,
        )
        self._rep_bar_canvas.grid(row=1, column=0, padx=16, pady=(0, 16), sticky="ew")

        self._rep_pie_canvas = ctk.CTkCanvas(
            charts_card, height=220, bg=c.card_bg, highlightthickness=0,
        )
        self._rep_pie_canvas.grid(row=1, column=1, padx=16, pady=(0, 16), sticky="ew")

        self._rep_bar_canvas.bind("<Configure>", lambda e: self._redraw_report_charts())
        self._rep_pie_canvas.bind("<Configure>", lambda e: self._redraw_report_charts())

        # Category breakdown
        breakdown_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        breakdown_card.grid(row=3, column=0, sticky="nsew", pady=(0, 16))
        breakdown_card.grid_columnconfigure(0, weight=1)
        breakdown_card.grid_rowconfigure(1, weight=1)

        breakdown_label = ctk.CTkLabel(
            breakdown_card, text=_("report.breakdown"),
            font=(FONT_FAMILY, 13, "bold"), text_color=c.text, anchor="w",
        )
        breakdown_label.grid(row=0, column=0, padx=16, pady=(12, 4), sticky="w")

        self._breakdown_text = ctk.CTkTextbox(breakdown_card, font=(FONT_FAMILY, 13), fg_color="transparent")
        self._breakdown_text.grid(row=1, column=0, sticky="nsew", padx=16, pady=(0, 16))
        self._refresh_breakdown()

        return frame

    def _refresh_breakdown(self) -> None:
        _ = self._
        c = theme_colors()
        text = self._breakdown_text
        text.delete("1.0", "end")
        by_cat = self.bm.expenses_by_category()
        if not by_cat:
            text.insert("end", _("report.no_expenses"))
            text.configure(state="disabled")
            return

        p_inc = self.bm.expense_percentages_by_category("income")
        p_exp = self.bm.expense_percentages_by_category("expenses")

        header = f"{_('report.column_category'):<20}  {_('report.column_amount'):>10}  {_('report.column_pct_income'):>12}  {_('report.column_pct_expenses'):>14}\n"
        text.insert("end", header, ("header",))
        text.tag_config("header", font=(FONT_FAMILY, 12, "bold"), foreground=c.primary)
        text.insert("end", "-" * 60 + "\n")
        for cat in sorted(by_cat):
            amt = by_cat[cat]
            row = f"{cat:<20}  ${amt:>7,.2f}  {p_inc.get(cat, 0.0):>10.2f}%  {p_exp.get(cat, 0.0):>12.2f}%\n"
            text.insert("end", row)
        text.configure(state="disabled")

    # ─── SETTINGS VIEW ─────────────────────────────────────────────────

    def _build_settings_view(self) -> ctk.CTkFrame:
        _ = self._
        c = theme_colors()
        from . import __version__

        frame = ctk.CTkScrollableFrame(self._content_frame, fg_color="transparent")
        frame.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            frame,
            text=_("settings.title"),
            font=(FONT_FAMILY, 22, "bold"),
            text_color=c.text,
            anchor="w",
        )
        title.grid(row=0, column=0, sticky="w", pady=(0, 24))

        # Language section
        lang_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        lang_card.grid(row=1, column=0, sticky="ew", pady=(0, 12))
        lang_card.grid_columnconfigure(1, weight=1)

        lang_label = ctk.CTkLabel(
            lang_card, text=_("settings.language"),
            font=(FONT_FAMILY, 14, "bold"), text_color=c.text, anchor="w",
        )
        lang_label.grid(row=0, column=0, padx=20, pady=(16, 4), sticky="w")

        lang_desc = ctk.CTkLabel(
            lang_card, text=_("settings.language_desc"),
            font=(FONT_FAMILY, 12), text_color=c.text_secondary, anchor="w",
        )
        lang_desc.grid(row=1, column=0, columnspan=2, padx=20, pady=(0, 8), sticky="w")

        lang_switch = ctk.CTkSegmentedButton(
            lang_card,
            values=["English", "العربية"],
            selected_color=c.primary,
            font=(FONT_FAMILY, 12),
            command=self._on_language_change,
        )
        lang_switch.grid(row=2, column=0, padx=20, pady=(0, 16), sticky="w")
        lang_switch.set("English" if self._i18n.lang == "en" else "العربية")

        # Theme section
        theme_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        theme_card.grid(row=2, column=0, sticky="ew", pady=(0, 12))
        theme_card.grid_columnconfigure(1, weight=1)

        theme_label = ctk.CTkLabel(
            theme_card, text=_("settings.theme"),
            font=(FONT_FAMILY, 14, "bold"), text_color=c.text, anchor="w",
        )
        theme_label.grid(row=0, column=0, padx=20, pady=(16, 4), sticky="w")

        theme_desc = ctk.CTkLabel(
            theme_card, text=_("settings.theme_desc"),
            font=(FONT_FAMILY, 12), text_color=c.text_secondary, anchor="w",
        )
        theme_desc.grid(row=1, column=0, columnspan=2, padx=20, pady=(0, 8), sticky="w")

        theme_switch = ctk.CTkSegmentedButton(
            theme_card,
            values=[_("settings.theme_light"), _("settings.theme_dark"), _("settings.theme_system")],
            selected_color=c.primary,
            font=(FONT_FAMILY, 12),
            command=self._on_theme_change,
        )
        theme_switch.grid(row=2, column=0, padx=20, pady=(0, 16), sticky="w")
        current = ctk.get_appearance_mode()
        theme_switch.set(_("settings.theme_system") if current == "System" else
                         _("settings.theme_dark") if current == "Dark" else
                         _("settings.theme_light"))

        # Budget limits section
        budget_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        budget_card.grid(row=3, column=0, sticky="ew", pady=(0, 12))
        budget_card.grid_columnconfigure(1, weight=1)

        budget_label = ctk.CTkLabel(
            budget_card, text=_("settings.budget_limits"),
            font=(FONT_FAMILY, 14, "bold"), text_color=c.text, anchor="w",
        )
        budget_label.grid(row=0, column=0, columnspan=3, padx=20, pady=(16, 4), sticky="w")

        budget_desc = ctk.CTkLabel(
            budget_card, text=_("settings.budget_desc"),
            font=(FONT_FAMILY, 12), text_color=c.text_secondary, anchor="w",
        )
        budget_desc.grid(row=1, column=0, columnspan=3, padx=20, pady=(0, 8), sticky="w")

        self._budget_cat_var = ctk.StringVar()
        self._budget_limit_var = ctk.StringVar()

        ctk.CTkLabel(budget_card, text=_("settings.budget_category"), font=(FONT_FAMILY, 12), text_color=c.text).grid(
            row=2, column=0, padx=(20, 4), pady=4, sticky="w")
        cat_combo = ctk.CTkComboBox(
            budget_card,
            values=["Food", "Rent", "Utilities", "Transport", "Healthcare",
                    "Entertainment", "Education", "Clothing", "Savings",
                    "Debt", "Subscriptions", "Gifts", "Misc"],
            variable=self._budget_cat_var,
            width=140, height=32, font=(FONT_FAMILY, 12),
        )
        cat_combo.grid(row=2, column=1, padx=4, pady=4, sticky="w")

        ctk.CTkLabel(budget_card, text=_("settings.budget_limit"), font=(FONT_FAMILY, 12), text_color=c.text).grid(
            row=2, column=2, padx=(8, 4), pady=4, sticky="w")
        ctk.CTkEntry(budget_card, textvariable=self._budget_limit_var, width=100, height=32,
                      font=(FONT_FAMILY, 12)).grid(row=2, column=3, padx=4, pady=4, sticky="w")
        ctk.CTkButton(
            budget_card, text=_("settings.budget_set"), height=32, font=(FONT_FAMILY, 12),
            fg_color=c.primary, command=self._set_budget_limit,
        ).grid(row=2, column=4, padx=(8, 20), pady=4)

        # Current limits list
        self._budget_limit_list = ctk.CTkTextbox(budget_card, height=120, font=(FONT_FAMILY, 12),
                                                   fg_color="transparent")
        self._budget_limit_list.grid(row=3, column=0, columnspan=5, padx=20, pady=(4, 16), sticky="ew")
        self._refresh_budget_limit_list()

        # About section
        about_card = ctk.CTkFrame(frame, fg_color=c.card_bg, corner_radius=12)
        about_card.grid(row=4, column=0, sticky="ew", pady=(0, 12))

        about_label = ctk.CTkLabel(
            about_card, text=_("settings.about"),
            font=(FONT_FAMILY, 14, "bold"), text_color=c.text, anchor="w",
        )
        about_label.grid(row=0, column=0, padx=20, pady=(16, 4), sticky="w")

        about_text = _("settings.about_text", version=__version__)
        about_body = ctk.CTkLabel(
            about_card, text=about_text,
            font=(FONT_FAMILY, 12), text_color=c.text_secondary, anchor="w",
            justify="left",
        )
        about_body.grid(row=1, column=0, padx=20, pady=(0, 16), sticky="w")

        return frame

    # ─── SHARED HELPERS ────────────────────────────────────────────────

    def _draw_bar_chart(self, canvas: ctk.CTkCanvas) -> None:
        canvas.delete("all")
        c = theme_colors()
        try:
            w = max(1, int(canvas.winfo_width()))
            h = max(1, int(canvas.winfo_height()))
        except Exception:
            return

        inc = self.bm.total_income()
        exp = self.bm.total_expenses()

        _ = self._
        pad = 20
        usable_w = max(1, w - 3 * pad)
        usable_h = max(1, h - 3 * pad)
        bar_w = max(10, usable_w // 3)
        max_val = max(inc, exp, 1.0)
        scale = usable_h / max_val

        x1 = pad
        x2 = w - pad - bar_w
        y_base = h - pad

        h1 = int(inc * scale)
        h2 = int(exp * scale)

        canvas.create_line(pad - 4, y_base, w - pad + 4, y_base, fill=c.border)
        canvas.create_rectangle(x1, y_base - h1, x1 + bar_w, y_base, fill=c.primary, outline="")
        canvas.create_rectangle(x2, y_base - h2, x2 + bar_w, y_base, fill=c.danger, outline="")

        canvas.create_text(x1 + bar_w / 2, y_base + 10, text=_("report.chart.income"), fill=c.text_secondary, font=(FONT_FAMILY, 10))
        canvas.create_text(x2 + bar_w / 2, y_base + 10, text=_("report.chart.expenses"), fill=c.text_secondary, font=(FONT_FAMILY, 10))
        canvas.create_text(x1 + bar_w / 2, y_base - h1 - 6, text=f"${inc:,.0f}", fill=c.primary, font=(FONT_FAMILY, 10, "bold"))
        canvas.create_text(x2 + bar_w / 2, y_base - h2 - 6, text=f"${exp:,.0f}", fill=c.danger, font=(FONT_FAMILY, 10, "bold"))

    def _draw_pie_chart(self, canvas: ctk.CTkCanvas) -> None:
        canvas.delete("all")
        c = theme_colors()
        try:
            w = max(1, int(canvas.winfo_width()))
            h = max(1, int(canvas.winfo_height()))
        except Exception:
            return

        by_cat = self.bm.expenses_by_category()
        total = sum(v for v in by_cat.values() if v > 0)
        if total <= 0:
            canvas.create_text(w / 2, h / 2, text=self._("report.chart.no_data"), fill=c.text_secondary, font=(FONT_FAMILY, 11))
            return

        r = max(20, min(w, h) // 2 - 12)
        cx, cy = w // 2, h // 2
        items = sorted([(k, v) for k, v in by_cat.items() if v > 0], key=lambda x: x[1], reverse=True)
        colors = c.chart_colors
        angle = 0.0
        for i, (name, val) in enumerate(items):
            frac = val / total
            extent = frac * 360.0
            color = colors[i % len(colors)]
            canvas.create_arc(cx - r, cy - r, cx + r, cy + r,
                              start=angle, extent=extent, fill=color, outline=c.card_bg)
            if frac >= 0.05:
                mid = angle + extent / 2.0
                rad = _math.radians(mid)
                lx = cx + int(_math.cos(rad) * (r * 0.55))
                ly = cy - int(_math.sin(rad) * (r * 0.55))
                canvas.create_text(lx, ly, text=f"{name} {frac * 100:.0f}%",
                                   fill="#FFFFFF", font=(FONT_FAMILY, 9, "bold"))
            angle += extent

    def _redraw_dashboard_charts(self) -> None:
        if hasattr(self, "_dash_bar_canvas") and hasattr(self, "_dash_pie_canvas"):
            self._draw_bar_chart(self._dash_bar_canvas)
            self._draw_pie_chart(self._dash_pie_canvas)

    def _redraw_report_charts(self) -> None:
        if hasattr(self, "_rep_bar_canvas") and hasattr(self, "_rep_pie_canvas"):
            self._draw_bar_chart(self._rep_bar_canvas)
            self._draw_pie_chart(self._rep_pie_canvas)

    def _set_budget_limit(self) -> None:
        _ = self._
        cat = self._budget_cat_var.get().strip()
        limit_str = self._budget_limit_var.get().strip().replace(",", "")
        if not cat or not limit_str:
            return
        try:
            limit = float(limit_str)
            if limit < 0:
                raise ValueError
        except ValueError:
            self._show_error(_("dialog.error_invalid_amount"), _("dialog.error_amount_non_negative"))
            return
        self.bm.set_budget_limit(cat, limit)
        self._budget_cat_var.set("")
        self._budget_limit_var.set("")
        self._refresh_budget_limit_list()
        self._auto_save()
        self._set_saved()

    def _refresh_budget_limit_list(self) -> None:
        _ = self._
        text = self._budget_limit_list
        text.delete("1.0", "end")
        if not self.bm.budget_limits:
            text.insert("end", _("settings.budget_empty"))
            text.configure(state="disabled")
            return
        for cat, limit in sorted(self.bm.budget_limits.items()):
            spent = self.bm.spent_in_category(cat)
            remaining = self.bm.remaining_in_category(cat)
            status = f"{cat:<20}  Limit: ${limit:>7,.2f}  Spent: ${spent:>7,.2f}  Remaining: ${remaining:>+7,.2f}"
            text.insert("end", status + "\n")
        text.configure(state="disabled")

    def _on_month_changed(self) -> None:
        _ = self._
        new_month = self._month_var.get().strip()
        self._auto_save()
        self._current_month = new_month
        self.bm = BudgetMonth(month=new_month or None)
        was_new = not (new_month and self._storage.budget_exists(new_month))
        if new_month and self._storage.budget_exists(new_month):
            loaded = self._storage.load_budget(new_month)
            if loaded:
                self.bm = loaded
        elif was_new and new_month:
            # Auto-apply recurring transactions to new months
            from .core import apply_recurring_for_month
            try:
                ym = new_month.split("-")
                year = int(ym[0])
                month = int(ym[1])
                recurring_list = self._storage.list_recurring()
                new_expenses = apply_recurring_for_month(recurring_list, year, month)
                existing = {(e.name, e.amount, e.category, e.date) for e in self.bm.expenses}
                count = 0
                for exp in new_expenses:
                    key = (exp.name, exp.amount, exp.category, exp.date)
                    if key not in existing:
                        self.bm.expenses.append(exp)
                        existing.add(key)
                        count += 1
                if count > 0:
                    self._status_var.set(_("recurring.applied", count=count, month=new_month))
            except (IndexError, ValueError):
                pass
        self.update_report()
        self._refresh_month_list()
        self._save_prefs()
        self._set_saved()

    def _auto_save(self) -> None:
        month = self._month_var.get().strip()
        if month:
            self.bm.month = month
            self._storage.save_budget(self.bm)

    def _set_saved(self) -> None:
        self._save_indicator.configure(text=self._("app.saved").format(file="DB"))

    def _refresh_month_list(self) -> None:
        months = self._storage.list_months()
        current = self._month_var.get().strip()
        if current and current not in months:
            months = [current] + months
        self._month_combo.configure(values=months)

    def update_report(self) -> None:
        self.bm.month = self._month_var.get().strip() or self.bm.month
        # Rebuild views if they exist
        if hasattr(self, "_dash_insights"):
            self._dash_insights.configure(text=self._get_insight_text())
        if hasattr(self, "_rep_income_label"):
            inc = self.bm.total_income()
            exp = self.bm.total_expenses()
            net = self.bm.net()
            pm = self.bm.profit_margin()
            _ = self._
            self._rep_income_label.configure(text=_("report.total_income", amount=f"${inc:,.2f}"))
            self._rep_expenses_label.configure(text=_("report.total_expenses", amount=f"${exp:,.2f}"))
            self._rep_net_label.configure(text=_("report.net", amount=f"${net:,.2f}"))
            self._rep_margin_label.configure(text=_("report.margin", percent=f"{pm:.2f}"))
        if hasattr(self, "_breakdown_text"):
            self._refresh_breakdown()
        if hasattr(self, "_income_tree"):
            self._refresh_income_table()
        if hasattr(self, "_expense_tree"):
            self._refresh_expense_table()
        if hasattr(self, "_budget_progress_frame"):
            self._refresh_budget_progress()
        self._redraw_dashboard_charts()
        self._redraw_report_charts()

    def _open_calendar(self, target_var: ctk.StringVar) -> None:
        base = (self._month_var.get() or "").strip()
        today = _dt.date.today()
        year = today.year
        month = today.month
        if _is_valid_ym(base):
            year = int(base[:4])
            month = int(base[5:7])
        dlg = CalendarDialog(self, year, month, self._i18n)
        sel = dlg.show()
        if sel:
            target_var.set(sel)

    def _pick_category(self) -> None:
        _ = self._
        cats = [
            _("categories.food"), _("categories.rent"), _("categories.fuel"),
            _("categories.electricity"), _("categories.internet"), _("categories.water"),
            _("categories.transport"), _("categories.healthcare"), _("categories.entertainment"),
            _("categories.education"), _("categories.clothing"), _("categories.savings"),
            _("categories.debt"), _("categories.subscriptions"), _("categories.gifts"),
            _("categories.misc"),
        ]
        dlg = CategoryDialog(self, cats, self._i18n)
        sel = dlg.show()
        if sel:
            self._exp_cat_var.set(sel)

    def _toggle_theme(self) -> None:
        current = ctk.get_appearance_mode()
        new = "Dark" if current == "Light" else "Light"
        ctk.set_appearance_mode(new)
        self._dark_mode = new == "Dark"
        set_dark_mode(self._dark_mode)
        self._theme_btn.configure(text="\u263E" if self._dark_mode else "\u2600")
        self._recolor_ui()

    def _on_theme_change(self, value: str) -> None:
        _ = self._
        mapping = {
            _("settings.theme_light"): "Light",
            _("settings.theme_dark"): "Dark",
            _("settings.theme_system"): "System",
        }
        mode = mapping.get(value, "System")
        ctk.set_appearance_mode(mode)
        self._dark_mode = mode == "Dark"
        set_dark_mode(self._dark_mode)
        self._recolor_ui()

    def _on_language_change(self, value: str) -> None:
        new_lang = "ar" if value == "العربية" else "en"
        self._i18n.set_language(new_lang)
        self._lang_btn.configure(text="AR" if new_lang == "ar" else "EN")
        self._reload_ui_text()

    def _toggle_language(self) -> None:
        new_lang = "ar" if self._i18n.lang == "en" else "en"
        self._i18n.set_language(new_lang)
        self._lang_btn.configure(text="AR" if new_lang == "ar" else "EN")
        self._reload_ui_text()

    def _recolor_ui(self) -> None:
        c = theme_colors()
        self.configure(fg_color=c.bg)
        for widget in self.winfo_children():
            if isinstance(widget, ctk.CTkFrame):
                try:
                    if widget == self._sidebar:
                        widget.configure(fg_color=c.sidebar_bg)
                except Exception:
                    pass
        self._reload_ui_text()

    def _reload_ui_text(self) -> None:
        self._ = self._i18n.t
        self.title(self._("app.title"))
        self._status_var.set(self._("app.ready"))
        if hasattr(self, "_nav_btns"):
            icon_map = {"dashboard": "\u2302", "income": "\u2191", "expenses": "\u2193", "reports": "\u2261", "settings": "\u2699"}
            for key, btn in self._nav_btns.items():
                btn.configure(text=f"  {icon_map.get(key, '')}  {self._('nav.' + key)}")
        self._rebuild_current_view()

    def _rebuild_current_view(self) -> None:
        if self._current_view:
            self._current_view.destroy()
            self._current_view = None
        # Re-show the current view by re-triggering nav; find active key
        for key, btn in self._nav_btns.items():
            if str(btn.cget("fg_color")) != "transparent":
                self._show_view(key)
                break
        else:
            self._show_view("dashboard")

    def _normalize_date(self, s: str) -> tuple[Optional[str], Optional[str]]:
        s = s.strip()
        if not s:
            m = (self._month_var.get() or "").strip()
            if _is_valid_ym(m):
                return m, None
            return None, None
        if _is_valid_ym(s) or _is_valid_ymd(s):
            return s, None
        if s.isdigit():
            try:
                day = int(s)
            except ValueError:
                return None, self._("dialog.error_date_format")
            if not (1 <= day <= 31):
                return None, self._("dialog.error_invalid_day")
            base = (self._month_var.get() or "").strip()
            if not _is_valid_ym(base):
                base = _dt.date.today().strftime("%Y-%m")
            y = int(base[:4])
            m = int(base[5:7])
            try:
                d = _dt.date(y, m, day)
            except ValueError:
                return None, self._("dialog.error_day_for_month", day=day, month=base)
            return d.strftime("%Y-%m-%d"), None
        return None, self._("dialog.error_date_format")

    def _format_day(self, ds: Optional[str]) -> str:
        if not ds:
            return ""
        try:
            if len(ds) == 10:
                d = _dt.datetime.strptime(ds, "%Y-%m-%d").date()
                return f"{d.day} ({d.strftime('%a')})"
            return ""
        except Exception:
            return ds or ""

    def _get_selected_indices(self, text_widget: ctk.CTkTextbox) -> list[int]:
        return []

    def _show_error(self, title: str, message: str) -> None:
        import tkinter.messagebox as mb
        mb.showerror(title, message)

    def _confirm(self, title: str, message: str) -> bool:
        import tkinter.messagebox as mb
        return mb.askyesno(title, message)

    def _set_status(self, message: str) -> None:
        self._status_var.set(message)

    def _save_prefs(self) -> None:
        try:
            self._storage.save_setting("month", self._month_var.get().strip() or "")
            self._storage.save_setting("lang", self._i18n.lang)
            self._storage.save_setting("theme", ctk.get_appearance_mode())
        except Exception:
            pass

    def _load_prefs(self) -> None:
        try:
            month = self._storage.load_setting("month") or ""
            if month:
                self._month_var.set(month)
                self._current_month = month
                loaded = self._storage.load_budget(month)
                if loaded:
                    self.bm = loaded
            lang = self._storage.load_setting("lang") or ""
            if lang in ("en", "ar"):
                self._i18n.set_language(lang)
            theme = self._storage.load_setting("theme") or ""
            if theme in ("Light", "Dark", "System"):
                ctk.set_appearance_mode(theme)
                self._dark_mode = theme == "Dark"
                set_dark_mode(self._dark_mode)
        except Exception:
            pass
        self._refresh_month_list()

    def quit(self) -> None:
        self.destroy()


class CalendarDialog(ctk.CTkToplevel):
    def __init__(self, master, year: int, month: int, i18n: I18n) -> None:
        super().__init__(master)
        self._i18n = i18n
        _ = i18n.t
        self.title(_("calendar.title"))
        self.resizable(False, False)
        self.transient(master)
        self.grab_set()
        self._selected: Optional[str] = None
        self._year = year
        self._month = month
        self._build()
        self.protocol("WM_DELETE_WINDOW", self._on_cancel)

    def _build(self) -> None:
        _ = self._i18n.t
        c = theme_colors()

        self.configure(fg_color=c.card_bg)
        hdr = ctk.CTkFrame(self, fg_color="transparent")
        hdr.grid(row=0, column=0, padx=16, pady=(12, 4))
        ctk.CTkButton(hdr, text="\u25C0", width=36, command=self._prev_month,
                       font=(FONT_FAMILY, 14)).grid(row=0, column=0)
        self._month_label = ctk.CTkLabel(hdr, text=f"{self._year}-{self._month:02d}",
                                          font=(FONT_FAMILY, 14, "bold"), text_color=c.text)
        self._month_label.grid(row=0, column=1, padx=16)
        ctk.CTkButton(hdr, text="\u25B6", width=36, command=self._next_month,
                       font=(FONT_FAMILY, 14)).grid(row=0, column=2)
        self._days_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._days_frame.grid(row=1, column=0, padx=16, pady=4)
        wd_names = [_("calendar.mon_short"), _("calendar.tue_short"), _("calendar.wed_short"),
                     _("calendar.thu_short"), _("calendar.fri_short"), _("calendar.sat_short"),
                     _("calendar.sun_short")]
        for i, wd in enumerate(wd_names):
            ctk.CTkLabel(self._days_frame, text=wd, width=36, anchor="center",
                         font=(FONT_FAMILY, 11, "bold"), text_color=c.text_secondary).grid(row=0, column=i, padx=1, pady=2)
        self._render_days()
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.grid(row=2, column=0, pady=(4, 12))
        ctk.CTkButton(btn_frame, text=_("calendar.cancel"), command=self._on_cancel,
                       font=(FONT_FAMILY, 12)).grid(row=0, column=0, padx=8)

    def _render_days(self) -> None:
        for w in list(self._days_frame.winfo_children()):
            if int(w.grid_info()["row"]) > 0:
                w.destroy()
        cal = _cal.Calendar(firstweekday=0)
        row = 1
        for week in cal.monthdayscalendar(self._year, self._month):
            for col, day in enumerate(week):
                if day == 0:
                    ctk.CTkLabel(self._days_frame, text="", width=36).grid(row=row, column=col, padx=1, pady=1)
                else:
                    ctk.CTkButton(self._days_frame, text=f"{day:02d}", width=36, height=30,
                                   font=(FONT_FAMILY, 11),
                                   command=lambda d=day: self._on_pick(d)).grid(row=row, column=col, padx=1, pady=1)
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
        self._month_label.configure(text=f"{self._year}-{self._month:02d}")
        self._render_days()

    def _next_month(self) -> None:
        if self._month == 12:
            self._month = 1
            self._year += 1
        else:
            self._month += 1
        self._month_label.configure(text=f"{self._year}-{self._month:02d}")
        self._render_days()

    def show(self) -> Optional[str]:
        self.wait_window()
        return self._selected


class CategoryDialog(ctk.CTkToplevel):
    def __init__(self, master, categories: list[str], i18n: I18n) -> None:
        super().__init__(master)
        self._i18n = i18n
        _ = i18n.t
        self.title(_("category_picker.title"))
        self.resizable(False, False)
        self.transient(master)
        self.grab_set()
        self._selected: Optional[str] = None
        self._cats = categories
        self._build()
        self.protocol("WM_DELETE_WINDOW", self._on_cancel)

    def _build(self) -> None:
        _ = self._i18n.t
        c = theme_colors()
        self.configure(fg_color=c.card_bg)
        frm = ctk.CTkFrame(self, fg_color="transparent")
        frm.grid(row=0, column=0, padx=12, pady=12)
        self._listbox = tk.Listbox(frm, height=min(12, max(6, len(self._cats))),
                                    exportselection=False, font=(FONT_FAMILY, 12),
                                    bg=c.input_bg, fg=c.input_text,
                                    selectbackground=c.primary, relief="flat",
                                    highlightthickness=1, highlightcolor=c.border)
        for cat in self._cats:
            self._listbox.insert("end", cat)
        self._listbox.grid(row=0, column=0, sticky="nsew")
        sb = ctk.CTkScrollbar(frm, orientation="vertical", command=self._listbox.yview)
        self._listbox.configure(yscrollcommand=sb.set)
        sb.grid(row=0, column=1, sticky="ns")
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.grid(row=1, column=0, pady=(0, 12))
        ctk.CTkButton(btn_frame, text=_("category_picker.ok"), command=self._on_ok,
                       font=(FONT_FAMILY, 12)).grid(row=0, column=0, padx=4)
        ctk.CTkButton(btn_frame, text=_("category_picker.cancel"), command=self._on_cancel,
                       font=(FONT_FAMILY, 12)).grid(row=0, column=1, padx=4)

    def _on_ok(self) -> None:
        sel = self._listbox.curselection()
        if sel:
            self._selected = self._listbox.get(sel[0])
        self.destroy()

    def _on_cancel(self) -> None:
        self._selected = None
        self.destroy()

    def show(self) -> Optional[str]:
        self.wait_window()
        return self._selected


def _is_valid_ym(s: str) -> bool:
    return len(s) == 7 and s[4] == "-" and s[:4].isdigit() and s[5:7].isdigit() and 1 <= int(s[5:7]) <= 12


def _is_valid_ymd(s: str) -> bool:
    if len(s) != 10 or s[4] != "-" or s[7] != "-":
        return False
    y, m, d = s.split("-")
    if not (y.isdigit() and m.isdigit() and d.isdigit()):
        return False
    try:
        _dt.date(int(y), int(m), int(d))
        return True
    except ValueError:
        return False


def main() -> int:
    app = BudgetApp()
    try:
        app._month_var.set(_dt.date.today().strftime("%Y-%m"))
    except Exception:
        pass
    app.mainloop()
    return 0
