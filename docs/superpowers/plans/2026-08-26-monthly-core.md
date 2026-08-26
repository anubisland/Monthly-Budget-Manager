# Monthly Core Implementation Plan (Phases 0 + 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean the repository and build a fully tested, month-aware TypeScript core so that every later UI phase reads and writes data scoped to a single month.

**Architecture:** All month logic lives in `react-native/packages/shared` as ten small single-responsibility modules, each with a colocated test file. The core is pure — no I/O, no React, no AsyncStorage, no `Date.now()` in any code path that tests exercise (today is always injectable). Storage and UI arrive in Phase 2+ and consume this core.

**Tech Stack:** TypeScript 5.4 (strict), Jest 29 + ts-jest, npm workspaces, Node 22 local / Node 20 CI.

## Global Constraints

- **Additive only, never breaking.** `apps/desktop` imports `totals`, `expensesByCategory`, `serialize`, and `deserialize` from this package and CI builds it. These four exports must keep their exact current signatures and behavior. Verified by Task 12.
- **Target file size: 120 lines max per module.** Split by responsibility, not by line count.
- **No `Date.now()`, `new Date()` with no argument, or `Math.random()` inside core functions.** Every function that needs today takes an injectable `today: Date` parameter defaulting to `new Date()`. Tests always pass an explicit date.
- **`MonthKey` is the string format `"YYYY-MM"`** — zero-padded month, sortable lexicographically.
- **Category `id` values are stable ASCII slugs and are never translated.** Display names come from the i18n layer (Phase 2).
- **No silent error swallowing.** No `catch` that only logs. Core functions either return a typed result or throw.
- **Amount rounding:** `parseAmount` rounds to 2 decimals via `Math.round(n * 100) / 100`. This matches current behavior and must not change.
- **Locale type is `'ar' | 'en'`** everywhere.
- **Commit after every task.** Conventional commit prefixes: `chore:`, `feat:`, `test:`, `ci:`.

---

## File Structure

### Phase 0 — repository and tooling

| Path | Responsibility |
|---|---|
| `.gitignore` | Modify: add a repo-wide `**/node_modules/` rule |
| `web/` | Delete: contains only committed `node_modules`, no source |
| `react-native/packages/shared/package.json` | Modify: add `test` script and Jest devDependencies |
| `react-native/packages/shared/jest.config.js` | Create: ts-jest config with coverage thresholds |
| `react-native/packages/shared/tsconfig.json` | Modify: exclude `*.test.ts` from the build output |
| `.github/workflows/core-ci.yml` | Create: typecheck + test the shared package |

### Phase 1 — the core modules

| Path | Responsibility |
|---|---|
| `src/money.ts` | Parse and format amounts |
| `src/month.ts` | `MonthKey` arithmetic, validation, labels |
| `src/model.ts` | Type declarations only, zero logic |
| `src/categories.ts` | The fixed expense/income taxonomy |
| `src/ids.ts` | Entry id generation, injectable for tests |
| `src/store.ts` | Immutable store read/write helpers |
| `src/totals.ts` | Month-scoped totals and category breakdown |
| `src/compare.ts` | Current-vs-previous deltas with metric-aware `favorable` |
| `src/history.ts` | Name and amount suggestions from past months |
| `src/recurring.ts` | Recurring template detection and suggestions |
| `src/migrate.ts` | v0 single-document → v1 month-keyed store |
| `src/index.ts` | Modify: barrel that also re-exports the legacy API |

All test files are colocated as `src/<name>.test.ts`.

---

## Task 1: Repository hygiene

**Files:**
- Modify: `.gitignore`
- Delete: `web/` (4,959 tracked files, all `node_modules`)

**Interfaces:**
- Consumes: nothing
- Produces: nothing — this task only removes tracked files and prevents recurrence

- [ ] **Step 1: Confirm `web/` holds no source code**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git ls-files web/ | grep -v "^web/node_modules/" ; echo "EXIT:$?"
```

Expected: no file paths printed, and `EXIT:1` (grep found no non-node_modules files). If any path IS printed, STOP and report it — the directory has source that must be preserved.

- [ ] **Step 2: Count what is tracked, to verify the reduction later**

```bash
git ls-files | wc -l
```

Expected: `5045`

- [ ] **Step 3: Add the repo-wide ignore rule**

Replace the existing narrow rule with a general one. In `.gitignore`, find this line:

```
react-native/**/node_modules/
```

Replace it with:

```
**/node_modules/
```

- [ ] **Step 4: Untrack and delete the directory**

```bash
git rm -r --quiet --cached web/node_modules
rm -rf web
```

- [ ] **Step 5: Verify the reduction**

```bash
git ls-files | wc -l
```

Expected: `86`

- [ ] **Step 6: Verify node_modules can no longer be staged**

```bash
git status --porcelain | grep node_modules ; echo "EXIT:$?"
```

Expected: nothing printed, `EXIT:1`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: untrack web/node_modules and ignore node_modules repo-wide

The last commit added 4959 files from web/node_modules -- 98% of all
tracked files -- because .gitignore only excluded react-native/**/node_modules/.
The web/ directory contained no source code, only dependencies, so it is
removed entirely.

Tracked files: 5045 -> 86.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Jest test infrastructure and CI

**Files:**
- Modify: `react-native/packages/shared/package.json`
- Create: `react-native/packages/shared/jest.config.js`
- Modify: `react-native/packages/shared/tsconfig.json`
- Create: `react-native/packages/shared/src/smoke.test.ts` (temporary, deleted in Step 8)
- Create: `.github/workflows/core-ci.yml`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test -w @monthly-budget/shared` runs Jest over `src/**/*.test.ts`; every later task depends on this command working.

- [ ] **Step 1: Add the test script and Jest dependencies**

Replace the entire contents of `react-native/packages/shared/package.json` with:

```json
{
  "name": "@monthly-budget/shared",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -b",
    "clean": "rimraf dist",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/jest": "^29.5.13",
    "jest": "^29.7.0",
    "rimraf": "^6.0.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create the Jest config**

Create `react-native/packages/shared/jest.config.js`:

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.test.ts'],
  coverageThreshold: {
    global: { lines: 90, statements: 90, functions: 90, branches: 80 },
  },
};
```

- [ ] **Step 3: Keep tests out of the build output**

Replace the entire contents of `react-native/packages/shared/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "outDir": "dist",
    "module": "CommonJS",
    "rootDir": "src",
    "types": ["jest"]
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"]
}
```

- [ ] **Step 4: Install the new dependencies**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm install --workspaces --include-workspace-root
```

Expected: completes without `ERR!`. `ts-jest` and `jest` appear under `node_modules`.

- [ ] **Step 5: Write a smoke test to prove the harness runs**

Create `react-native/packages/shared/src/smoke.test.ts`:

```ts
describe('jest harness', () => {
  it('runs TypeScript tests', () => {
    const doubled: number = [1, 2, 3].reduce((a, b) => a + b, 0) * 2;
    expect(doubled).toBe(12);
  });
});
```

- [ ] **Step 6: Run it**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared
```

Expected: `Tests: 1 passed, 1 total`.

- [ ] **Step 7: Verify the build still excludes tests**

```bash
npm run build -w @monthly-budget/shared
ls packages/shared/dist/ | grep -c "smoke"
```

Expected: `0` — no test artifacts in `dist`.

- [ ] **Step 8: Delete the smoke test**

```bash
rm packages/shared/src/smoke.test.ts
```

- [ ] **Step 9: Create the CI workflow**

Create `.github/workflows/core-ci.yml`:

```yaml
name: Core CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:

concurrency:
  group: core-ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  shared:
    name: Typecheck & Test (shared core)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: react-native
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: react-native/package-lock.json

      - name: Install dependencies
        run: npm install --workspaces --include-workspace-root

      - name: Typecheck
        run: npm run typecheck -w @monthly-budget/shared

      - name: Test with coverage
        run: npm run test:coverage -w @monthly-budget/shared

      - name: Build shared package
        run: npm run build -w @monthly-budget/shared

      - name: Build adapters package
        run: npm run build -w @monthly-budget/adapters
```

Runner note: `ubuntu-latest` at 1x. This repository is public, so Actions minutes are free; `concurrency` is set anyway so superseded runs cancel.

- [ ] **Step 10: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/package.json \
        react-native/packages/shared/jest.config.js \
        react-native/packages/shared/tsconfig.json \
        react-native/package-lock.json \
        .github/workflows/core-ci.yml
git commit -m "ci: add jest to shared core and a Core CI workflow

The shared TypeScript package had no tests at all while its Python
counterpart enforced 80% coverage (audit finding F8). Adds ts-jest with
90% line coverage enforced, keeps test files out of dist, and wires a
Core CI job that typechecks, tests, and builds both TS packages.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `money.ts` — amount parsing and formatting

**Files:**
- Create: `react-native/packages/shared/src/money.ts`
- Create: `react-native/packages/shared/src/money.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `parseAmount(v: unknown): number`
  - `formatMoney(amount: number, currency: string, locale: 'ar' | 'en'): string`
  - `type Locale = 'ar' | 'en'`

`formatMoney` is hand-rolled rather than using `Intl.NumberFormat`. Reason: Hermes on Android has historically shipped incomplete `Intl` support, and a hand-rolled grouper is ~15 lines, fully deterministic in tests, and removes a platform risk.

- [ ] **Step 1: Write the failing tests**

Create `react-native/packages/shared/src/money.test.ts`:

```ts
import { parseAmount, formatMoney } from './money';

describe('parseAmount', () => {
  it('passes through a number', () => {
    expect(parseAmount(1234.56)).toBe(1234.56);
  });

  it('parses a plain numeric string', () => {
    expect(parseAmount('1234.56')).toBe(1234.56);
  });

  it('strips thousands separators and spaces', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount(' 1 234.56 ')).toBe(1234.56);
  });

  it('rounds to two decimals', () => {
    expect(parseAmount(1.005)).toBe(1.01);
    expect(parseAmount('2.348')).toBe(2.35);
  });

  it('returns 0 for unparseable input', () => {
    expect(parseAmount('abc')).toBe(0);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount(NaN)).toBe(0);
    expect(parseAmount(Infinity)).toBe(0);
  });

  it('preserves negative values -- clamping is the store layer job', () => {
    expect(parseAmount(-50)).toBe(-50);
  });
});

describe('formatMoney', () => {
  it('groups thousands and always shows two decimals', () => {
    expect(formatMoney(1234.5, 'SAR', 'en')).toBe('SAR 1,234.50');
    expect(formatMoney(0, 'SAR', 'en')).toBe('SAR 0.00');
    expect(formatMoney(1000000, 'USD', 'en')).toBe('USD 1,000,000.00');
  });

  it('puts the currency after the amount in Arabic', () => {
    expect(formatMoney(1234.5, 'SAR', 'ar')).toBe('1,234.50 SAR');
  });

  it('formats negatives with the sign before the whole value', () => {
    expect(formatMoney(-99.9, 'USD', 'en')).toBe('-USD 99.90');
    expect(formatMoney(-99.9, 'USD', 'ar')).toBe('-99.90 USD');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- money
```

Expected: FAIL with `Cannot find module './money'`.

- [ ] **Step 3: Write the implementation**

Create `react-native/packages/shared/src/money.ts`:

```ts
export type Locale = 'ar' | 'en';

/**
 * Parse an arbitrary value into an amount rounded to 2 decimals.
 * Returns 0 for anything unparseable. Negatives pass through -- clamping
 * to non-negative is the store layer's job, not the parser's.
 */
export function parseAmount(v: unknown): number {
  const n =
    typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[,\s]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Group the integer part with commas: 1234567 -> "1,234,567" */
function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format an amount with its currency code.
 * English places the code first, Arabic places it last.
 * Hand-rolled rather than Intl.NumberFormat: Hermes on Android has shipped
 * incomplete Intl support, and this is deterministic across platforms.
 */
export function formatMoney(amount: number, currency: string, locale: Locale): string {
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const value = `${groupThousands(intPart)}.${decPart}`;
  const body = locale === 'ar' ? `${value} ${currency}` : `${currency} ${value}`;
  return negative ? `-${body}` : body;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -w @monthly-budget/shared -- money
```

Expected: `Tests: 9 passed, 9 total`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/money.ts react-native/packages/shared/src/money.test.ts
git commit -m "feat(core): add money parsing and locale-aware formatting

parseAmount keeps the existing rounding behavior so the legacy export
stays byte-compatible. formatMoney is hand-rolled instead of using
Intl.NumberFormat because Hermes on Android has shipped incomplete Intl
support; this also makes the tests deterministic across platforms.

Removes the hardcoded \$ that finding F10 flagged -- currency is now a
parameter.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `month.ts` — the month key

**Files:**
- Create: `react-native/packages/shared/src/month.ts`
- Create: `react-native/packages/shared/src/month.test.ts`

**Interfaces:**
- Consumes: `Locale` from `./money`
- Produces:
  - `type MonthKey = string`
  - `isValidMonthKey(k: string): boolean`
  - `monthKey(date: string): MonthKey | null`
  - `currentMonthKey(today?: Date): MonthKey`
  - `prevKey(k: MonthKey): MonthKey`
  - `nextKey(k: MonthKey): MonthKey`
  - `isFutureKey(k: MonthKey, today?: Date): boolean`
  - `monthLabel(k: MonthKey, locale: Locale): string`
  - `compareKeys(a: MonthKey, b: MonthKey): number`

- [ ] **Step 1: Write the failing tests**

Create `react-native/packages/shared/src/month.test.ts`:

```ts
import {
  isValidMonthKey,
  monthKey,
  currentMonthKey,
  prevKey,
  nextKey,
  isFutureKey,
  monthLabel,
  compareKeys,
} from './month';

describe('isValidMonthKey', () => {
  it('accepts a well-formed key', () => {
    expect(isValidMonthKey('2026-08')).toBe(true);
    expect(isValidMonthKey('2026-01')).toBe(true);
    expect(isValidMonthKey('2026-12')).toBe(true);
  });

  it('rejects malformed or out-of-range keys', () => {
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-00')).toBe(false);
    expect(isValidMonthKey('2026-8')).toBe(false);
    expect(isValidMonthKey('26-08')).toBe(false);
    expect(isValidMonthKey('2026/08')).toBe(false);
    expect(isValidMonthKey('')).toBe(false);
    expect(isValidMonthKey('2026-08-14')).toBe(false);
  });
});

describe('monthKey', () => {
  it('extracts the month from a full date', () => {
    expect(monthKey('2026-08-14')).toBe('2026-08');
  });

  it('passes through a month-only value', () => {
    expect(monthKey('2026-08')).toBe('2026-08');
  });

  it('returns null for invalid input', () => {
    expect(monthKey('not-a-date')).toBeNull();
    expect(monthKey('2026-13-01')).toBeNull();
    expect(monthKey('')).toBeNull();
  });
});

describe('currentMonthKey', () => {
  it('derives the key from the injected date', () => {
    expect(currentMonthKey(new Date(2026, 7, 26))).toBe('2026-08');
  });

  it('zero-pads single-digit months', () => {
    expect(currentMonthKey(new Date(2026, 0, 5))).toBe('2026-01');
  });
});

describe('prevKey', () => {
  it('steps back within a year', () => {
    expect(prevKey('2026-08')).toBe('2026-07');
  });

  it('crosses the year boundary backwards', () => {
    expect(prevKey('2026-01')).toBe('2025-12');
  });
});

describe('nextKey', () => {
  it('steps forward within a year', () => {
    expect(nextKey('2026-08')).toBe('2026-09');
  });

  it('crosses the year boundary forwards', () => {
    expect(nextKey('2026-12')).toBe('2027-01');
  });
});

describe('prevKey and nextKey round-trip', () => {
  it('returns to the original key across year boundaries', () => {
    expect(nextKey(prevKey('2026-01'))).toBe('2026-01');
    expect(prevKey(nextKey('2026-12'))).toBe('2026-12');
  });
});

describe('isFutureKey', () => {
  const today = new Date(2026, 7, 26); // 2026-08

  it('is false for the current month', () => {
    expect(isFutureKey('2026-08', today)).toBe(false);
  });

  it('is false for a past month', () => {
    expect(isFutureKey('2026-07', today)).toBe(false);
    expect(isFutureKey('2025-12', today)).toBe(false);
  });

  it('is true for a future month', () => {
    expect(isFutureKey('2026-09', today)).toBe(true);
    expect(isFutureKey('2027-01', today)).toBe(true);
  });
});

describe('monthLabel', () => {
  it('labels in Arabic', () => {
    expect(monthLabel('2026-08', 'ar')).toBe('أغسطس 2026');
    expect(monthLabel('2026-01', 'ar')).toBe('يناير 2026');
  });

  it('labels in English', () => {
    expect(monthLabel('2026-08', 'en')).toBe('August 2026');
    expect(monthLabel('2026-01', 'en')).toBe('January 2026');
  });

  it('returns the raw key when it is invalid', () => {
    expect(monthLabel('nonsense', 'en')).toBe('nonsense');
  });
});

describe('compareKeys', () => {
  it('orders chronologically', () => {
    expect(compareKeys('2026-07', '2026-08')).toBeLessThan(0);
    expect(compareKeys('2026-08', '2026-07')).toBeGreaterThan(0);
    expect(compareKeys('2026-08', '2026-08')).toBe(0);
  });

  it('sorts a list chronologically across years', () => {
    const keys = ['2026-01', '2025-12', '2026-10', '2026-02'];
    expect([...keys].sort(compareKeys)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-10',
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- month
```

Expected: FAIL with `Cannot find module './month'`.

- [ ] **Step 3: Write the implementation**

Create `react-native/packages/shared/src/month.ts`:

```ts
import type { Locale } from './money';

/** A month in `YYYY-MM` form. Sorts lexicographically in chronological order. */
export type MonthKey = string;

const KEY_RE = /^(\d{4})-(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_NAMES: Record<Locale, readonly string[]> = {
  ar: [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

function parts(k: MonthKey): { year: number; month: number } | null {
  const m = KEY_RE.exec(k);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[1]), month };
}

function toKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isValidMonthKey(k: string): boolean {
  return parts(k) !== null;
}

/** Narrow a `YYYY-MM-DD` or `YYYY-MM` value to a MonthKey. Null if invalid. */
export function monthKey(date: string): MonthKey | null {
  const d = DATE_RE.exec(date);
  if (d) {
    const candidate = `${d[1]}-${d[2]}`;
    return isValidMonthKey(candidate) ? candidate : null;
  }
  return isValidMonthKey(date) ? date : null;
}

export function currentMonthKey(today: Date = new Date()): MonthKey {
  return toKey(today.getFullYear(), today.getMonth() + 1);
}

export function prevKey(k: MonthKey): MonthKey {
  const p = parts(k);
  if (!p) return k;
  return p.month === 1 ? toKey(p.year - 1, 12) : toKey(p.year, p.month - 1);
}

export function nextKey(k: MonthKey): MonthKey {
  const p = parts(k);
  if (!p) return k;
  return p.month === 12 ? toKey(p.year + 1, 1) : toKey(p.year, p.month + 1);
}

export function isFutureKey(k: MonthKey, today: Date = new Date()): boolean {
  return compareKeys(k, currentMonthKey(today)) > 0;
}

export function monthLabel(k: MonthKey, locale: Locale): string {
  const p = parts(k);
  if (!p) return k;
  return `${MONTH_NAMES[locale][p.month - 1]} ${p.year}`;
}

/** Comparator for Array.prototype.sort — chronological order. */
export function compareKeys(a: MonthKey, b: MonthKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -w @monthly-budget/shared -- month
```

Expected: `Tests: 17 passed, 17 total`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/month.ts react-native/packages/shared/src/month.test.ts
git commit -m "feat(core): add MonthKey type and month arithmetic

MonthKey is a YYYY-MM string so it sorts lexicographically in
chronological order and works directly as a JSON object key. currentMonthKey
and isFutureKey take an injectable today so tests stay deterministic.

Year-boundary crossing is covered in both directions plus a round-trip test.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `model.ts` and `categories.ts` — types and taxonomy

**Files:**
- Create: `react-native/packages/shared/src/model.ts`
- Create: `react-native/packages/shared/src/categories.ts`
- Create: `react-native/packages/shared/src/categories.test.ts`

**Interfaces:**
- Consumes: `MonthKey` from `./month`
- Produces:
  - Types: `EntryKind`, `Entry`, `MonthEntry`, `RecurringTemplate`, `BudgetStore`, `Totals`, `CategoryAmount`
  - **Deliberately NOT here:** `Income` and `Expense`. `apps/desktop` imports those two type names and constructs objects with no `id` (`apps/desktop/src/App.tsx:75`). Aliasing them to `Entry`, which requires `id`, would break its build and violate the additive-only constraint. They stay defined in the legacy block of `index.ts` (Task 12) with their current loose shapes.
  - `EXPENSE_CATEGORIES: readonly Category[]`, `INCOME_CATEGORIES: readonly Category[]`
  - `type Category = { id: string; icon: string; kind: EntryKind }`
  - `categoriesFor(kind: EntryKind): readonly Category[]`
  - `isKnownCategory(kind: EntryKind, id: string): boolean`
  - `OTHER_CATEGORY_ID = 'other'`

- [ ] **Step 1: Write the failing tests**

Create `react-native/packages/shared/src/categories.test.ts`:

```ts
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoriesFor,
  isKnownCategory,
  OTHER_CATEGORY_ID,
} from './categories';

describe('category taxonomy', () => {
  it('has 13 expense categories and 7 income categories', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(13);
    expect(INCOME_CATEGORIES).toHaveLength(7);
  });

  it('uses ids that are stable ascii slugs', () => {
    for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      expect(c.id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('has unique ids within each kind', () => {
    const expenseIds = EXPENSE_CATEGORIES.map((c) => c.id);
    const incomeIds = INCOME_CATEGORIES.map((c) => c.id);
    expect(new Set(expenseIds).size).toBe(expenseIds.length);
    expect(new Set(incomeIds).size).toBe(incomeIds.length);
  });

  it('gives every category a non-empty icon', () => {
    for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      expect(c.icon.length).toBeGreaterThan(0);
    }
  });

  it('tags every category with its kind', () => {
    expect(EXPENSE_CATEGORIES.every((c) => c.kind === 'expense')).toBe(true);
    expect(INCOME_CATEGORIES.every((c) => c.kind === 'income')).toBe(true);
  });

  it('ends each list with the "other" fallback', () => {
    expect(EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1].id).toBe(OTHER_CATEGORY_ID);
    expect(INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1].id).toBe(OTHER_CATEGORY_ID);
  });
});

describe('categoriesFor', () => {
  it('returns the list matching the kind', () => {
    expect(categoriesFor('expense')).toBe(EXPENSE_CATEGORIES);
    expect(categoriesFor('income')).toBe(INCOME_CATEGORIES);
  });
});

describe('isKnownCategory', () => {
  it('recognises ids in the right list', () => {
    expect(isKnownCategory('expense', 'housing')).toBe(true);
    expect(isKnownCategory('income', 'salary')).toBe(true);
  });

  it('does not cross kinds', () => {
    expect(isKnownCategory('expense', 'salary')).toBe(false);
    expect(isKnownCategory('income', 'housing')).toBe(false);
  });

  it('rejects unknown ids', () => {
    expect(isKnownCategory('expense', 'no_such_category')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- categories
```

Expected: FAIL with `Cannot find module './categories'`.

- [ ] **Step 3: Write the type declarations**

Create `react-native/packages/shared/src/model.ts`:

```ts
import type { MonthKey } from './month';

export type EntryKind = 'income' | 'expense';

/**
 * A single budget line. `date` and `id` are both required -- an entry without
 * a date cannot be assigned to a month (audit finding F1), and index-based
 * edit/delete breaks under filtering or reordering.
 */
export interface Entry {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
}

export interface MonthEntry {
  incomes: Entry[];
  expenses: Entry[];
}

export interface RecurringTemplate {
  id: string;
  kind: EntryKind;
  name: string;
  category: string;
  lastAmount: number;
  dayOfMonth: number | null;
}

export interface BudgetStore {
  version: 1;
  currency: string;
  locale: 'ar' | 'en';
  months: Record<MonthKey, MonthEntry>;
  recurring: RecurringTemplate[];
}

export interface Totals {
  income: number;
  expenses: number;
  net: number;
  margin: number; // percent, 0 when income is 0
}

export interface CategoryAmount {
  category: string;
  amount: number;
  percent: number;
}
```

- [ ] **Step 4: Write the taxonomy**

Create `react-native/packages/shared/src/categories.ts`:

```ts
import type { EntryKind } from './model';

export interface Category {
  id: string;
  icon: string;
  kind: EntryKind;
}

export const OTHER_CATEGORY_ID = 'other';

/**
 * Icons are emoji rather than an icon font: no extra dependency, renders on
 * both platforms, and unaffected by text direction. The trade-off is that
 * glyph shapes vary between platforms, which is acceptable here.
 *
 * `id` is stored in user data and never translated. Display names come from
 * the i18n layer, so switching language cannot corrupt stored entries.
 */
export const EXPENSE_CATEGORIES: readonly Category[] = [
  { id: 'housing', icon: '🏠', kind: 'expense' },
  { id: 'food', icon: '🍽️', kind: 'expense' },
  { id: 'transport', icon: '🚗', kind: 'expense' },
  { id: 'utilities', icon: '💡', kind: 'expense' },
  { id: 'health', icon: '⚕️', kind: 'expense' },
  { id: 'education', icon: '📚', kind: 'expense' },
  { id: 'shopping', icon: '🛍️', kind: 'expense' },
  { id: 'entertainment', icon: '🎬', kind: 'expense' },
  { id: 'communication', icon: '📱', kind: 'expense' },
  { id: 'debt', icon: '🏦', kind: 'expense' },
  { id: 'charity', icon: '🤲', kind: 'expense' },
  { id: 'savings', icon: '🐖', kind: 'expense' },
  { id: OTHER_CATEGORY_ID, icon: '▫️', kind: 'expense' },
];

export const INCOME_CATEGORIES: readonly Category[] = [
  { id: 'salary', icon: '💼', kind: 'income' },
  { id: 'freelance', icon: '💻', kind: 'income' },
  { id: 'business', icon: '🏪', kind: 'income' },
  { id: 'rental', icon: '🔑', kind: 'income' },
  { id: 'investment', icon: '📈', kind: 'income' },
  { id: 'gift', icon: '🎁', kind: 'income' },
  { id: OTHER_CATEGORY_ID, icon: '▫️', kind: 'income' },
];

export function categoriesFor(kind: EntryKind): readonly Category[] {
  return kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}

export function isKnownCategory(kind: EntryKind, id: string): boolean {
  return categoriesFor(kind).some((c) => c.id === id);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -w @monthly-budget/shared -- categories
```

Expected: `Tests: 10 passed, 10 total`.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/model.ts \
        react-native/packages/shared/src/categories.ts \
        react-native/packages/shared/src/categories.test.ts
git commit -m "feat(core): add data model types and the fixed category taxonomy

Entry.date and Entry.id are both required: an entry without a date cannot
be assigned to a month (F1), and the current index-based edit/delete breaks
under filtering. Category ids are stable ascii slugs stored in user data
and never translated, so switching language cannot corrupt entries.

13 expense categories, 7 income categories, each ending in an 'other'
fallback.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: `ids.ts` and `store.ts` — immutable store operations

**Files:**
- Create: `react-native/packages/shared/src/ids.ts`
- Create: `react-native/packages/shared/src/store.ts`
- Create: `react-native/packages/shared/src/store.test.ts`

**Interfaces:**
- Consumes: `MonthKey`, `compareKeys` from `./month`; `BudgetStore`, `MonthEntry`, `Entry`, `EntryKind` from `./model`; `parseAmount` from `./money`
- Produces:
  - `makeId(seed?: () => number): string`
  - `emptyStore(opts?: { currency?: string; locale?: 'ar' | 'en' }): BudgetStore`
  - `getMonth(store: BudgetStore, key: MonthKey): MonthEntry`
  - `upsertEntry(store: BudgetStore, key: MonthKey, kind: EntryKind, entry: Entry): BudgetStore`
  - `removeEntry(store: BudgetStore, key: MonthKey, kind: EntryKind, id: string): BudgetStore`
  - `monthsWithData(store: BudgetStore): MonthKey[]`

- [ ] **Step 1: Write the failing tests**

Create `react-native/packages/shared/src/store.test.ts`:

```ts
import {
  emptyStore,
  getMonth,
  upsertEntry,
  removeEntry,
  monthsWithData,
} from './store';
import { makeId } from './ids';
import type { Entry } from './model';

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  name: 'Rent',
  category: 'housing',
  amount: 1500,
  date: '2026-08-01',
  ...over,
});

describe('emptyStore', () => {
  it('creates a v1 store with no months', () => {
    const s = emptyStore();
    expect(s.version).toBe(1);
    expect(s.months).toEqual({});
    expect(s.recurring).toEqual([]);
  });

  it('defaults currency and locale but accepts overrides', () => {
    expect(emptyStore().currency).toBe('SAR');
    expect(emptyStore().locale).toBe('ar');
    expect(emptyStore({ currency: 'USD', locale: 'en' }).currency).toBe('USD');
    expect(emptyStore({ currency: 'USD', locale: 'en' }).locale).toBe('en');
  });
});

describe('getMonth', () => {
  it('returns an empty month for a key with no data', () => {
    expect(getMonth(emptyStore(), '2026-08')).toEqual({ incomes: [], expenses: [] });
  });

  it('does not create the key as a side effect', () => {
    const s = emptyStore();
    getMonth(s, '2026-08');
    expect(Object.keys(s.months)).toEqual([]);
  });
});

describe('upsertEntry', () => {
  it('adds an expense to the right month', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry());
    expect(getMonth(s, '2026-08').expenses).toHaveLength(1);
    expect(getMonth(s, '2026-08').expenses[0].name).toBe('Rent');
    expect(getMonth(s, '2026-08').incomes).toHaveLength(0);
  });

  it('does not mutate the input store', () => {
    const before = emptyStore();
    upsertEntry(before, '2026-08', 'expense', entry());
    expect(before.months).toEqual({});
  });

  it('updates in place when the id already exists', () => {
    let s = upsertEntry(emptyStore(), '2026-08', 'expense', entry());
    s = upsertEntry(s, '2026-08', 'expense', entry({ amount: 1600 }));
    expect(getMonth(s, '2026-08').expenses).toHaveLength(1);
    expect(getMonth(s, '2026-08').expenses[0].amount).toBe(1600);
  });

  it('clamps negative amounts to zero', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ amount: -50 }));
    expect(getMonth(s, '2026-08').expenses[0].amount).toBe(0);
  });

  it('keeps months independent -- writing one never touches another', () => {
    let s = upsertEntry(emptyStore(), '2026-07', 'expense', entry({ id: 'jul' }));
    s = upsertEntry(s, '2026-08', 'expense', entry({ id: 'aug' }));
    expect(getMonth(s, '2026-07').expenses.map((e) => e.id)).toEqual(['jul']);
    expect(getMonth(s, '2026-08').expenses.map((e) => e.id)).toEqual(['aug']);
  });
});

describe('removeEntry', () => {
  it('removes by id', () => {
    let s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ id: 'a' }));
    s = upsertEntry(s, '2026-08', 'expense', entry({ id: 'b' }));
    s = removeEntry(s, '2026-08', 'expense', 'a');
    expect(getMonth(s, '2026-08').expenses.map((e) => e.id)).toEqual(['b']);
  });

  it('is a no-op for an unknown id', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ id: 'a' }));
    expect(removeEntry(s, '2026-08', 'expense', 'zzz')).toEqual(s);
  });

  it('is a no-op for an unknown month', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry());
    expect(removeEntry(s, '2020-01', 'expense', 'e1')).toEqual(s);
  });
});

describe('monthsWithData', () => {
  it('lists months chronologically', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-10', 'expense', entry({ id: '1' }));
    s = upsertEntry(s, '2025-12', 'expense', entry({ id: '2' }));
    s = upsertEntry(s, '2026-02', 'expense', entry({ id: '3' }));
    expect(monthsWithData(s)).toEqual(['2025-12', '2026-02', '2026-10']);
  });

  it('omits months whose entries were all removed', () => {
    let s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ id: 'a' }));
    s = removeEntry(s, '2026-08', 'expense', 'a');
    expect(monthsWithData(s)).toEqual([]);
  });

  it('returns an empty list for an empty store', () => {
    expect(monthsWithData(emptyStore())).toEqual([]);
  });
});

describe('makeId', () => {
  it('is deterministic when given a seed', () => {
    let n = 0;
    const seed = () => ++n;
    expect(makeId(seed)).toBe('1');
    expect(makeId(seed)).toBe('2');
  });

  it('produces distinct ids across many calls without a seed', () => {
    const ids = new Set(Array.from({ length: 500 }, () => makeId()));
    expect(ids.size).toBe(500);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- store
```

Expected: FAIL with `Cannot find module './store'`.

- [ ] **Step 3: Write the id generator**

Create `react-native/packages/shared/src/ids.ts`:

```ts
let counter = 0;

/**
 * Generate a unique entry id.
 *
 * Pass a `seed` to make it deterministic in tests. Without one it combines a
 * monotonic counter with a base-36 timestamp, which is collision-free within a
 * process and readable in stored JSON.
 */
export function makeId(seed?: () => number): string {
  if (seed) return String(seed());
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}
```

- [ ] **Step 4: Write the store**

Create `react-native/packages/shared/src/store.ts`:

```ts
import { compareKeys, type MonthKey } from './month';
import { parseAmount } from './money';
import type { BudgetStore, Entry, EntryKind, MonthEntry } from './model';

export function emptyStore(opts?: {
  currency?: string;
  locale?: 'ar' | 'en';
}): BudgetStore {
  return {
    version: 1,
    currency: opts?.currency ?? 'SAR',
    locale: opts?.locale ?? 'ar',
    months: {},
    recurring: [],
  };
}

/** Read a month. Returns an empty month for a missing key without creating it. */
export function getMonth(store: BudgetStore, key: MonthKey): MonthEntry {
  return store.months[key] ?? { incomes: [], expenses: [] };
}

function listKey(kind: EntryKind): 'incomes' | 'expenses' {
  return kind === 'income' ? 'incomes' : 'expenses';
}

/** Add or replace an entry by id. Returns a new store; never mutates. */
export function upsertEntry(
  store: BudgetStore,
  key: MonthKey,
  kind: EntryKind,
  entry: Entry,
): BudgetStore {
  const month = getMonth(store, key);
  const field = listKey(kind);
  const normalized: Entry = { ...entry, amount: Math.max(0, parseAmount(entry.amount)) };
  const existing = month[field];
  const at = existing.findIndex((e) => e.id === normalized.id);
  const list =
    at === -1
      ? [...existing, normalized]
      : existing.map((e, i) => (i === at ? normalized : e));

  return {
    ...store,
    months: { ...store.months, [key]: { ...month, [field]: list } },
  };
}

/** Remove an entry by id. No-op if the month or id is unknown. */
export function removeEntry(
  store: BudgetStore,
  key: MonthKey,
  kind: EntryKind,
  id: string,
): BudgetStore {
  const month = store.months[key];
  if (!month) return store;
  const field = listKey(kind);
  const list = month[field].filter((e) => e.id !== id);
  if (list.length === month[field].length) return store;

  return {
    ...store,
    months: { ...store.months, [key]: { ...month, [field]: list } },
  };
}

/** Months that hold at least one entry, in chronological order. */
export function monthsWithData(store: BudgetStore): MonthKey[] {
  return Object.keys(store.months)
    .filter((k) => {
      const m = store.months[k];
      return m.incomes.length > 0 || m.expenses.length > 0;
    })
    .sort(compareKeys);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -w @monthly-budget/shared -- store
```

Expected: `Tests: 16 passed, 16 total`.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/ids.ts \
        react-native/packages/shared/src/store.ts \
        react-native/packages/shared/src/store.test.ts
git commit -m "feat(core): add month-keyed store with immutable operations

Replaces the single-document model with months keyed by MonthKey. All
operations return a new store and never mutate, and edits address entries
by id rather than array index.

The month-independence test is a direct regression guard for F3: writing
one month must never touch another, which is what made the old single-key
storage overwrite the previous month.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: `totals.ts` — month-scoped totals

**Files:**
- Create: `react-native/packages/shared/src/totals.ts`
- Create: `react-native/packages/shared/src/totals.test.ts`

**Interfaces:**
- Consumes: `MonthKey` from `./month`; `getMonth` from `./store`; `parseAmount` from `./money`; `BudgetStore`, `Totals`, `CategoryAmount` from `./model`
- Produces:
  - `interface AmountRow { amount: number; category?: string }`
  - `totalsForMonth(store: BudgetStore, key: MonthKey): Totals`
  - `expensesByCategoryForMonth(store: BudgetStore, key: MonthKey): CategoryAmount[]`
  - `totals(incomes: AmountRow[], expenses: AmountRow[]): { income_total: number; expense_total: number; profit: number; profit_margin: number }` — **legacy**
  - `expensesByCategory(expenses: AmountRow[]): CategoryAmount[]` — **legacy**

The legacy pair takes the structural `AmountRow`, not `Entry`. `Entry` satisfies `AmountRow`, and so do the loose objects `apps/desktop` builds without an `id`. Typing these as `Entry[]` would break the desktop build.

- [ ] **Step 1: Write the failing tests**

Create `react-native/packages/shared/src/totals.test.ts`:

```ts
import { totalsForMonth, expensesByCategoryForMonth, totals, expensesByCategory } from './totals';
import { emptyStore, upsertEntry } from './store';
import type { BudgetStore, Entry } from './model';

const e = (over: Partial<Entry>): Entry => ({
  id: 'x',
  name: 'n',
  category: 'other',
  amount: 0,
  date: '2026-08-01',
  ...over,
});

/** Two months of data: August and July, deliberately different. */
function twoMonths(): BudgetStore {
  let s = emptyStore({ currency: 'USD', locale: 'en' });
  s = upsertEntry(s, '2026-08', 'income', e({ id: 'i1', amount: 6000, category: 'salary' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'x1', amount: 1500, category: 'housing' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'x2', amount: 500, category: 'food' }));
  s = upsertEntry(s, '2026-07', 'income', e({ id: 'i2', amount: 1000, category: 'salary', date: '2026-07-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'x3', amount: 9999, category: 'debt', date: '2026-07-01' }));
  return s;
}

describe('totalsForMonth', () => {
  it('counts only the requested month -- regression guard for F1', () => {
    const t = totalsForMonth(twoMonths(), '2026-08');
    expect(t.income).toBe(6000);
    expect(t.expenses).toBe(2000);
    expect(t.net).toBe(4000);
  });

  it('reads a different month independently', () => {
    const t = totalsForMonth(twoMonths(), '2026-07');
    expect(t.income).toBe(1000);
    expect(t.expenses).toBe(9999);
    expect(t.net).toBe(-8999);
  });

  it('computes the profit margin as a percentage', () => {
    expect(totalsForMonth(twoMonths(), '2026-08').margin).toBeCloseTo(66.67, 2);
  });

  it('returns a zero margin when income is zero rather than dividing by zero', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'x', amount: 100 }));
    const t = totalsForMonth(s, '2026-08');
    expect(t.income).toBe(0);
    expect(t.margin).toBe(0);
    expect(t.net).toBe(-100);
  });

  it('returns all zeros for a month with no data', () => {
    expect(totalsForMonth(emptyStore(), '1999-01')).toEqual({
      income: 0,
      expenses: 0,
      net: 0,
      margin: 0,
    });
  });
});

describe('expensesByCategoryForMonth', () => {
  it('buckets by category for that month only', () => {
    const rows = expensesByCategoryForMonth(twoMonths(), '2026-08');
    expect(rows.map((r) => r.category)).toEqual(['housing', 'food']);
    expect(rows.map((r) => r.amount)).toEqual([1500, 500]);
  });

  it('sorts by amount descending', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'a', amount: 10, category: 'food' }));
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'b', amount: 90, category: 'housing' }));
    expect(expensesByCategoryForMonth(s, '2026-08').map((r) => r.category)).toEqual([
      'housing',
      'food',
    ]);
  });

  it('computes percent of that month total expenses', () => {
    const rows = expensesByCategoryForMonth(twoMonths(), '2026-08');
    expect(rows[0].percent).toBeCloseTo(75, 5);
    expect(rows[1].percent).toBeCloseTo(25, 5);
  });

  it('sums multiple entries in the same category', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'a', amount: 30, category: 'food' }));
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'b', amount: 70, category: 'food' }));
    const rows = expensesByCategoryForMonth(s, '2026-08');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(100);
  });

  it('returns an empty list for a month with no expenses', () => {
    expect(expensesByCategoryForMonth(emptyStore(), '2026-08')).toEqual([]);
  });
});

describe('legacy exports stay byte-compatible', () => {
  it('totals keeps its original shape and keys', () => {
    const r = totals(
      [e({ amount: 100 })],
      [e({ amount: 40 }), e({ amount: 10 })],
    );
    expect(r).toEqual({
      income_total: 100,
      expense_total: 50,
      profit: 50,
      profit_margin: 50,
    });
  });

  it('totals returns a zero margin for zero income', () => {
    expect(totals([], [e({ amount: 10 })]).profit_margin).toBe(0);
  });

  it('expensesByCategory defaults blank categories to Uncategorized', () => {
    const rows = expensesByCategory([e({ amount: 10, category: '' })]);
    expect(rows[0].category).toBe('Uncategorized');
  });

  it('expensesByCategory sorts by amount descending', () => {
    const rows = expensesByCategory([
      e({ amount: 10, category: 'a' }),
      e({ amount: 90, category: 'b' }),
    ]);
    expect(rows.map((r) => r.category)).toEqual(['b', 'a']);
  });

  it('accepts the loose shape apps/desktop passes -- no id, no date', () => {
    // This is exactly what apps/desktop/src/App.tsx:75 constructs.
    const loose = [{ name: 'Salary', amount: 5000 }];
    const looseExp = [{ name: 'Rent', category: 'Housing', amount: 1500 }];
    expect(totals(loose, looseExp).profit).toBe(3500);
    expect(expensesByCategory(looseExp)[0].category).toBe('Housing');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- totals
```

Expected: FAIL with `Cannot find module './totals'`.

- [ ] **Step 3: Write the implementation**

Create `react-native/packages/shared/src/totals.ts`:

```ts
import type { MonthKey } from './month';
import { parseAmount } from './money';
import { getMonth } from './store';
import type { BudgetStore, CategoryAmount, Totals } from './model';

/**
 * The minimum shape the aggregation helpers need.
 *
 * Deliberately structural rather than `Entry`: apps/desktop passes objects
 * with no `id`, and the legacy exports below must keep accepting those.
 */
export interface AmountRow {
  amount: number;
  category?: string;
}

function sum(entries: AmountRow[]): number {
  return entries.reduce((acc, r) => acc + parseAmount(r.amount), 0);
}

function bucket(entries: AmountRow[], fallback: string): CategoryAmount[] {
  const by: Record<string, number> = {};
  for (const r of entries) {
    const k = (r.category || fallback).trim() || fallback;
    by[k] = (by[k] ?? 0) + parseAmount(r.amount);
  }
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return Object.entries(by)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

/** Totals for one month only. This is what makes the app actually monthly. */
export function totalsForMonth(store: BudgetStore, key: MonthKey): Totals {
  const m = getMonth(store, key);
  const income = sum(m.incomes);
  const expenses = sum(m.expenses);
  const net = income - expenses;
  return { income, expenses, net, margin: income > 0 ? (net / income) * 100 : 0 };
}

/** Expense breakdown for one month only, sorted by amount descending. */
export function expensesByCategoryForMonth(
  store: BudgetStore,
  key: MonthKey,
): CategoryAmount[] {
  return bucket(getMonth(store, key).expenses, 'other');
}

// ---------------------------------------------------------------------------
// Legacy API. apps/desktop imports these and CI builds it, so the signatures
// and behavior must not change. Do not "improve" them.
// ---------------------------------------------------------------------------

export function totals(incomes: AmountRow[], expenses: AmountRow[]) {
  const income_total = sum(incomes);
  const expense_total = sum(expenses);
  const profit = income_total - expense_total;
  return {
    income_total,
    expense_total,
    profit,
    profit_margin: income_total > 0 ? (profit / income_total) * 100 : 0,
  };
}

export function expensesByCategory(expenses: AmountRow[]): CategoryAmount[] {
  return bucket(expenses, 'Uncategorized');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -w @monthly-budget/shared -- totals
```

Expected: `Tests: 16 passed, 16 total`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/totals.ts react-native/packages/shared/src/totals.test.ts
git commit -m "feat(core): scope totals and category breakdown to a single month

totalsForMonth and expensesByCategoryForMonth read one month only. The
'counts only the requested month' test is the direct regression guard for
F1, the finding that the month field was a label that filtered nothing.

The legacy totals and expensesByCategory exports keep their exact
signatures and behavior because apps/desktop imports them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: `compare.ts` — current vs previous month

**Files:**
- Create: `react-native/packages/shared/src/compare.ts`
- Create: `react-native/packages/shared/src/compare.test.ts`

**Interfaces:**
- Consumes: `MonthKey`, `prevKey` from `./month`; `totalsForMonth`, `expensesByCategoryForMonth` from `./totals`; `BudgetStore` from `./model`
- Produces:
  - `type DeltaStatus = 'new' | 'gone' | 'flat' | 'changed'`
  - `type Metric = 'income' | 'expenses' | 'net' | 'margin'`
  - `interface Delta { current; previous; absolute; percent: number | null; status: DeltaStatus; favorable: boolean | null }`
  - `interface CategoryDelta { category: string; delta: Delta }`
  - `interface MonthComparison { currentKey; previousKey: MonthKey | null; income; expenses; net; margin; byCategory: CategoryDelta[] }`
  - `makeDelta(current: number, previous: number, metric: Metric): Delta`
  - `compareMonths(store: BudgetStore, key: MonthKey): MonthComparison`

- [ ] **Step 1: Write the failing tests**

Create `react-native/packages/shared/src/compare.test.ts`:

```ts
import { makeDelta, compareMonths } from './compare';
import { emptyStore, upsertEntry } from './store';
import type { BudgetStore, Entry } from './model';

const e = (over: Partial<Entry>): Entry => ({
  id: 'x',
  name: 'n',
  category: 'other',
  amount: 0,
  date: '2026-08-01',
  ...over,
});

describe('makeDelta status', () => {
  it('is flat when nothing changed', () => {
    expect(makeDelta(100, 100, 'income').status).toBe('flat');
    expect(makeDelta(0, 0, 'expenses').status).toBe('flat');
  });

  it('is new when previous was zero and current is not', () => {
    expect(makeDelta(300, 0, 'expenses').status).toBe('new');
  });

  it('is gone when current is zero and previous was not', () => {
    expect(makeDelta(0, 300, 'expenses').status).toBe('gone');
  });

  it('is changed otherwise', () => {
    expect(makeDelta(120, 100, 'income').status).toBe('changed');
  });
});

describe('makeDelta percent -- never divides by zero', () => {
  it('is null when previous is zero', () => {
    expect(makeDelta(300, 0, 'expenses').percent).toBeNull();
  });

  it('is null when both are zero', () => {
    expect(makeDelta(0, 0, 'expenses').percent).toBeNull();
  });

  it('computes a normal percentage change', () => {
    expect(makeDelta(120, 100, 'income').percent).toBeCloseTo(20, 5);
    expect(makeDelta(80, 100, 'expenses').percent).toBeCloseTo(-20, 5);
  });

  it('is always null for margin, which is measured in points', () => {
    const d = makeDelta(25.2, 22.9, 'margin');
    expect(d.percent).toBeNull();
    expect(d.absolute).toBeCloseTo(2.3, 5);
  });
});

describe('makeDelta favorable -- metric aware', () => {
  it('treats rising income, net and margin as favorable', () => {
    expect(makeDelta(120, 100, 'income').favorable).toBe(true);
    expect(makeDelta(120, 100, 'net').favorable).toBe(true);
    expect(makeDelta(26, 25, 'margin').favorable).toBe(true);
  });

  it('treats falling income, net and margin as unfavorable', () => {
    expect(makeDelta(80, 100, 'income').favorable).toBe(false);
    expect(makeDelta(80, 100, 'net').favorable).toBe(false);
  });

  it('inverts the sign for expenses -- rising spend is unfavorable', () => {
    expect(makeDelta(120, 100, 'expenses').favorable).toBe(false);
    expect(makeDelta(80, 100, 'expenses').favorable).toBe(true);
  });

  it('is null when nothing changed', () => {
    expect(makeDelta(100, 100, 'income').favorable).toBeNull();
    expect(makeDelta(100, 100, 'expenses').favorable).toBeNull();
  });
});

function august(): BudgetStore {
  let s = emptyStore({ currency: 'USD', locale: 'en' });
  // July
  s = upsertEntry(s, '2026-07', 'income', e({ id: 'i0', amount: 6000, date: '2026-07-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'p1', amount: 1500, category: 'housing', date: '2026-07-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'p2', amount: 640, category: 'food', date: '2026-07-02' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'p3', amount: 420, category: 'transport', date: '2026-07-03' }));
  // August
  s = upsertEntry(s, '2026-08', 'income', e({ id: 'i1', amount: 6500 }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c1', amount: 1500, category: 'housing' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c2', amount: 810, category: 'food' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c3', amount: 355, category: 'transport' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c4', amount: 300, category: 'health' }));
  return s;
}

describe('compareMonths', () => {
  it('picks the previous calendar month automatically', () => {
    const c = compareMonths(august(), '2026-08');
    expect(c.currentKey).toBe('2026-08');
    expect(c.previousKey).toBe('2026-07');
  });

  it('compares the four headline metrics', () => {
    const c = compareMonths(august(), '2026-08');
    expect(c.income.current).toBe(6500);
    expect(c.income.previous).toBe(6000);
    expect(c.income.absolute).toBe(500);
    expect(c.income.favorable).toBe(true);

    expect(c.expenses.current).toBe(2965);
    expect(c.expenses.previous).toBe(2560);
    expect(c.expenses.favorable).toBe(false);

    expect(c.net.current).toBe(3535);
    expect(c.net.previous).toBe(3440);
    expect(c.net.favorable).toBe(true);
  });

  it('includes the union of both months categories', () => {
    const cats = compareMonths(august(), '2026-08').byCategory.map((r) => r.category);
    expect(cats.sort()).toEqual(['food', 'health', 'housing', 'transport']);
  });

  it('marks a category present only this month as new', () => {
    const row = compareMonths(august(), '2026-08').byCategory.find(
      (r) => r.category === 'health',
    );
    expect(row?.delta.status).toBe('new');
    expect(row?.delta.previous).toBe(0);
    expect(row?.delta.percent).toBeNull();
  });

  it('marks a category present only last month as gone', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-07', 'expense', e({ id: 'g', amount: 50, category: 'gift_wrap', date: '2026-07-01' }));
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'h', amount: 50, category: 'food' }));
    const row = compareMonths(s, '2026-08').byCategory.find((r) => r.category === 'gift_wrap');
    expect(row?.delta.status).toBe('gone');
    expect(row?.delta.current).toBe(0);
  });

  it('marks an unchanged category as flat', () => {
    const row = compareMonths(august(), '2026-08').byCategory.find(
      (r) => r.category === 'housing',
    );
    expect(row?.delta.status).toBe('flat');
    expect(row?.delta.absolute).toBe(0);
  });

  it('sorts categories by current amount descending', () => {
    const cats = compareMonths(august(), '2026-08').byCategory.map((r) => r.category);
    expect(cats).toEqual(['housing', 'food', 'transport', 'health']);
  });

  it('handles a missing previous month as an explicit null, not zeros', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'income', e({ id: 'i', amount: 100 }));
    const c = compareMonths(s, '2026-08');
    expect(c.previousKey).toBeNull();
    expect(c.income.previous).toBe(0);
    expect(c.income.percent).toBeNull();
    expect(c.income.status).toBe('new');
  });

  it('reports margin change in points with a null percent', () => {
    const c = compareMonths(august(), '2026-08');
    expect(c.margin.percent).toBeNull();
    expect(c.margin.absolute).toBeCloseTo(
      (3535 / 6500) * 100 - (3440 / 6000) * 100,
      5,
    );
  });

  it('returns an all-zero comparison for two empty months', () => {
    const c = compareMonths(emptyStore(), '2026-08');
    expect(c.income.status).toBe('flat');
    expect(c.byCategory).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- compare
```

Expected: FAIL with `Cannot find module './compare'`.

- [ ] **Step 3: Write the implementation**

Create `react-native/packages/shared/src/compare.ts`:

```ts
import { prevKey, type MonthKey } from './month';
import { expensesByCategoryForMonth, totalsForMonth } from './totals';
import type { BudgetStore } from './model';

export type DeltaStatus = 'new' | 'gone' | 'flat' | 'changed';
export type Metric = 'income' | 'expenses' | 'net' | 'margin';

export interface Delta {
  current: number;
  previous: number;
  absolute: number;
  /** Null when previous is 0, or always for `margin` which is in points. */
  percent: number | null;
  status: DeltaStatus;
  /** Null when nothing changed. Metric-aware: rising expenses are NOT favorable. */
  favorable: boolean | null;
}

export interface CategoryDelta {
  category: string;
  delta: Delta;
}

export interface MonthComparison {
  currentKey: MonthKey;
  previousKey: MonthKey | null;
  income: Delta;
  expenses: Delta;
  net: Delta;
  margin: Delta;
  byCategory: CategoryDelta[];
}

function statusOf(current: number, previous: number): DeltaStatus {
  if (current === previous) return 'flat';
  if (previous === 0) return 'new';
  if (current === 0) return 'gone';
  return 'changed';
}

/**
 * Build a delta between two values for a given metric.
 *
 * `favorable` is computed here rather than in the view so that the colour
 * rule is testable: rising income/net/margin is good, rising expenses is bad.
 */
export function makeDelta(current: number, previous: number, metric: Metric): Delta {
  const absolute = current - previous;
  const status = statusOf(current, previous);

  // Margin is already a percentage, so a percentage-of-a-percentage is
  // meaningless. Callers read `absolute` as percentage points instead.
  const percent =
    metric === 'margin' || previous === 0 ? null : (absolute / previous) * 100;

  let favorable: boolean | null = null;
  if (absolute !== 0) {
    favorable = metric === 'expenses' ? absolute < 0 : absolute > 0;
  }

  return { current, previous, absolute, percent, status, favorable };
}

/**
 * Compare a month against the preceding calendar month.
 *
 * When the previous month holds no data, `previousKey` is null and the view
 * must show an explicit empty state rather than treating zeros as a real
 * comparison.
 */
export function compareMonths(store: BudgetStore, key: MonthKey): MonthComparison {
  const pk = prevKey(key);
  const hasPrevious = pk in store.months;

  const cur = totalsForMonth(store, key);
  const prev = totalsForMonth(store, pk);

  const curCats = expensesByCategoryForMonth(store, key);
  const prevCats = expensesByCategoryForMonth(store, pk);

  const curMap = new Map(curCats.map((r) => [r.category, r.amount]));
  const prevMap = new Map(prevCats.map((r) => [r.category, r.amount]));

  const byCategory: CategoryDelta[] = [...new Set([...curMap.keys(), ...prevMap.keys()])]
    .map((category) => ({
      category,
      delta: makeDelta(curMap.get(category) ?? 0, prevMap.get(category) ?? 0, 'expenses'),
    }))
    .sort(
      (a, b) =>
        b.delta.current - a.delta.current || a.category.localeCompare(b.category),
    );

  return {
    currentKey: key,
    previousKey: hasPrevious ? pk : null,
    income: makeDelta(cur.income, prev.income, 'income'),
    expenses: makeDelta(cur.expenses, prev.expenses, 'expenses'),
    net: makeDelta(cur.net, prev.net, 'net'),
    margin: makeDelta(cur.margin, prev.margin, 'margin'),
    byCategory,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -w @monthly-budget/shared -- compare
```

Expected: `Tests: 22 passed, 22 total`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/compare.ts react-native/packages/shared/src/compare.test.ts
git commit -m "feat(core): add current-vs-previous month comparison

Closes audit finding F2 -- the project had no comparison logic of any kind.

Three details the spec called out and the tests pin down: percent is null
rather than Infinity when the previous value is zero; margin is reported in
percentage points with a null percent because a percentage of a percentage
is meaningless; and favorable is metric-aware and computed in the core, so
rising expenses read as unfavorable while rising income reads as favorable.

A missing previous month yields previousKey: null so the view can show an
empty state instead of presenting zeros as a real comparison.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: `history.ts` — suggestions that remove typing

**Files:**
- Create: `react-native/packages/shared/src/history.ts`
- Create: `react-native/packages/shared/src/history.test.ts`

**Interfaces:**
- Consumes: `MonthKey`, `compareKeys` from `./month`; `BudgetStore`, `Entry`, `EntryKind` from `./model`
- Produces:
  - `nameSuggestions(store: BudgetStore, kind: EntryKind, category: string, limit?: number): string[]`
  - `amountSuggestions(store: BudgetStore, kind: EntryKind, name: string, limit?: number): number[]`

Ranking rule for both: frequency descending, then most recent month descending, then alphabetical/numeric for a stable tie-break.

- [ ] **Step 1: Write the failing tests**

Create `react-native/packages/shared/src/history.test.ts`:

```ts
import { nameSuggestions, amountSuggestions } from './history';
import { emptyStore, upsertEntry } from './store';
import type { BudgetStore, Entry } from './model';

const e = (over: Partial<Entry>): Entry => ({
  id: 'x',
  name: 'n',
  category: 'other',
  amount: 0,
  date: '2026-08-01',
  ...over,
});

function history(): BudgetStore {
  let s = emptyStore();
  // Rent appears in three months at 1500, then 1600 once.
  s = upsertEntry(s, '2026-06', 'expense', e({ id: 'r1', name: 'Rent', category: 'housing', amount: 1500, date: '2026-06-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'r2', name: 'Rent', category: 'housing', amount: 1500, date: '2026-07-01' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'r3', name: 'Rent', category: 'housing', amount: 1600, date: '2026-08-01' }));
  // Maintenance appears once, in housing.
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'm1', name: 'Maintenance', category: 'housing', amount: 300, date: '2026-07-05' }));
  // Groceries is a different category.
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'g1', name: 'Groceries', category: 'food', amount: 400 }));
  // Salary is income, not expense.
  s = upsertEntry(s, '2026-08', 'income', e({ id: 's1', name: 'Salary', category: 'salary', amount: 6000 }));
  return s;
}

describe('nameSuggestions', () => {
  it('returns names used in that category, most frequent first', () => {
    expect(nameSuggestions(history(), 'expense', 'housing')).toEqual([
      'Rent',
      'Maintenance',
    ]);
  });

  it('does not leak names from other categories', () => {
    expect(nameSuggestions(history(), 'expense', 'housing')).not.toContain('Groceries');
  });

  it('does not leak across kinds', () => {
    expect(nameSuggestions(history(), 'expense', 'salary')).toEqual([]);
    expect(nameSuggestions(history(), 'income', 'salary')).toEqual(['Salary']);
  });

  it('deduplicates repeated names', () => {
    const names = nameSuggestions(history(), 'expense', 'housing');
    expect(new Set(names).size).toBe(names.length);
  });

  it('respects the limit', () => {
    expect(nameSuggestions(history(), 'expense', 'housing', 1)).toEqual(['Rent']);
  });

  it('returns an empty list for an unknown category', () => {
    expect(nameSuggestions(history(), 'expense', 'no_such', 5)).toEqual([]);
  });

  it('returns an empty list for an empty store', () => {
    expect(nameSuggestions(emptyStore(), 'expense', 'housing')).toEqual([]);
  });
});

describe('amountSuggestions', () => {
  it('returns amounts used for that name, most frequent first', () => {
    expect(amountSuggestions(history(), 'expense', 'Rent')).toEqual([1500, 1600]);
  });

  it('matches the name case-insensitively', () => {
    expect(amountSuggestions(history(), 'expense', 'rent')).toEqual([1500, 1600]);
  });

  it('does not leak across kinds', () => {
    expect(amountSuggestions(history(), 'expense', 'Salary')).toEqual([]);
    expect(amountSuggestions(history(), 'income', 'Salary')).toEqual([6000]);
  });

  it('respects the limit', () => {
    expect(amountSuggestions(history(), 'expense', 'Rent', 1)).toEqual([1500]);
  });

  it('returns an empty list for an unknown name', () => {
    expect(amountSuggestions(history(), 'expense', 'Nothing')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- history
```

Expected: FAIL with `Cannot find module './history'`.

- [ ] **Step 3: Write the implementation**

Create `react-native/packages/shared/src/history.ts`:

```ts
import { compareKeys, type MonthKey } from './month';
import type { BudgetStore, Entry, EntryKind } from './model';

interface Seen {
  count: number;
  lastMonth: MonthKey;
}

/** Walk every entry of one kind across all months, newest month last. */
function* walk(
  store: BudgetStore,
  kind: EntryKind,
): Generator<{ entry: Entry; month: MonthKey }> {
  const field = kind === 'income' ? 'incomes' : 'expenses';
  for (const month of Object.keys(store.months).sort(compareKeys)) {
    for (const entry of store.months[month][field]) {
      yield { entry, month };
    }
  }
}

/** Rank by frequency desc, then most recent month desc, then the given tie-break. */
function rank<T>(seen: Map<T, Seen>, tie: (a: T, b: T) => number): T[] {
  return [...seen.entries()]
    .sort(
      ([ka, a], [kb, b]) =>
        b.count - a.count ||
        compareKeys(b.lastMonth, a.lastMonth) ||
        tie(ka, kb),
    )
    .map(([k]) => k);
}

function bump<T>(seen: Map<T, Seen>, key: T, month: MonthKey): void {
  const prev = seen.get(key);
  if (!prev) {
    seen.set(key, { count: 1, lastMonth: month });
    return;
  }
  prev.count += 1;
  if (compareKeys(month, prev.lastMonth) > 0) prev.lastMonth = month;
}

/** Names previously used for this kind and category, best suggestion first. */
export function nameSuggestions(
  store: BudgetStore,
  kind: EntryKind,
  category: string,
  limit = 8,
): string[] {
  const seen = new Map<string, Seen>();
  for (const { entry, month } of walk(store, kind)) {
    if (entry.category !== category) continue;
    if (!entry.name) continue;
    bump(seen, entry.name, month);
  }
  return rank(seen, (a, b) => a.localeCompare(b)).slice(0, limit);
}

/** Amounts previously used for this exact item name, best suggestion first. */
export function amountSuggestions(
  store: BudgetStore,
  kind: EntryKind,
  name: string,
  limit = 4,
): number[] {
  const needle = name.trim().toLowerCase();
  const seen = new Map<number, Seen>();
  for (const { entry, month } of walk(store, kind)) {
    if (entry.name.trim().toLowerCase() !== needle) continue;
    bump(seen, entry.amount, month);
  }
  return rank(seen, (a, b) => a - b).slice(0, limit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -w @monthly-budget/shared -- history
```

Expected: `Tests: 12 passed, 12 total`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/history.ts react-native/packages/shared/src/history.test.ts
git commit -m "feat(core): add name and amount suggestions from past months

This is the engine behind the 'minimise typing' requirement. Ranking is
frequency first, then most recent month, so entering a recurring item like
Rent becomes two taps: pick the name chip, pick the amount chip.

Suggestions never leak across kinds or categories, which the tests pin down
explicitly.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: `recurring.ts` — template detection

**Files:**
- Create: `react-native/packages/shared/src/recurring.ts`
- Create: `react-native/packages/shared/src/recurring.test.ts`

**Interfaces:**
- Consumes: `MonthKey`, `compareKeys` from `./month`; `BudgetStore`, `Entry`, `EntryKind`, `RecurringTemplate` from `./model`
- Produces:
  - `detectRecurring(store: BudgetStore, minMonths?: number): RecurringTemplate[]`
  - `suggestionsForMonth(store: BudgetStore, key: MonthKey): Array<{ kind: EntryKind; name: string; category: string; amount: number; dayOfMonth: number | null }>`

- [ ] **Step 1: Write the failing tests**

Create `react-native/packages/shared/src/recurring.test.ts`:

```ts
import { detectRecurring, suggestionsForMonth } from './recurring';
import { emptyStore, upsertEntry } from './store';
import type { BudgetStore, Entry } from './model';

const e = (over: Partial<Entry>): Entry => ({
  id: 'x',
  name: 'n',
  category: 'other',
  amount: 0,
  date: '2026-08-01',
  ...over,
});

function store(): BudgetStore {
  let s = emptyStore();
  // Rent: three consecutive months -> recurring
  s = upsertEntry(s, '2026-06', 'expense', e({ id: 'r1', name: 'Rent', category: 'housing', amount: 1500, date: '2026-06-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'r2', name: 'Rent', category: 'housing', amount: 1500, date: '2026-07-01' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'r3', name: 'Rent', category: 'housing', amount: 1600, date: '2026-08-03' }));
  // Salary: two months -> recurring
  s = upsertEntry(s, '2026-07', 'income', e({ id: 's1', name: 'Salary', category: 'salary', amount: 6000, date: '2026-07-25' }));
  s = upsertEntry(s, '2026-08', 'income', e({ id: 's2', name: 'Salary', category: 'salary', amount: 6500, date: '2026-08-25' }));
  // Car repair: one month only -> not recurring
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c1', name: 'Car repair', category: 'transport', amount: 300 }));
  return s;
}

describe('detectRecurring', () => {
  it('detects items appearing in at least two months', () => {
    const names = detectRecurring(store()).map((t) => t.name).sort();
    expect(names).toEqual(['Rent', 'Salary']);
  });

  it('excludes one-off items', () => {
    expect(detectRecurring(store()).map((t) => t.name)).not.toContain('Car repair');
  });

  it('carries the most recent amount, not the first', () => {
    const rent = detectRecurring(store()).find((t) => t.name === 'Rent');
    expect(rent?.lastAmount).toBe(1600);
  });

  it('records the kind and category', () => {
    const salary = detectRecurring(store()).find((t) => t.name === 'Salary');
    expect(salary?.kind).toBe('income');
    expect(salary?.category).toBe('salary');
  });

  it('infers the usual day of month from the most recent entry', () => {
    const salary = detectRecurring(store()).find((t) => t.name === 'Salary');
    expect(salary?.dayOfMonth).toBe(25);
  });

  it('honours a higher minMonths threshold', () => {
    expect(detectRecurring(store(), 3).map((t) => t.name)).toEqual(['Rent']);
  });

  it('returns an empty list for an empty store', () => {
    expect(detectRecurring(emptyStore())).toEqual([]);
  });

  it('gives each template a stable id derived from kind, category and name', () => {
    const a = detectRecurring(store()).find((t) => t.name === 'Rent');
    const b = detectRecurring(store()).find((t) => t.name === 'Rent');
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toBe('expense:housing:rent');
  });
});

describe('suggestionsForMonth', () => {
  it('suggests recurring items not yet present in the target month', () => {
    const names = suggestionsForMonth(store(), '2026-09').map((s) => s.name).sort();
    expect(names).toEqual(['Rent', 'Salary']);
  });

  it('omits items already entered in the target month', () => {
    let s = store();
    s = upsertEntry(s, '2026-09', 'expense', e({ id: 'r4', name: 'Rent', category: 'housing', amount: 1600, date: '2026-09-01' }));
    expect(suggestionsForMonth(s, '2026-09').map((x) => x.name)).toEqual(['Salary']);
  });

  it('carries the last known amount into the suggestion', () => {
    const rent = suggestionsForMonth(store(), '2026-09').find((s) => s.name === 'Rent');
    expect(rent?.amount).toBe(1600);
  });

  it('returns nothing when the store has no history', () => {
    expect(suggestionsForMonth(emptyStore(), '2026-09')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- recurring
```

Expected: FAIL with `Cannot find module './recurring'`.

- [ ] **Step 3: Write the implementation**

Create `react-native/packages/shared/src/recurring.ts`:

```ts
import { compareKeys, type MonthKey } from './month';
import type { BudgetStore, Entry, EntryKind, RecurringTemplate } from './model';

interface Track {
  kind: EntryKind;
  name: string;
  category: string;
  months: Set<MonthKey>;
  lastMonth: MonthKey;
  lastAmount: number;
  lastDay: number | null;
}

/** Stable, human-readable template id. Same inputs always give the same id. */
function templateId(kind: EntryKind, category: string, name: string): string {
  return `${kind}:${category}:${name.trim().toLowerCase()}`;
}

function dayOf(entry: Entry): number | null {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(entry.date);
  return m ? Number(m[1]) : null;
}

function collect(store: BudgetStore): Map<string, Track> {
  const tracks = new Map<string, Track>();
  const kinds: Array<{ kind: EntryKind; field: 'incomes' | 'expenses' }> = [
    { kind: 'income', field: 'incomes' },
    { kind: 'expense', field: 'expenses' },
  ];

  for (const month of Object.keys(store.months).sort(compareKeys)) {
    for (const { kind, field } of kinds) {
      for (const entry of store.months[month][field]) {
        if (!entry.name) continue;
        const id = templateId(kind, entry.category, entry.name);
        const prev = tracks.get(id);
        if (!prev) {
          tracks.set(id, {
            kind,
            name: entry.name,
            category: entry.category,
            months: new Set([month]),
            lastMonth: month,
            lastAmount: entry.amount,
            lastDay: dayOf(entry),
          });
          continue;
        }
        prev.months.add(month);
        // Months are walked in ascending order, so a later month always wins.
        if (compareKeys(month, prev.lastMonth) >= 0) {
          prev.lastMonth = month;
          prev.lastAmount = entry.amount;
          prev.lastDay = dayOf(entry);
        }
      }
    }
  }
  return tracks;
}

/** Items that appeared in at least `minMonths` distinct months. */
export function detectRecurring(store: BudgetStore, minMonths = 2): RecurringTemplate[] {
  return [...collect(store).entries()]
    .filter(([, t]) => t.months.size >= minMonths)
    .map(([id, t]) => ({
      id,
      kind: t.kind,
      name: t.name,
      category: t.category,
      lastAmount: t.lastAmount,
      dayOfMonth: t.lastDay,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Recurring items that are not yet entered in the target month. */
export function suggestionsForMonth(
  store: BudgetStore,
  key: MonthKey,
): Array<{
  kind: EntryKind;
  name: string;
  category: string;
  amount: number;
  dayOfMonth: number | null;
}> {
  const target = store.months[key];
  const present = new Set<string>();
  if (target) {
    for (const entry of target.incomes) {
      present.add(templateId('income', entry.category, entry.name));
    }
    for (const entry of target.expenses) {
      present.add(templateId('expense', entry.category, entry.name));
    }
  }

  return detectRecurring(store)
    .filter((t) => !present.has(t.id))
    .map((t) => ({
      kind: t.kind,
      name: t.name,
      category: t.category,
      amount: t.lastAmount,
      dayOfMonth: t.dayOfMonth,
    }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -w @monthly-budget/shared -- recurring
```

Expected: `Tests: 12 passed, 12 total`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/recurring.ts react-native/packages/shared/src/recurring.test.ts
git commit -m "feat(core): detect recurring items and suggest them for a new month

Items appearing in two or more distinct months become templates carrying
the most recent amount and the usual day of month. suggestionsForMonth
omits anything already entered, so opening a new month can pre-fill without
creating duplicates.

Template ids are stable and derived from kind, category and lowercased name,
so detection is idempotent across runs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: `migrate.ts` — v0 to v1 without data loss

**Files:**
- Create: `react-native/packages/shared/src/migrate.ts`
- Create: `react-native/packages/shared/src/migrate.test.ts`

**Interfaces:**
- Consumes: `monthKey`, `isValidMonthKey`, `MonthKey` from `./month`; `emptyStore`, `upsertEntry` from `./store`; `categoriesFor`, `OTHER_CATEGORY_ID` from `./categories`; `BudgetStore`, `Entry`, `EntryKind` from `./model`. Amount parsing and negative clamping happen inside `upsertEntry`, so `parseAmount` is not imported here.
- Produces:
  - `interface MigrationResult { store: BudgetStore; backup: string; migrated: boolean; entriesMoved: number }`
  - `needsMigration(raw: unknown): boolean`
  - `migrateV0toV1(raw: unknown, opts?: { currency?: string; locale?: 'ar' | 'en' }): MigrationResult`

`migrateV0toV1` is pure: it returns the backup string but performs no I/O. The storage layer in Phase 2 writes it.

- [ ] **Step 1: Write the failing tests**

Create `react-native/packages/shared/src/migrate.test.ts`:

```ts
import { migrateV0toV1, needsMigration } from './migrate';
import { getMonth, monthsWithData } from './store';

/**
 * A v0 document whose meta says August but whose entries span July and
 * August. This is exactly the corruption finding F3 produced: the label and
 * the entry dates disagree, so the entry date must win.
 */
const v0 = {
  meta: { year: 2026, month: 8, saved_at: '2026-08-26T10:00:00Z' },
  incomes: [
    { name: 'Salary', amount: 6000, date: '2026-08-01' },
    { name: 'Bonus', amount: 500, date: '2026-07-15' },
  ],
  expenses: [
    { name: 'Rent', category: 'Housing', amount: 1500, date: '2026-08-01' },
    { name: 'Groceries', category: 'Food', amount: 400, date: '2026-07-03' },
    { name: 'Mystery', category: 'Weird Custom Cat', amount: 50, date: '2026-08-09' },
    { name: 'No date', category: 'Food', amount: 25 },
  ],
};

describe('needsMigration', () => {
  it('is true for a v0 document', () => {
    expect(needsMigration(v0)).toBe(true);
  });

  it('is false for a v1 store', () => {
    expect(needsMigration({ version: 1, months: {}, recurring: [] })).toBe(false);
  });

  it('is false for null or garbage', () => {
    expect(needsMigration(null)).toBe(false);
    expect(needsMigration('nonsense')).toBe(false);
    expect(needsMigration(42)).toBe(false);
  });
});

describe('migrateV0toV1', () => {
  it('distributes entries by their own date, not by meta.month', () => {
    const { store } = migrateV0toV1(v0);
    expect(monthsWithData(store)).toEqual(['2026-07', '2026-08']);
    expect(getMonth(store, '2026-07').incomes.map((e) => e.name)).toEqual(['Bonus']);
    expect(getMonth(store, '2026-07').expenses.map((e) => e.name)).toEqual(['Groceries']);
  });

  it('puts August entries in August', () => {
    const { store } = migrateV0toV1(v0);
    expect(getMonth(store, '2026-08').incomes.map((e) => e.name)).toEqual(['Salary']);
    expect(getMonth(store, '2026-08').expenses.map((e) => e.name).sort()).toEqual([
      'Mystery',
      'No date',
      'Rent',
    ]);
  });

  it('falls back to meta year and month for an entry with no date', () => {
    const { store } = migrateV0toV1(v0);
    const noDate = getMonth(store, '2026-08').expenses.find((e) => e.name === 'No date');
    expect(noDate).toBeDefined();
    expect(noDate?.date).toBe('2026-08-01');
  });

  it('maps known categories case-insensitively to their slug', () => {
    const { store } = migrateV0toV1(v0);
    const rent = getMonth(store, '2026-08').expenses.find((e) => e.name === 'Rent');
    expect(rent?.category).toBe('housing');
  });

  it('sends unmatched categories to other and keeps the item name', () => {
    const { store } = migrateV0toV1(v0);
    const mystery = getMonth(store, '2026-08').expenses.find((e) => e.name === 'Mystery');
    expect(mystery?.category).toBe('other');
    expect(mystery?.name).toBe('Mystery');
  });

  it('gives every migrated entry an id', () => {
    const { store } = migrateV0toV1(v0);
    const all = [
      ...getMonth(store, '2026-07').incomes,
      ...getMonth(store, '2026-07').expenses,
      ...getMonth(store, '2026-08').incomes,
      ...getMonth(store, '2026-08').expenses,
    ];
    expect(all.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });

  it('returns the original payload verbatim as a backup', () => {
    const { backup } = migrateV0toV1(v0);
    expect(JSON.parse(backup)).toEqual(v0);
  });

  it('reports how many entries it moved', () => {
    expect(migrateV0toV1(v0).entriesMoved).toBe(6);
    expect(migrateV0toV1(v0).migrated).toBe(true);
  });

  it('parses amounts and clamps negatives to zero', () => {
    const { store } = migrateV0toV1({
      meta: { year: 2026, month: 8 },
      incomes: [],
      expenses: [{ name: 'Refund', category: 'Food', amount: -40, date: '2026-08-02' }],
    });
    expect(getMonth(store, '2026-08').expenses[0].amount).toBe(0);
  });

  it('returns an empty v1 store for a v0 document with no entries', () => {
    const { store, entriesMoved } = migrateV0toV1({ meta: { year: 2026, month: 8 } });
    expect(store.version).toBe(1);
    expect(monthsWithData(store)).toEqual([]);
    expect(entriesMoved).toBe(0);
  });

  it('does not re-migrate a v1 store and reports migrated false', () => {
    const already = { version: 1, currency: 'USD', locale: 'en', months: {}, recurring: [] };
    const r = migrateV0toV1(already);
    expect(r.migrated).toBe(false);
    expect(r.store).toEqual(already);
  });

  it('returns an empty store for unusable input rather than throwing', () => {
    expect(migrateV0toV1(null).store.version).toBe(1);
    expect(migrateV0toV1('garbage').entriesMoved).toBe(0);
  });

  it('honours currency and locale options', () => {
    const { store } = migrateV0toV1(v0, { currency: 'EGP', locale: 'en' });
    expect(store.currency).toBe('EGP');
    expect(store.locale).toBe('en');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- migrate
```

Expected: FAIL with `Cannot find module './migrate'`.

- [ ] **Step 3: Write the implementation**

Create `react-native/packages/shared/src/migrate.ts`:

```ts
import { isValidMonthKey, monthKey, type MonthKey } from './month';
import { emptyStore, upsertEntry } from './store';
import { categoriesFor, OTHER_CATEGORY_ID } from './categories';
import type { BudgetStore, Entry, EntryKind } from './model';

export interface MigrationResult {
  store: BudgetStore;
  /** The original payload, verbatim. The storage layer must persist this first. */
  backup: string;
  migrated: boolean;
  entriesMoved: number;
}

interface V0Entry {
  name?: unknown;
  category?: unknown;
  amount?: unknown;
  date?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** True only for a v0 shape: an object with incomes/expenses and no version. */
export function needsMigration(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  if (raw.version === 1) return false;
  return 'incomes' in raw || 'expenses' in raw || 'meta' in raw;
}

/** Map a free-text v0 category onto a taxonomy slug, or fall back to `other`. */
function mapCategory(kind: EntryKind, raw: unknown): string {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return OTHER_CATEGORY_ID;
  const hit = categoriesFor(kind).find((c) => c.id === text);
  return hit ? hit.id : OTHER_CATEGORY_ID;
}

function fallbackDate(meta: Record<string, unknown> | undefined): string {
  const year = Number(meta?.year);
  const month = Number(meta?.month);
  const y = Number.isFinite(year) && year > 0 ? year : new Date().getFullYear();
  const m = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/**
 * Resolve which month an entry belongs to.
 *
 * The entry's own date always wins over meta. Finding F3 showed that meta
 * could be relabelled while entries kept their original dates, so meta is
 * only a last resort.
 */
function resolve(entry: V0Entry, meta: Record<string, unknown> | undefined): {
  key: MonthKey;
  date: string;
} {
  const raw = typeof entry.date === 'string' ? entry.date.trim() : '';
  const fromEntry = raw ? monthKey(raw) : null;
  if (fromEntry) {
    return { key: fromEntry, date: raw.length === 10 ? raw : `${fromEntry}-01` };
  }
  const date = fallbackDate(meta);
  return { key: date.slice(0, 7), date };
}

/**
 * Migrate a v0 single-document payload into a v1 month-keyed store.
 *
 * Pure: returns the backup string but writes nothing. Unusable input yields
 * an empty v1 store rather than throwing, so a corrupt payload can never
 * leave the app with no store at all.
 */
export function migrateV0toV1(
  raw: unknown,
  opts?: { currency?: string; locale?: 'ar' | 'en' },
): MigrationResult {
  const backup = JSON.stringify(raw ?? null);

  if (isRecord(raw) && raw.version === 1) {
    return { store: raw as unknown as BudgetStore, backup, migrated: false, entriesMoved: 0 };
  }

  let store = emptyStore(opts);
  if (!needsMigration(raw)) {
    return { store, backup, migrated: false, entriesMoved: 0 };
  }

  const doc = raw as Record<string, unknown>;
  const meta = isRecord(doc.meta) ? doc.meta : undefined;
  let entriesMoved = 0;
  let seq = 0;

  const groups: Array<{ kind: EntryKind; rows: unknown }> = [
    { kind: 'income', rows: doc.incomes },
    { kind: 'expense', rows: doc.expenses },
  ];

  for (const { kind, rows } of groups) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const v0row = row as V0Entry;
      const { key, date } = resolve(v0row, meta);
      if (!isValidMonthKey(key)) continue;

      seq += 1;
      const entry: Entry = {
        id: `v0-${seq}`,
        name: String(v0row.name ?? '').trim() || (kind === 'income' ? 'Income' : 'Expense'),
        category: mapCategory(kind, v0row.category),
        amount: Number(v0row.amount ?? 0),
        date,
      };
      store = upsertEntry(store, key, kind, entry);
      entriesMoved += 1;
    }
  }

  return { store, backup, migrated: true, entriesMoved };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -w @monthly-budget/shared -- migrate
```

Expected: `Tests: 17 passed, 17 total`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/migrate.ts react-native/packages/shared/src/migrate.test.ts
git commit -m "feat(core): migrate v0 single-document data into the month store

Entries are distributed by their own date, never by meta.month. Finding F3
showed meta could be relabelled while entries kept their original dates, so
the entry date is the only trustworthy signal and meta is a last resort.

migrateV0toV1 is pure -- it returns the verbatim backup string but performs
no I/O, so the storage layer in Phase 2 controls write ordering and can
persist the backup before overwriting anything.

Unusable input yields an empty v1 store rather than throwing, so a corrupt
payload can never leave the app with no store at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: `index.ts` barrel and backward-compatibility proof

**Files:**
- Modify: `react-native/packages/shared/src/index.ts` (replace entirely)
- Create: `react-native/packages/shared/src/index.test.ts`

**Interfaces:**
- Consumes: every module from Tasks 3–11
- Produces: the public surface of `@monthly-budget/shared`. Phase 2+ imports only from here.

This task proves the Global Constraint that `apps/desktop` still compiles.

- [ ] **Step 1: Write the failing backward-compatibility test**

Create `react-native/packages/shared/src/index.test.ts`:

```ts
import * as api from './index';

describe('legacy API surface -- apps/desktop depends on these', () => {
  it('still exports the four functions desktop imports', () => {
    expect(typeof api.totals).toBe('function');
    expect(typeof api.expensesByCategory).toBe('function');
    expect(typeof api.serialize).toBe('function');
    expect(typeof api.deserialize).toBe('function');
  });

  it('keeps parseAmount exported', () => {
    expect(api.parseAmount('1,234.5')).toBe(1234.5);
  });

  it('keeps the legacy totals result keys unchanged', () => {
    const r = api.totals(
      [{ id: 'a', name: 'i', category: 'x', amount: 100, date: '2026-08-01' }],
      [{ id: 'b', name: 'e', category: 'x', amount: 25, date: '2026-08-01' }],
    );
    expect(Object.keys(r).sort()).toEqual([
      'expense_total',
      'income_total',
      'profit',
      'profit_margin',
    ]);
  });

  it('round-trips a legacy BudgetDoc through serialize and deserialize', () => {
    const doc = {
      meta: { year: 2026, month: 8, saved_at: '' },
      incomes: [{ name: 'Salary', amount: 6000, date: '2026-08-01' }],
      expenses: [{ name: 'Rent', category: 'Housing', amount: 1500, date: '2026-08-01' }],
    };
    const back = api.deserialize(api.serialize(doc));
    expect(back.meta.year).toBe(2026);
    expect(back.meta.month).toBe(8);
    expect(back.incomes[0].name).toBe('Salary');
    expect(back.expenses[0].category).toBe('Housing');
  });
});

describe('new month-aware API surface', () => {
  it('exports the month helpers', () => {
    expect(api.currentMonthKey(new Date(2026, 7, 26))).toBe('2026-08');
    expect(api.prevKey('2026-01')).toBe('2025-12');
    expect(api.monthLabel('2026-08', 'ar')).toBe('أغسطس 2026');
  });

  it('exports the store, totals, compare, history, recurring and migrate entry points', () => {
    expect(typeof api.emptyStore).toBe('function');
    expect(typeof api.upsertEntry).toBe('function');
    expect(typeof api.totalsForMonth).toBe('function');
    expect(typeof api.compareMonths).toBe('function');
    expect(typeof api.nameSuggestions).toBe('function');
    expect(typeof api.detectRecurring).toBe('function');
    expect(typeof api.migrateV0toV1).toBe('function');
  });

  it('exports the category taxonomy', () => {
    expect(api.EXPENSE_CATEGORIES).toHaveLength(13);
    expect(api.INCOME_CATEGORIES).toHaveLength(7);
  });

  it('composes end to end: build a store, then compare two months', () => {
    let s = api.emptyStore({ currency: 'USD', locale: 'en' });
    s = api.upsertEntry(s, '2026-07', 'expense', {
      id: 'p', name: 'Rent', category: 'housing', amount: 1000, date: '2026-07-01',
    });
    s = api.upsertEntry(s, '2026-08', 'expense', {
      id: 'c', name: 'Rent', category: 'housing', amount: 1200, date: '2026-08-01',
    });
    const c = api.compareMonths(s, '2026-08');
    expect(c.previousKey).toBe('2026-07');
    expect(c.expenses.absolute).toBe(200);
    expect(c.expenses.favorable).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- index
```

Expected: FAIL — `api.currentMonthKey is not a function` (the old `index.ts` has no month exports).

- [ ] **Step 3: Replace `index.ts` with the barrel**

Replace the entire contents of `react-native/packages/shared/src/index.ts` with:

```ts
// Public surface of @monthly-budget/shared.
//
// The legacy block at the bottom exists because apps/desktop imports it and
// CI builds that app. Those signatures must not change.

import { parseAmount } from './money';

export type { Locale } from './money';
export { parseAmount, formatMoney } from './money';

export type { MonthKey } from './month';
export {
  isValidMonthKey,
  monthKey,
  currentMonthKey,
  prevKey,
  nextKey,
  isFutureKey,
  monthLabel,
  compareKeys,
} from './month';

export type {
  EntryKind,
  Entry,
  MonthEntry,
  RecurringTemplate,
  BudgetStore,
  Totals,
  CategoryAmount,
} from './model';

export type { Category } from './categories';
export {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoriesFor,
  isKnownCategory,
  OTHER_CATEGORY_ID,
} from './categories';

export { makeId } from './ids';

export {
  emptyStore,
  getMonth,
  upsertEntry,
  removeEntry,
  monthsWithData,
} from './store';

export { totalsForMonth, expensesByCategoryForMonth } from './totals';

export type { Delta, DeltaStatus, Metric, CategoryDelta, MonthComparison } from './compare';
export { makeDelta, compareMonths } from './compare';

export { nameSuggestions, amountSuggestions } from './history';

export { detectRecurring, suggestionsForMonth } from './recurring';

export type { MigrationResult } from './migrate';
export { needsMigration, migrateV0toV1 } from './migrate';

// ---------------------------------------------------------------------------
// Legacy API -- consumed by apps/desktop. Do not change these signatures.
// ---------------------------------------------------------------------------

export { totals, expensesByCategory } from './totals';

// apps/desktop imports Income and Expense and builds them WITHOUT an id.
// These must stay the loose shapes they are today -- do not alias to Entry.
export type Income = { name: string; amount: number; date?: string };
export type Expense = { name: string; category: string; amount: number; date?: string };
export type Meta = { year: number; month: number; saved_at?: string };
export type BudgetDoc = { meta: Meta; incomes: Income[]; expenses: Expense[] };

export function serialize(doc: BudgetDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function deserialize(text: string): BudgetDoc {
  const raw = JSON.parse(text);
  const meta: Meta = {
    year: Number(raw?.meta?.year) || new Date().getFullYear(),
    month: Number(raw?.meta?.month) || new Date().getMonth() + 1,
    saved_at: String(raw?.meta?.saved_at || ''),
  };
  const incomes = Array.isArray(raw?.incomes)
    ? raw.incomes.map((r: Record<string, unknown>) => ({
        name: String(r?.name || ''),
        amount: parseAmount(r?.amount),
        date: (r?.date as string) || undefined,
      }))
    : [];
  const expenses = Array.isArray(raw?.expenses)
    ? raw.expenses.map((r: Record<string, unknown>) => ({
        name: String(r?.name || ''),
        category: String(r?.category || 'Uncategorized'),
        amount: parseAmount(r?.amount),
        date: (r?.date as string) || undefined,
      }))
    : [];
  return { meta, incomes, expenses };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -w @monthly-budget/shared -- index
```

Expected: `Tests: 9 passed, 9 total`.

- [ ] **Step 5: Run the whole suite with coverage**

```bash
npm run test:coverage -w @monthly-budget/shared
```

Expected: all suites pass, and no `Jest: "global" coverage threshold ... not met` line. Total should be roughly 130+ tests.

- [ ] **Step 6: Prove the desktop app still compiles**

```bash
npm run build -w @monthly-budget/shared
npm run build -w @monthly-budget/adapters
npx tsc --noEmit -p apps/desktop/tsconfig.json
```

Expected: all three exit 0. If the third fails, the Global Constraint on additive-only changes was violated — fix `index.ts` rather than editing `apps/desktop`.

- [ ] **Step 7: Verify no module exceeded the size target**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native/packages/shared/src"
wc -l *.ts | sort -rn | head -20
```

Expected: no non-test module over ~150 lines. Report any that are.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/index.ts react-native/packages/shared/src/index.test.ts
git commit -m "feat(core): expose month-aware API and prove desktop compatibility

index.ts becomes a barrel over the ten new modules while keeping the legacy
totals, expensesByCategory, serialize and deserialize exports byte-compatible,
because apps/desktop imports them and CI builds that app.

The index test asserts the legacy surface explicitly so a future refactor
cannot quietly break the desktop build, and composes the new API end to end
to confirm the modules fit together.

Phase 1 complete: the core knows what a month is. No UI changed yet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of Done for Phases 0 + 1

- [ ] Tracked file count is 86, down from 5,045
- [ ] `**/node_modules/` in `.gitignore`; `web/` gone
- [ ] `npm test -w @monthly-budget/shared` passes with 90%+ line coverage
- [ ] Core CI workflow green on the branch
- [ ] `apps/desktop` typechecks against the new core
- [ ] No non-test core module over ~150 lines
- [ ] Regression guards present and passing for F1 (month-scoped totals), F2 (comparison exists), F3 (month independence, migration by entry date)
- [ ] No UI file touched — Phase 2 starts from a clean core

## What is deliberately NOT in this plan

Phases 2–6 from the spec each get their own plan after this one is reviewed:

- **Phase 2** — persistence guarantees P1–P8, migration wiring, i18n layer
- **Phase 3** — month bar, month screen, charts reading the displayed month
- **Phase 4** — multiple-choice add-entry screen
- **Phase 5** — comparison tab and grouped bar chart
- **Phase 6** — recurring items UI

Also unchanged by design: `budget_manager.py`, `budget_manager_gui.py`, `mobile/` (BeeWare). Finding F5 (logic duplicated three times) stays partially open, and F7 stays open for the two large Python files.
