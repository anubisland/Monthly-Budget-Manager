# Exporting to Excel

The desktop GUI (`budget_manager_gui.py`) can save the current month's
report as an `.xlsx` workbook with formatted tables and embedded charts.
This guide explains what the export contains and how to script it.

## Prerequisite

Excel export uses [`openpyxl`](https://pypi.org/project/openpyxl/), which is
installed automatically by `pip install -r requirements.txt`.

## Triggering the export

1. Launch the GUI:
   ```bash
   python3 budget_manager_gui.py
   ```
2. Enter incomes and expenses, or use **File → Open** to load a saved
   budget.
3. Choose **File → Export to Excel** (or press `Ctrl+E`).
4. Pick a destination path. The default name is
   `Monthly-Budget-<YYYY-MM>.xlsx`.

## What the workbook contains

| Sheet | Contents |
|-------|----------|
| **Summary** | Headline KPIs: total income, total expense, profit, profit margin. |
| **Incomes** | One row per income line item (name, category, amount). |
| **Expenses** | One row per expense line item (name, category, amount). |
| **Categories** | Per-category amount, % of income, % of expenses. |
| **Charts** | Embedded bar chart (income vs expenses) and pie chart (expense categories). |

Header rows are styled bold; numeric columns are formatted as currency with
two decimal places.

## Re-importing an exported workbook

The GUI does **not** read `.xlsx` directly — re-importing means converting
back to CSV. The simplest path is:

```bash
python3 -c "
from openpyxl import load_workbook
import csv, sys
wb = load_workbook(sys.argv[1])
with open(sys.argv[2], 'w', newline='') as out:
    w = csv.writer(out)
    w.writerow(['type','name','category','amount'])
    for sheet, kind in (('Incomes','income'), ('Expenses','expense')):
        ws = wb[sheet]
        for row in ws.iter_rows(min_row=2, values_only=True):
            name, category, amount = row[:3]
            if name is None: continue
            w.writerow([kind, name, category, amount])
" report.xlsx report.csv
```

Then pipe the CSV back into the CLI:

```bash
python3 budget_manager.py --input report.csv --json
```

## Troubleshooting

- **Charts missing on re-open** — Excel < 2016 cannot render the embedded
  `openpyxl` chart objects; use a current Excel, LibreOffice Calc, or
  Numbers.
- **Currency formatting wrong** — `openpyxl` uses the workbook's default
  locale. Open the workbook in your spreadsheet app and adjust the
  **Categories** sheet's number format.
- **`PermissionError` on save** — close any spreadsheet app that has the
  target file open before retrying the export.
