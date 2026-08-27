# Make the app actually monthly — core, persistence, screens, entry, comparison, recurring

## ⚠️ Read this first: feature overlap with `main`

While this branch was in progress, `main` gained eleven commits building **the same four features on the Python surfaces** that this branch built for React Native:

| `main` commit | This branch |
|---|---|
| `5b94ebf` month-over-month comparison view | Phase 5, comparison tab |
| `fd92cbf` recurring transactions with auto-apply | Phase 6, recurring suggestions |
| `5d48600` SQLite persistence with auto-save/load | Phase 2, month-keyed persistence |
| `0f0a9eb` bilingual GUI overhaul with Arabic/English i18n | Phase 3, typed i18n layer |

**There is zero file overlap** — verified with `git merge-tree`, and `main`'s eleven commits never touch `react-native/`. `origin/main` is merged into this branch and everything passes, so this is not a conflict.

But comparison, recurring items, persistence and Arabic/English now exist **twice**: once in Python (`monthly_budget/`, `budget_manager_gui.py`, `mobile/`) and once in React Native (`react-native/`).

**Nothing has been deleted, and this MR takes no position on which surface should survive.** That is the owner's call. This MR is reviewable on its own merits either way.

---

## The problem this solves

The app is called "Monthly Budget Manager" but was not monthly. An audit at the start of this work found:

- **F1** — the month field in all five frontends was a cosmetic label that filtered nothing and stored nothing. A January expense and an August expense appeared together under whichever month was selected.
- **F2** — no comparison logic anywhere. A repo-wide search for `previous`, `compare`, `delta`, `trend` returned one calendar-widget button.
- **F3** — switching month in React Native relabelled the same data, and saving then overwrote the previous month irrecoverably.
- **F11** — the three existing charts worked but read every loaded entry regardless of date, so they were misleading rather than missing.
- **F12** — four competing `useEffect` hooks wrote the same document under two storage keys; an unguarded save could fire with empty state before the load returned and overwrite real data.

All five are closed. F5 (business logic duplicated three times) stays **partially open by decision** — the CLI, Tkinter and BeeWare surfaces were frozen, so their logic was not unified.

## Scope

React Native mobile app + the shared TypeScript core. The Python surfaces were frozen by decision and are untouched by this branch.

## What is in it

**Phase 0–1 — a month-aware core.** Ten single-responsibility modules in `@monthly-budget/shared`: month arithmetic, an immutable month-keyed store, month-scoped totals, comparison, suggestions, recurring detection, and v0→v1 migration. Also removed 4,959 committed `node_modules` files (98% of the repo's tracked files) and added a repo-wide ignore rule.

**Phase 2 — persistence that does not lose data.** One storage key replacing two, an init guard so nothing is written before the first read completes, autosave on every change, atomic writes, corrupt data preserved rather than deleted, a verbatim backup written *before* any migration, and save failures surfaced to the user instead of `console.error`.

**Phase 3 — month bar, charts, i18n.** Navigate months and refuse future ones; all three charts read the displayed month; `react-native-chart-kit` replaced with components over `react-native-svg`; a typed Arabic/English layer where a missing translation is a compile error; instant language switching without `I18nManager`. `App.tsx` went from 1,263 lines to 313.

**Phase 4 — multiple-choice entry.** Adding an entry is four taps and one typed number. The amount field is the only keyboard in the app, plus a custom-name field behind an explicit "other". Names are suggested from the same category in past months; amounts from the same item.

**Phase 5 — the comparison tab.** Four headline metrics, a grouped bar chart scaled against one shared maximum, and a category table. A month with no predecessor shows an empty state rather than zeros dressed as a comparison.

**Phase 6 — recurring items.** When a month opens, the items that recur are offered one tap each. "Not this month" is remembered and returns the following month.

## Verification

| | |
|---|---|
| Tests | **768** — 234 shared, 372 mobile, 162 Python |
| Coverage | **100%** statements, branches, functions, lines in both TS packages |
| Typechecks | mobile ✓ `apps/desktop` ✓ |
| Builds | `shared` ✓ `adapters` ✓ |
| Tracked files | 5,047 → 165 |

`apps/desktop` compiles throughout: every change to the shared package is additive, and CI now enforces that with a `tsc --noEmit` on it.

## Notable defects found and fixed along the way

Each of these was reproduced before being fixed, and each has a regression test:

- **A future-format store was loaded as an empty budget and then destroyed.** `isUsable` validated migration's *output*, never its *input*; migration returns an empty store for anything it does not recognise, and an empty store passes trivially. A `version: 2` payload loaded blank, unflagged, unpreserved — and the first autosave overwrote the original.
- **Migration silently zeroed every formatted amount.** `Number('1,500.00')` is `NaN`, which became `0`. A user's rent would have migrated as zero.
- **Two identical months compared as "changed by −0.00".** Identical amounts entered in a different order sum to different floats 37% of the time, and `compareMonths` tested exact equality.
- **An entry recorded on 1 August displayed as 31** for everyone in the Americas — `new Date('YYYY-MM-DD')` parses as UTC and `.getDate()` is local.
- **Recurring templates ranked by insertion order, not date.** Rent dated the 20th entered before rent dated the 1st produced a stale pre-fill.
- **A stale compiled `index.js` shadowed `index.ts`** — Jest resolves `.js` first, so tests were exercising dead code.
- **`back` in the entry sheet walked into the step it was opened to skip**, hidden by a test asserting `toContain(['kind','category'])`, which cannot fail.
- **The i18n `/g` flag was untested while production depended on it** — dropping it left the comparison heading half-substituted with the whole suite green.
- **CI never ran the mobile suite at all.** 372 tests, including every persistence guarantee, had never run in CI.

## Known open items

Deliberate, and documented rather than hidden:

- **43 pre-existing transitive dependency vulnerabilities** (2 critical, 23 high). All are build/dev dependencies — `metro`, `@babel/*`, `react-native-windows`, `lodash`, `ws` — none reachable from the shipped app's runtime. Not introduced here and not addressed here; raised so the owner decides rather than inheriting silence.
- **19 `.tsx` files (~2,000 lines) are outside the coverage denominator.** `testEnvironment: node` cannot render React, so the 100% figure covers pure `.ts` modules only. Component testing needs a device harness.
- **`store.recurring` is written by nothing.** Kept because `isUsable` and `asUsableV1Store` both reject a store whose `recurring` is not an array, so removing it now would route every store written by a later version to `'corrupt'`.
- **`App.tsx` is 313 lines** against a ~200 target. The four file-operation handlers act on the whole month and have no screen home; splitting them would create files that must always change together.
- **11 unused i18n keys** remain after the typed forms were deleted.
- **Migration clamps negative amounts to zero**, so a v0 refund of −40 becomes 0. Tested and deliberate, but it alters money during a one-way automatic conversion and deserves an explicit note in the migration banner.
- **F5 stays partially open.** Python and TypeScript still hold separate implementations of the same arithmetic.

## Design docs

- Spec: `docs/superpowers/specs/2026-08-26-monthly-budget-design.md`
- Plans: `docs/superpowers/plans/` (one per phase)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
