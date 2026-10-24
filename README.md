# Monthly Budget Manager

[![Python CI](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/python-ci.yml/badge.svg)](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/python-ci.yml)
[![Release Build](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/release.yml/badge.svg)](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/release.yml)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](mobile/LICENSE)

A cross-platform personal finance tool for tracking monthly income and expenses with category breakdowns, charts, and export options.

Available as:
- **CLI** — pure stdlib, zero external deps, scriptable and automation-friendly
- **Desktop GUI** — customtkinter app with charts, envelope budgets and recurring templates
- **Mobile** — Android/iOS via BeeWare Briefcase + Toga, with month history, goals and forecasts
- **Web** — static page in `web/`, published to GitHub Pages

---

## Features

- Add income and expenses interactively, or import from CSV (CLI and web)
- Category breakdowns: amount, % of income, % of expenses
- Profit margin calculation
- JSON output for pipelines and automation (`--json`, `--save-json`)
- Charts: income vs expenses, and expenses by category
- Envelope budgets per category and recurring templates (desktop)
- Month comparison (desktop); month-over-month summary and trend (mobile)
- Savings goals and an on-track / forecast indicator (mobile)
- Calendar date picker and category picker (desktop)
- Exports: OFX, QIF and PDF (desktop), formatted XLSX and a JSON backup (mobile),
  CSV and JSON download (web), JSON output (CLI)
- Dark/light theme, English/Arabic with right-to-left layout
- Preferences remembered between sessions

> The desktop GUI and the web page are separate implementations over the same
domain model, so a feature listed for one platform is not automatically in the
others. [`docs/IMPROVEMENT-PLAN.md`](docs/IMPROVEMENT-PLAN.md) tracks the gaps.

---

## Install

Python 3.10+ is the only hard requirement. The CLI is pure standard library, and
the GUI and PDF export are optional extras:

```bash
pip install .              # CLI only, no external dependencies
pip install ".[gui]"       # + desktop GUI (customtkinter)
pip install ".[export]"    # + PDF export (fpdf2)
pip install ".[dev]"       # + pytest, coverage and ruff
```

This installs two commands:

```bash
budget-manager --help          # CLI
budget-manager-gui             # desktop app
```

From a clone, the scripts still run directly (`python budget_manager.py`,
`python budget_manager_gui.py`). `pip install -r requirements.txt` installs
every optional dependency at once — that is what CI uses.

---

## Quick Start

### CLI — Interactive

```bash
python budget_manager.py
```

Enter incomes and expenses when prompted. Leave the name blank to stop each section.

### CLI — From CSV

```bash
python budget_manager.py --input examples/sample.csv --month 2025-08
```

### CLI — JSON output (for automation)

```bash
python budget_manager.py --input examples/sample.csv --json --save-json report.json
```

### Desktop GUI

```bash
python budget_manager_gui.py
```

- Use the **Income** and **Expenses** tabs to add entries
- Set the **Month** field (YYYY-MM) in the toolbar
- Open the **Report** tab for totals, charts, and category breakdown
- **Export Excel** from the toolbar; **Export JSON** from the File menu
- **Open/Save CSV** to import or back up data

---

## CSV Format

```csv
type,name,category,amount,date
income,Salary,,5000,2025-08-01
expense,Rent,Housing,1500,2025-08-03
expense,Groceries,Food,400,2025-08
```

- `type`: `income` or `expense`
- `category`: optional for income; defaults to `Uncategorized` for expenses
- `amount`: non-negative number; invalid values default to 0
- `date`: `YYYY-MM` or `YYYY-MM-DD` (optional)
- Alternatively use separate `year`, `month`, `day` columns instead of `date`

---

## Repository Layout

```
Monthly-Budget-Manager/
├── monthly_budget/          # The package: domain model, i18n, theme, SQLite, exporters
├── budget_manager.py        # CLI entry point (re-export shim)
├── budget_manager_gui.py    # Desktop entry point (re-export shim)
├── mobile/                  # BeeWare Briefcase app (Toga + embedded HTML UI)
│   ├── pyproject.toml       # builds against ../monthly_budget, not a copy
│   └── src/budget_manager_mobile/   # app code only
├── web/                     # Static web app (published to GitHub Pages)
├── docs/                    # Assessment and improvement plan
├── examples/
│   └── sample.csv           # Example CSV file
├── tests/                   # pytest suite
└── .github/workflows/
    ├── python-ci.yml        # ruff + pytest on Python 3.10, 3.11, 3.12
    ├── release-gates.yml    # nine pre-release gates
    ├── release.yml          # desktop builds + Android APK → GitHub Release
    ├── daily-release.yml    # scheduled (date-versioned) release
    └── web-build.yml        # web tests + GitHub Pages deploy
```

---

## Running Tests

```bash
# Install the package in editable form, plus the dev tools
pip install -e ".[dev]"

# Run the suite
pytest tests/ -v

# Same run plus coverage (source and floor come from pyproject.toml)
pytest tests/ --cov

# Lint
ruff check monthly_budget/ mobile/src/budget_manager_mobile/ tests/ \
  budget_manager.py budget_manager_gui.py
```

Coverage is measured across `monthly_budget/` and the mobile app, and its floor
lives in `pyproject.toml` so CI and a local run agree. It sat at 32% while the
mobile app carried its own duplicate of the package; with the duplicate gone the
measured figure is 45% and the floor is set there. `monthly_budget/gui.py` and
`monthly_budget/exporter.py` are still untested and are most of what is missing.
The same config runs on Python 3.10, 3.11, and 3.12.

---

## Mobile (BeeWare)

The mobile app lives in `mobile/` and is built with Briefcase.

```bash
cd mobile
pip install briefcase

# Android
briefcase create android
briefcase build android
briefcase run android

# iOS (macOS only)
briefcase create iOS
briefcase build iOS
briefcase run iOS
```

**Compatibility notes:**
- Pins Toga 0.4.7 and Travertino 0.3.0 for stable mobile API
- Re-run `briefcase create` after changing `mobile/pyproject.toml`
- The app imports `monthly_budget` from the repository root: `sources` copies it
  into the bundle at build time, so there is one implementation, not two. Run
  `pip install -e .` before `briefcase run` from a checkout.

---

## Web

The static app in `web/` has no build step: open `web/index.html`, or serve the
directory. Its tests run with Jest:

```bash
cd web
npm ci
npm test        # runs with coverage; the floor is in jest.config.js
```

It is published to GitHub Pages by `web-build.yml` on every push to `main`
that touches `web/**`.

---

## CI/CD Pipelines

[![Python CI](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/python-ci.yml/badge.svg)](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/python-ci.yml)
[![Release Build](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/release.yml/badge.svg)](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/release.yml)

All pipelines run on GitHub Actions.

| Workflow | Runner | Trigger | What it does |
|---|---|---|---|
| `python-ci.yml` | `ubuntu-latest` | Push / PR → `main` | `ruff` over the real source + `pytest` with the coverage floor from `pyproject.toml`, on Python 3.10, 3.11 and 3.12 |
| `release-gates.yml` | `ubuntu-latest` | PR / tag `v*` | Nine gates: unit tests, integration, import smoke, accessibility scan, dependency and static security scan, secret scan, privacy checklist, performance smoke, changelog and version |
| `release.yml` | `windows-latest`, `ubuntu-latest`, `macos-latest` | Tag `v*.*.*` or manual dispatch | PyInstaller desktop builds (Windows `.zip`, Linux `.tar.gz`, macOS `.zip`) + Briefcase Android APK → GitHub Release |
| `daily-release.yml` | `ubuntu-latest` | Daily 06:30 UTC / manual | Date-versioned release with build artifacts |
| `web-build.yml` | `ubuntu-latest` | Push / PR touching `web/**` | Jest with coverage thresholds + GitHub Pages deploy |

### Artifacts

- **Coverage report**: `.coverage` artifact uploaded on Python 3.12 CI runs
- **Desktop builds**: `BudgetManager-windows-*.zip`, `BudgetManager-linux-*.tar.gz`, `BudgetManager-macos-*.zip` — attached to each GitHub Release
- **Android APK**: built via Briefcase on Ubuntu; attached to each GitHub Release

> **Note**: macOS builds are unsigned — allow them via System Settings → Privacy & Security. Linux: `chmod +x BudgetManager` after extraction.

---

## Contributing

1. Fork the repo and create a feature branch
2. Make your changes in `monthly_budget/` — `budget_manager.py` and
   `budget_manager_gui.py` are entry-point shims, not the implementation
3. Add or update tests in `tests/`
4. Run the same gates CI runs:
   ```bash
   pytest tests/ --cov -v    # source and coverage floor come from pyproject.toml
   ruff check monthly_budget/ mobile/src/budget_manager_mobile/ tests/ \
     budget_manager.py budget_manager_gui.py
   ```
5. Open a pull request — the CI workflow will run automatically

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/anubisland/Monthly-Budget-Manager/issues).

---

## License

MIT — see [`mobile/LICENSE`](mobile/LICENSE).
