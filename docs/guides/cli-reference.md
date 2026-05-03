# CLI Reference

`budget_manager.py` is a pure-stdlib CLI for tracking monthly income and
expenses and producing a category breakdown. Run `python3 budget_manager.py
--help` to print the same flag list locally.

## Usage

```text
budget_manager.py [-h] [--input INPUT] [--month MONTH] [--json]
                  [--save-json SAVE_JSON]
```

## Flags

| Flag | Argument | Default | Behaviour |
|------|----------|---------|-----------|
| `--input` | path to CSV | (interactive) | Import incomes and expenses from a `type,name,category,amount` CSV instead of prompting. |
| `--month` | label, e.g. `2026-05` | current month | Title used for the report header and JSON `month` field. |
| `--json`  | (flag) | off | Emit the report as JSON to stdout instead of a human-readable table. |
| `--save-json` | path | (none) | Also write the JSON report to the given path. Combine with or without `--json`. |
| `-h`, `--help` | — | — | Print usage and exit. |

## CSV input format

`--input` reads a header-less or header-delimited CSV with four columns:

```csv
type,name,category,amount
income,Salary,work,4500
expense,Rent,housing,1500
expense,Groceries,food,420
```

- `type` must be `income` or `expense` (case-insensitive).
- `category` is free-form; the report groups expenses by this column.
- `amount` is parsed as a float; negative values are treated as zero.

## Examples

### Interactive run

```bash
python3 budget_manager.py --month 2026-05
```

Enter line items when prompted; leave the name blank to finish a section.

### CSV → table

```bash
python3 budget_manager.py --input examples/sample_budget.csv --month 2026-05
```

### CSV → JSON for a pipeline

```bash
python3 budget_manager.py \
  --input examples/sample_budget.csv \
  --month 2026-05 \
  --json | jq '.summary'
```

### CSV → JSON file (and console table)

```bash
python3 budget_manager.py \
  --input examples/sample_budget.csv \
  --save-json reports/2026-05.json
```

## JSON output schema

```jsonc
{
  "month": "2026-05",
  "summary": {
    "income_total": 4500.0,
    "expense_total": 1920.0,
    "profit": 2580.0,
    "profit_margin": 0.5733
  },
  "incomes": [{"name": "Salary", "category": "work", "amount": 4500.0}],
  "expenses": [{"name": "Rent", "category": "housing", "amount": 1500.0}],
  "by_category": [
    {"category": "housing", "amount": 1500.0, "pct_of_expense": 0.78,
     "pct_of_income": 0.33}
  ]
}
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Report produced successfully |
| 2 | Invalid CLI usage (argparse error) |
| 1 | Unhandled exception (e.g. unreadable CSV) |
