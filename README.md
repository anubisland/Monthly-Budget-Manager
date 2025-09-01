# tutorial
tutrial respiratory
Monthly Budget Manager
======================

A simple Python tool (CLI and GUI) to track monthly income and expenses and compute percentage breakdowns and profit margin. No external dependencies.

Features
- Interactive entry of incomes and expenses
- Import from CSV (type,name,category,amount[,date]) — date supports YYYY-MM or YYYY-MM-DD
- GUI input accepts day-only (DD) and normalizes using the Month field (or today's month)
- Dates display in the table as "31 (Sun)" when a full YYYY-MM-DD is known
- Totals, category breakdowns, percent of income/expenses, and profit margin
- Optional JSON output and save-to-file

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
- Export JSON for a structured report
 - Save CSV adds a 'date' column (YYYY-MM) per row for round-trip

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
