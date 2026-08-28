# Getting Started

This guide walks through running Monthly Budget Manager from a fresh
checkout: install Python, set up dependencies, run the CLI, and launch the
desktop GUI.

## 1. Install Python

Monthly Budget Manager targets **Python 3.10 or newer**. Confirm your
interpreter:

```bash
python3 --version
```

If `python3` is missing, install the latest 3.x release from
[python.org](https://www.python.org/downloads/) or your platform's package
manager (`brew install python`, `apt install python3`, etc.).

## 2. Get the source

```bash
git clone https://github.com/anubisland/Monthly-Budget-Manager.git
cd Monthly-Budget-Manager
```

## 3. Install dependencies

Only the GUI needs third-party packages (`openpyxl` for Excel export and
`tkcalendar` for the date picker). The CLI runs on the standard library
alone.

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## 4. Run the CLI

```bash
python3 budget_manager.py
```

You will be prompted for incomes and expenses. Leave the name blank to end
each section. The CLI prints a summary table and a category breakdown.

For non-interactive use, point the CLI at a CSV (`type,name,category,amount`):

```bash
python3 budget_manager.py --input examples/sample_budget.csv --json
```

See the [CLI Reference](cli-reference.md) for every flag.

## 5. Launch the desktop GUI

```bash
python3 budget_manager_gui.py
```

Useful keyboard shortcuts:

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open a saved budget file |
| `Ctrl+S` | Save the current budget |
| `F5`     | Refresh the report and charts |

To export the current view to Excel, use **File → Export to Excel** or see
[Exporting to Excel](exporting-to-excel.md).

## 6. Next steps

- Browse [`examples/`](../../examples) for sample CSV inputs.
- Read the [CLI Reference](cli-reference.md) before scripting Budget Manager
  into a pipeline.
- Track release notes in [`CHANGELOG.md`](../../CHANGELOG.md).
