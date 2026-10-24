# Monthly Budget Manager — Assessment & Improvement Plan

> Review date: 2026-10-24 · Branch: `main` · Basis: reading the source and actually running the test suites and CI gates locally.
> This is a discussion document. §1–3 are findings, §4 is a phased plan, §5 is the agenda to decide together.

---

## 1. What the app is today

Four front-ends over one Python domain model, plus a standalone JS app:

| Surface | Entry point | Size | Persistence |
|---|---|---|---|
| CLI | `budget_manager.py` (shim) → `monthly_budget/core.py` | 543 lines core | none (CSV in / JSON out) |
| Desktop GUI | `budget_manager_gui.py` → `monthly_budget/gui.py` | 2,382 lines | SQLite (`~/.monthly_budget/budgets.db`) |
| Mobile (BeeWare/Toga) | `mobile/src/budget_manager_mobile/app.py` + local HTTP API + WebView | ~2,900 lines Python + 1,967 lines HTML/JS | JSON (`data.json`, atomic writes) |
| Web | `web/index.html` + `script.js` + `tour.js` | 1,941 lines | `localStorage` |
| Tests | `tests/` + `web/__tests__/` | 4,450 lines Python, 420 lines JS | — |

Domain package `monthly_budget/` is **3,655 lines** — and **3,613 of those lines are duplicated verbatim** inside `mobile/src/budget_manager_mobile/monthly_budget/`. Only `core.py` differs.

Local run status: **580 Python tests pass** (39 need `XlsxWriter`, which `requirements.txt` provides) and **32 JS tests pass**.

---

## 2. Strong points (keep these, they are the product)

1. **Bilingual EN/AR with real RTL, end to end.**
   Locale files are at exact parity (251/251 keys in both `locale/en.json` and `locale/ar.json`; 88/88 in the web locales). The Tkinter layer swaps anchors, justification and table columns (`I18n.column_swap`), the web layer uses `dir="rtl"` plus logical CSS overrides, and the mobile spreadsheet export carries the on-screen language, currency symbol and reading direction into the file (`api._presentation`). Very few budget apps do Arabic properly; this is a differentiator, not a checkbox.

2. **One domain model, four shells.** Income/expense/category/profit-margin semantics are shared, so a CLI user and a mobile user get the same arithmetic. That is the reason the app could grow this wide.

3. **The mobile data layer is genuinely production-grade.** `store.py` gives atomic writes (`os.replace`), quarantine of unparseable files, a `.backup` copy before migration, schema versioning with a v1→v2 migration, and a defensive `decode.py` that drops bad records *and reports them* instead of crashing. `api.py` separates routing/validation from transport, every mutating route persists through `dispatch()`, and restore is deliberately two-step with a safety copy written first. This is better than most commercial apps of this size.

4. **The model is deeper than the usual "income minus expenses".** Envelope limits per category, recurring templates with weekly/biweekly/monthly/quarterly/yearly expansion, auto-category rules, goals whose progress is *derived* from real expenses (single source of truth), a pace/forecast module with calibrated tolerance thresholds, month-over-month comparison, trend series, 13 currencies (mobile), and five export formats (CSV, JSON, XLSX, PDF, OFX, QIF).

5. **A real test suite, not a ceremonial one.** 612 tests, and they test behaviour and edge cases: `test_mobile_page_wiring.py` checks the HTML still calls the API the backend exposes, `test_mobile_pace.py` covers forecast boundaries, `test_mobile_store.py` covers corrupt/future-version files. The mobile modules sit at 94–100% coverage.

6. **Release machinery already exists.** Nine release gates, gitleaks secret scanning, a 3-version Python matrix, PyInstaller builds for three OSes, a Briefcase Android build, and GitHub Pages deployment.

7. **Comments explain trade-offs, not mechanics.** The "why" notes in `pace.py`, `goals.py`, `store.py` and `api.py` are the kind of documentation teams usually lose first.

---

## 3. Weak points (ranked)

Each row: **what** · evidence · why it matters · rough fix cost.

### P0 — these undermine trust in the project

| # | Weakness | Evidence | Impact |
|---|---|---|---|
| 1 | **The domain code exists twice and has already diverged** | `diff -rq` → only `core.py` differs; `gui.py` is byte-identical at 2,382 lines. The desktop copy has envelope `budget_limits`; the mobile copy replaced it with a single `total_budget`. | Every core fix must be made twice, and the two "same" APIs already behave differently. This is the single biggest ceiling on the project. |
| 2 | **The quality gates cannot fail** | Coverage is measured with `--cov=budget_manager` — an **8-statement shim** — so CI reports **88%** while the real code is at **32%**; both `gui.py` copies and both `exporter.py` copies are at **0%**. `ruff` only lints the shim + tests (the real code has **58 violations**). Jest's 60% threshold never runs because CI calls `npm test` without `--coverage` (actual: 58.15% stmts / **37% branches**). The version gate greps `__version__` from `budget_manager.py`, which no longer defines one → silently skipped. `pip-audit`/`bandit` are wrapped in `|| echo warning` → never fail. The accessibility gate greps Tkinter font sizes and a `react-native/` folder that does not exist. | Green CI currently proves almost nothing. This hides every regression in #1 and #3. |
| 3 | **The web app is a data-loss trap** | `localStorage` holds one flat budget; `newBudget()` overwrites it after a `confirm()`. No month history, no backup/restore, no undo. The Month field is cosmetic — entries are never filtered by month, totals sum everything. | A single misclick destroys the user's data, and the month label lies about what the totals cover. The mobile app already solved both problems — the web app did not inherit the solution. |
| 4 | **The mobile local API is unauthenticated** | `Access-Control-Allow-Origin: *` on every response, no token, no `Origin`/`Host` check; `GET /api/data` returns the full financial dataset. | Any page or process on the device that finds the loopback port can read the user's finances. The port is random per launch, which lowers but does not remove the risk. |

### P1 — correctness and safety

| # | Weakness | Evidence | Impact |
|---|---|---|---|
| 5 | **Impossible dates are accepted** | `_is_valid_ymd("2025-02-31")` → `True`; only `1..31` is checked, not the month length. | A wrong-day entry silently lands in a wrong month in reports and exports. |
| 6 | **Money is `float` everywhere, with three independent rounding rules** | Python `round()`, JS `toFixed()`, Excel number formats; no shared contract. | Cents drift across sums, projections, goal funding and exports; the three surfaces can disagree on the same month. |
| 7 | **Bad input is silently coerced** | `read_csv` → bad amount becomes `0.0`; `model.parse_amount` → anything unparsable becomes `0.0`. | An import "succeeds" with wrong data and no warning. |
| 8 | **SQLite layer is weaker than the JSON layer next to it** | `save_budget` deletes and re-inserts every row, no transaction, no schema version, no migration path, no backup. | A failed write can leave a partially rewritten month; future schema changes have no route. |
| 9 | **Web CSV import does not implement the documented CSV format** | `lines[i].split(',')` → quoted fields with commas and embedded newlines break; no BOM/encoding handling (Arabic Excel exports). | The documented format works in the CLI and fails in the browser. |
| 10 | **Currency is hardcoded to `$`** | `core.print_report`, `exporter` PDF, GUI dashboard cards; mobile supports 13 currencies. | The same file says `EGP` on the phone and `$` on the desktop. |
| 11 | **Financial data has no lock or encryption** | SQLite, `data.json` and `localStorage` are plaintext; no PIN/biometric gate. | Anyone holding the unlocked device or a backup file reads everything. |
| 12 | **Web depends on live CDNs** | `cdn.tailwindcss.com` (dev-only build, no SRI, no CSP) + Google Fonts. | Breaks offline, leaks a request per load, adds supply-chain risk — in a tool that markets itself as local and private. |

### P2 — product and maintenance gaps

| # | Weakness | Evidence |
|---|---|---|
| 13 | Feature parity gaps: recurring templates are persisted in mobile but **have no API route or UI** there (desktop has a full recurring view); category limits exist only on desktop; trend/comparison exist only on mobile; no month analytics on web/CLI. |
| 14 | No search/filter, tags, notes, attachments, split transactions, transfers, or duplicate detection on import. |
| 15 | OFX and QIF are exported but never imported; no CSV column mapping for bank exports. |
| 16 | Accessibility: **0 `aria-*` attributes** across 32 buttons in the mobile UI, canvas charts with no text alternative, category meaning carried by colour; the desktop GUI has **no keyboard shortcuts** although the README advertises `Ctrl+O`, `Ctrl+S`, `F5`. |
| 17 | Docs have drifted: README documents a `react-native/` workspace and `react-native-build.yml` that do not exist, and tells contributors to edit `budget_manager.py` (now a re-export shim). |
| 18 | Release noise: a daily workflow publishes even when `has_changes=false` (the CHANGELOG is full of "No shippable change — re-published with updated date stamp"), and there are **four competing version numbers** (`pyproject` 1.0.0, `__init__` 2.0.0, mobile 1.2.2, tags `v2026.10.21`). |
| 19 | Not installable: no `[build-system]`, no `dependencies`, no console scripts → `pip install .` produces nothing; users clone the repo. |
| 20 | No static typing (no mypy/pyright), no ESLint/Prettier, no pre-commit, no Dependabot/Renovate. |
| 21 | Dead code: `mobile/.../model.py` is imported nowhere; `scripts/build-react-android.ps1` targets the missing `react-native/` app. |

---

## 4. The plan

Ordered so each phase makes the next one cheaper. Estimates are for one developer.

### Phase 0 — Make the truth visible (3–4 days)

Nothing else is safe until CI can tell you something failed.

- Point coverage at `monthly_budget` **and** `mobile/src/budget_manager_mobile`; set a realistic ratchet (start at today's real number, raise by 5 points per release) and list `gui.py` as an explicit known gap rather than hiding it.
- Run `ruff` over `monthly_budget/` and `mobile/src/`; fix the 58 findings; add `ruff format --check`.
- Make Jest run with `--coverage` so its thresholds apply; raise branch coverage after Phase 1 (the shared-vector tests will do most of the work).
- Fix the version gate to read `monthly_budget/__init__.py`; delete the vacuous accessibility gate and replace it with a real check (axe-core for the web page, `aria` assertions for the mobile HTML).
- Make `pip-audit` and `bandit` blocking (or fail only on new findings).
- Single version source; README truth pass; delete `model.py` and the dead PowerShell script.

**Done when:** you can break one test, one lint rule and one coverage threshold and CI goes red for the right reason; README matches the repo.

### Phase 1 — One core, one contract (1–2 weeks)

- Make `monthly_budget` a real installable package (build-system, dependencies, `budget-manager` / `budget-manager-gui` console scripts).
- Delete `mobile/src/budget_manager_mobile/monthly_budget/`; make mobile depend on the package. Reconcile the divergence deliberately: keep envelope limits **and** the total budget in one model.
- Write **golden vectors** — one JSON file of inputs/expected outputs for totals, percentages, rounding, date validation, recurring expansion, goal funding — and run it from Python *and* from JS. This is what keeps four surfaces honest.
- Switch money to integer minor units (cents) at the boundary, with one formatter per language; migrations for existing data.
- Fix `_is_valid_ymd` with `calendar.monthrange`; stop coercing bad amounts to zero — report rejected rows.

**Done when:** one source tree, and the same fixture produces byte-identical numbers from Python and JS.

### Phase 2 — Data safety and security (1–2 weeks)

- **Web:** adopt the month-keyed model (mirror the mobile schema), migrate existing `localStorage`, add backup/restore JSON, undo for delete/clear, and replace the "New Budget" wipe with per-month creation.
- **Mobile:** per-launch token in the request (header or a path segment), validate `Origin`/`Host`, drop `Access-Control-Allow-Origin: *` (same-origin does not need it), add a CSP to the WebView page.
- **SQLite:** a `schema_version` table, transactional saves, soft delete + undo, automatic rotating backup.
- Optional but recommended for a finance app: encryption at rest plus a PIN/biometric lock on mobile.

**Done when:** no UI path in any surface can lose data; a foreign-origin request to the mobile API is rejected; restore is tested against corrupt, future-version and v1 files.

### Phase 3 — Make one surface excellent (3–4 weeks)

Recommendation: **mobile is the flagship** (best data layer, strongest differentiator, most-used form factor), **web is the shareable demo**, desktop is kept at maintenance, CLI stays as the automation path.

- Parity on the flagship: recurring UI + routes, category limits, edit everywhere, undo, search/filter by text/category/date.
- Insight the competitors don't have: "safe to spend per day", projected month-end range (you already have `pace.py`), category vs 3-month average, budget health score.
- Import: OFX/QIF import, CSV column mapping, duplicate detection.
- Accessibility and i18n completeness pass; bundle fonts/CSS locally.

**Done when:** a published feature matrix shows no silent gap between surfaces, and an axe run is clean.

### Phase 4 — Distribution and sustainability (1–2 weeks, then ongoing)

- Release only on real change; one version number; signed AAB for the Play Store internal track; keep APK for side-loading.
- `ARCHITECTURE.md`, `CONTRIBUTING.md`, screenshots, a demo dataset.
- Dependabot/Renovate; a documented deprecation policy for the desktop GUI.

---

## 5. Agenda for the brainstorm

These are the decisions that change the plan's shape. My recommendation is in italics.

1. **Which surface is the product?** All four are maintained today, which is why #1 exists. *Mobile flagship + web demo; desktop frozen; CLI kept.*
2. **Do we keep the Tkinter GUI?** 2,382 untested lines, and it duplicates every feature. *Keep, but freeze: bug fixes only, one smoke test, no new features.*
3. **Money representation.** *Integer minor units* (Decimal is defensible; float should go).
4. **Storage: JSON or SQLite?** *One canonical document schema with per-platform adapters* — the mobile JSON store is better engineered than the SQLite one; the SQLite layer should copy its guarantees.
5. **Any cloud sync?** *Not yet.* Encrypted export/import first; sync is a different product with accounts, keys and support costs.
6. **Bank sync / aggregators?** High cost, weak coverage in MENA, and it breaks the local-first promise. *Not now.*
7. **Security posture.** Lock screen only, or encryption too? Encryption adds key-management failure modes (lost data). *PIN lock now, encryption as an explicit opt-in.*
8. **Distribution.** Play Store, F-Droid, APK-only, and is it free? *Play internal track + APK; keep it free until the flagship is solid.*
9. **Test strategy.** *Contract vectors (Phase 1) + Playwright for web + one xvfb smoke run for the GUI*; stop growing bespoke per-surface logic tests.
10. **Repo layout.** *One installable package + `apps/` (desktop, mobile, web)* so duplication cannot come back.

---

## 6. How we'll know it worked

| Metric | Today | Target |
|---|---|---|
| Real line coverage (domain + mobile) | 32% | 70%+ |
| Gate integrity (does a seeded failure fail CI?) | No | Yes |
| Duplicated domain lines | 3,613 | 0 |
| Data-loss paths (no undo/backup) | 1 (web) | 0 |
| Cross-surface mismatches on golden vectors | unknown | 0 |
| a11y violations (mobile + web) | unknown | 0 |
| External network requests at runtime | 3 (CDNs) | 0 |
| Version numbers in the repo | 4 | 1 |

---

## 7. What I did not verify

- I did not run the BeeWare app on a device or emulator, or the Tkinter GUI (headless environment), and I did not build the Android APK. UI statements come from the code and its tests, not from manual runs.
- The 39 spreadsheet tests need `XlsxWriter` (declared in `requirements.txt`); they pass once it is installed — the failures I saw first were environmental, not code defects.
- Web rendering was checked through Jest/jsdom only; no browser was opened.
