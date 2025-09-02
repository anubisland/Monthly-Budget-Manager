# Monthly Budget Manager
======================

A simple Python tool (CLI and GUI) to track monthly income and expenses and compute percentage breakdowns and profit margin.

Features
- Interactive entry of incomes and expenses
- Import from CSV (type,name,category,amount[,date]) — date supports YYYY-MM or YYYY-MM-DD
- GUI input accepts day-only (DD) and normalizes using the Month field (or today's month)
- Dates display in the table as "31 (Sun)" when a full YYYY-MM-DD is known
- Totals, category breakdowns, percent of income/expenses, and profit margin
- Optional JSON output and save-to-file
- Charts on the Report tab: bar chart (Income vs Expenses) and pie chart (Expense Categories)
- Export to Excel (.xlsx) with three sheets: Income, Expenses, and Report (requires openpyxl)
- Keyboard shortcuts: Ctrl+O (Open), Ctrl+S (Save), F5 (Refresh Report); Enter to add, Esc to clear in form fields
- Remembers your last selected Month between runs

Quick start (Windows PowerShell)
1) Interactive mode:
```
python .\budget_manager.py
```

2) From CSV and print a report:
```
python .\budget_manager.py --input .\examples\sample.csv --month 2025-08
```

3) JSON output (for automation/pipelines):
```
python .\budget_manager.py --input .\examples\sample.csv --json --save-json .\report.json
```

Graphical app (GUI)
```
python .\budget_manager_gui.py
```
- Add incomes and expenses in their tabs
- Set Month (YYYY-MM) in the toolbar; each entry can also have a full date (YYYY-MM or YYYY-MM-DD)
- You can also enter just the day (DD). It will be saved as YYYY-MM-DD using the Month field or today's month.
- Use Open/Save CSV to import/export data
- Switch to the Report tab for totals and percentage breakdowns
	- The Report tab also shows charts: a bar chart comparing Income vs Expenses, and a pie chart of Expense Categories.
	- Charts redraw responsively when you resize the window; pie slices ≥5% show labels.
- Export Excel from the toolbar for a multi-sheet workbook; or export JSON from the File menu for a structured report
 - Save CSV adds a 'date' column (YYYY-MM) per row for round-trip

GUI tips
- Date picker: use the “Pick…” button beside the date fields to choose from a mini calendar. “Today” fills today’s date quickly.
- Day-only input: entering DD auto-expands to YYYY-MM-DD using the Month field (or today’s month when Month is empty).
- Expense categories: click “Pick…” beside Category to choose common categories (Food, Rent, Fuel, Electricity, etc.).
- Month inference: when opening a CSV, the app infers the Month field from the most common months in the entries.
- Keyboard: Ctrl+O to open CSV, Ctrl+S to save CSV, F5 to refresh report; press Enter to add a row and Esc to clear the form.
- Preferences: the app remembers your last selected Month in a simple preferences file in your home folder.

CSV format
```
type,name,category,amount,date
income,Salary,,5000,2025-08-01
expense,Rent,Housing,1500,2025-08-03
expense,Groceries,Food,400,2025-08
```

Notes
- Amounts must be non-negative; invalid numbers are treated as 0.
- If income is 0, percentages relative to income are reported as 0 to avoid division by zero.
- Category is optional for income rows and defaults to "Uncategorized" for expenses when omitted.
- The optional 'date' column accepts YYYY-MM or YYYY-MM-DD. If omitted, data still loads; the GUI includes it when saving.
- In the GUI, entering only DD will be normalized to a full date for storage; tables show day as "DD (Weekday)".
 - Excel export uses openpyxl; if you run outside the provided venv, install with: `pip install openpyxl`

## Mobile (Android/iOS)

The mobile app is built with BeeWare Briefcase and Toga.

Compatibility notes:
- We pin Toga 0.4.7 and Travertino 0.3.0 to match API expectations on mobile.
- After changing `mobile/pyproject.toml`, re-run the Android build so Gradle picks up dependency changes.

