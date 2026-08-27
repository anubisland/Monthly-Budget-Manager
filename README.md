# Monthly Budget Manager

[![Python CI](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/python-ci.yml/badge.svg)](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/python-ci.yml)
[![Release Build](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/release.yml/badge.svg)](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/release.yml)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](mobile/LICENSE)

A cross-platform personal finance tool for tracking monthly income and expenses with category breakdowns, charts, and export options.

Available as:
- **CLI** — pure stdlib, zero external deps, scriptable and automation-friendly
- **Desktop GUI** — Tkinter app with charts and Excel/CSV export
- **Mobile** — Android/iOS via BeeWare Briefcase + Toga
- **React Native** — Android/iOS/Windows/macOS via the `react-native/` workspace

---

## Features

- Add income and expenses interactively or import from CSV
- Category breakdowns: amount, % of income, % of expenses
- Profit margin calculation
- JSON output for pipelines and automation
- GUI with live charts (bar: income vs expenses; pie: expense categories)
- Export to Excel (`.xlsx`) with formatted tables and embedded charts
- Calendar date picker and category picker in GUI
- Keyboard shortcuts: `Ctrl+O` open, `Ctrl+S` save, `F5` refresh report
- Preferences: remembers last selected month between sessions
- Mobile app (Android/iOS) via BeeWare Briefcase
- React Native desktop and mobile apps

---

## Requirements

| Component | Requirement |
|-----------|-------------|
| CLI (`budget_manager.py`) | Python 3.10+, no external deps |
| GUI (`budget_manager_gui.py`) | Python 3.10+, `openpyxl` |
| Mobile | Python 3.10+, `briefcase` |
| React Native | Node 20+ |

Install Python dependencies:

```bash
pip install -r requirements.txt
```

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
├── budget_manager.py        # Core library + CLI (pure stdlib)
├── budget_manager_gui.py    # Tkinter GUI (requires openpyxl)
├── requirements.txt         # Runtime Python dependencies
├── examples/
│   └── sample.csv           # Example CSV file
├── tests/
│   └── test_budget_manager.py  # pytest unit tests (≥80% coverage)
├── mobile/                  # BeeWare Briefcase mobile app
│   ├── pyproject.toml
│   └── src/budget_manager_mobile/
├── react-native/            # React Native monorepo (Android/iOS/Windows/macOS)
│   ├── apps/
│   │   ├── mobile/          # React Native mobile app
│   │   └── desktop/         # React Native Windows/macOS app
│   └── packages/
│       ├── shared/          # Shared business logic (TypeScript)
│       └── adapters/        # Platform adapters
└── .github/workflows/
    ├── python-ci.yml        # Python lint + test (runs on every PR/push)
    ├── release.yml          # Desktop + mobile build and GitHub Release
    └── react-native-build.yml  # React Native build (Android/iOS/Win/macOS)
```

---

## Running Tests

```bash
# Install dev dependencies
pip install pytest pytest-cov ruff

# Run tests with coverage report
pytest tests/ --cov=budget_manager --cov-report=term-missing -v

# Lint
ruff check budget_manager.py
```

The CI workflow enforces ≥80% line coverage on Python 3.10, 3.11, and 3.12.

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

---

## React Native

The `react-native/` workspace is an npm monorepo. See [`react-native/README.md`](react-native/README.md) for full setup instructions.

```bash
cd react-native
npm install --workspaces --include-workspace-root
npm run build -w @monthly-budget/shared
npm run build -w @monthly-budget/adapters
```

---

## CI/CD Pipelines

[![Python CI](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/python-ci.yml/badge.svg)](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/python-ci.yml)
[![Release Build](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/release.yml/badge.svg)](https://github.com/anubisland/Monthly-Budget-Manager/actions/workflows/release.yml)

All pipelines run on GitHub Actions.

| Workflow | Runner | Trigger | What it does |
|---|---|---|---|
| `python-ci.yml` | `ubuntu-latest` | Push / PR → `main` | `ruff` lint + `pytest` with ≥80% coverage matrix (Python 3.10, 3.11, 3.12) |
| `release.yml` | `windows-latest`, `ubuntu-latest`, `macos-latest` | Push / tag `v*.*.*` or manual dispatch | PyInstaller desktop builds (Windows `.zip`, Linux `.tar.gz`, macOS `.zip`) + Briefcase Android APK → GitHub Release |
| `react-native-build.yml` | `ubuntu-latest`, `macos-latest` | Push / PR → `main` | React Native builds |

### Artifacts

- **Coverage report**: `.coverage` artifact uploaded on Python 3.12 CI runs
- **Desktop builds**: `BudgetManager-windows-*.zip`, `BudgetManager-linux-*.tar.gz`, `BudgetManager-macos-*.zip` — attached to each GitHub Release
- **Android APK**: built via Briefcase on Ubuntu; attached to each GitHub Release

> **Note**: macOS builds are unsigned — allow them via System Settings → Privacy & Security. Linux: `chmod +x BudgetManager` after extraction.

---

## Contributing

1. Fork the repo and create a feature branch
2. Make your changes in `budget_manager.py` (core) or `budget_manager_gui.py` (GUI)
3. Add or update tests in `tests/test_budget_manager.py`
4. Ensure all tests pass and coverage stays at ≥80%:
   ```bash
   pytest tests/ --cov=budget_manager --cov-fail-under=80
   ```
5. Open a pull request — the CI workflow will run automatically

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/anubisland/Monthly-Budget-Manager/issues).

---

## License

MIT — see [`mobile/LICENSE`](mobile/LICENSE).
