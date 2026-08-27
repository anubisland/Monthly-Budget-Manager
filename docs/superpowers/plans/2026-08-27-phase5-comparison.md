# Phase 5 Implementation Plan — The Comparison Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the displayed month against the one before it — headline figures, a per-category grouped bar chart, and a category table — answering "am I doing better than last month?" with numbers rather than an impression.

**Architecture:** `compareMonths` already computes every delta and is tested at 100%; this phase does not recompute anything. What it adds is a **presentation model**: the decisions about which numbers are safe to show and how, above all when a percentage would mislead. That model is a pure `.ts` module, so it can be tested; the components render it.

**Tech Stack:** TypeScript 5.4 (strict), React 18.2, React Native 0.74.7, `react-native-svg` 15.12.1, Jest 29 + ts-jest.

## Global Constraints

- **`@monthly-budget/shared` is DONE.** 211 tests, 100% on all four metrics. `compareMonths`, `makeDelta`, and the `Delta`/`MonthComparison` types already exist and are exported. **Do not recompute a delta anywhere in this phase** — import it.
- **THE CARRIED FINDING — the single most important rule in this phase.** A sign-crossing delta produces a real but badly misleading percentage. `makeDelta(100, -50, 'net')` gives `absolute: +150`, `favorable: true`, and `percent: -300`. Going from a £50 loss to a £100 profit is an improvement, yet the percentage reads minus three hundred. **When `previous` is negative, the view must render `absolute` and the `favorable` flag, never the raw percent.** Task 2 puts that rule in a tested function so no component can get it wrong.
- **`percent` is already `null` when `previous` is 0**, and always `null` for `margin`, which is measured in percentage points. Handle all three cases — negative previous, zero previous, margin — not just the one the tests happen to cover first.
- **`apps/desktop` must keep compiling.** `npx tsc --noEmit -p apps/desktop/tsconfig.json` exits 0.
- **`testEnvironment: node` cannot render React.** Every `.tsx` file is verified by typecheck only. Anything that needs a test lives in a `.ts` module.
- **RTL is per-component, never `I18nManager`.** Use `rowDirection`, `textAlign`, `writingDirection` from `src/components/direction.ts`.
- **Colour must never be the only signal.** A red number and a green number look identical to a colourblind reader and to anyone in bright sun. Every favourable/unfavourable indication carries a glyph or word as well.
- **Every visible string comes from the i18n tables.** `ar.ts` is typed against `en.ts`, so a missing Arabic key is a compile error. Category names use the existing `category.<id>` keys added in Phase 4.
- **No new runtime dependencies.** The repo carries 43 pre-existing transitive vulnerabilities.
- **No non-injectable clock.**
- **Coverage gate 90/90/90/80** over `src/state/`, `src/i18n/`, `src/charts/`, `src/components/`, `src/entry/` — Task 2 adds `src/compare/`.
- **Target 300 lines per file**, far less for a component. `App.tsx` is 313 and must not grow by more than the tab entry needs.
- Commit after every task. Prefixes: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/mobile/src/charts/scale.ts` | Modify: add `groupedBarLayout` |
| `apps/mobile/src/charts/scale.test.ts` | Modify: cover it |
| `apps/mobile/jest.config.js` | Modify: collect coverage from `src/compare/` |
| `apps/mobile/src/compare/comparisonModel.ts` | Create: what is safe to show, and how (pure) |
| `apps/mobile/src/charts/GroupedBars.tsx` | Create: two bars per category |
| `apps/mobile/src/compare/DeltaBadge.tsx` | Create: one delta, rendered honestly |
| `apps/mobile/src/compare/CompareScreen.tsx` | Create: the tab body |
| `apps/mobile/src/i18n/en.ts`, `ar.ts` | Modify: the tab's strings |
| `apps/mobile/src/App.tsx` | Modify: add the fourth tab |

---

## Task 1: `groupedBarLayout` — two bars per category

**Files:**
- Modify: `react-native/apps/mobile/src/charts/scale.ts`
- Modify: `react-native/apps/mobile/src/charts/scale.test.ts`

**Interfaces:**
- Produces: `groupedBarLayout(groups: number[][], opts): BarRect[][]`

One inner array per group, one rect per series within it. `react-native-chart-kit` could not do this, which is the reason it was replaced.

- [ ] **Step 1: Write the failing test**

Add to `react-native/apps/mobile/src/charts/scale.test.ts`:

```ts
describe('groupedBarLayout', () => {
  const opts = { width: 300, height: 200, groupGap: 12, barGap: 2 };

  it('returns one inner array per group', () => {
    expect(groupedBarLayout([[1, 2], [3, 4], [5, 6]], opts)).toHaveLength(3);
  });

  it('returns one rect per series in each group', () => {
    for (const g of groupedBarLayout([[1, 2], [3, 4]], opts)) {
      expect(g).toHaveLength(2);
    }
  });

  it('scales every group against the SAME maximum, so groups are comparable', () => {
    // The whole point of a grouped chart is comparing across groups. Scaling
    // each group to its own max would make every group look identical.
    const g = groupedBarLayout([[50, 100], [25, 50]], opts);
    expect(g[0][1].height).toBe(200);
    expect(g[1][1].height).toBe(100);
    expect(g[0][0].height).toBe(100);
  });

  it('anchors every bar to the bottom', () => {
    for (const group of groupedBarLayout([[1, 2], [3, 4]], opts)) {
      for (const b of group) {
        expect(b.y + b.height).toBeCloseTo(opts.height, 5);
      }
    }
  });

  it('keeps every bar inside the box', () => {
    for (const group of groupedBarLayout([[1, 9], [4, 2], [7, 3]], opts)) {
      for (const b of group) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(opts.width + 0.001);
        expect(b.height).toBeLessThanOrEqual(opts.height + 0.001);
      }
    }
  });

  it('never overlaps two bars', () => {
    const flat = groupedBarLayout([[1, 2], [3, 4], [5, 6]], opts).flat();
    const sorted = [...flat].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].width - 0.001);
    }
  });

  it('orders bars within a group left to right by series index', () => {
    const g = groupedBarLayout([[1, 2]], opts);
    expect(g[0][0].x).toBeLessThan(g[0][1].x);
  });

  it('honours an explicit max, so it can share an axis with the tick labels', () => {
    const g = groupedBarLayout([[50]], { ...opts, max: 200 });
    expect(g[0][0].height).toBe(50);
  });

  it('gives all-zero groups zero height rather than NaN', () => {
    for (const b of groupedBarLayout([[0, 0], [0, 0]], opts).flat()) {
      expect(b.height).toBe(0);
      expect(Number.isNaN(b.height)).toBe(false);
    }
  });

  it('survives non-finite values, like the other layouts', () => {
    for (const b of groupedBarLayout([[NaN, 1], [Infinity, -5]], opts).flat()) {
      for (const n of [b.x, b.y, b.width, b.height]) {
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  it('returns an empty array for no groups', () => {
    expect(groupedBarLayout([], opts)).toEqual([]);
  });

  it('handles a single group of a single bar', () => {
    const g = groupedBarLayout([[42]], opts);
    expect(g).toHaveLength(1);
    expect(g[0][0].height).toBe(200);
  });

  it('handles groups of differing length without producing NaN', () => {
    // Ragged input should not happen from compareMonths, but a chart that
    // renders garbage is worse than one that renders something sane.
    for (const b of groupedBarLayout([[1, 2], [3]], opts).flat()) {
      expect(Number.isFinite(b.width)).toBe(true);
      expect(b.width).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/mobile -- scale
```

Expected: FAIL — `groupedBarLayout` is not exported.

- [ ] **Step 3: Implement**

Add to `react-native/apps/mobile/src/charts/scale.ts`, after `barLayout`:

```ts
/**
 * Bars grouped by category, two or more series per group.
 *
 * Every group is scaled against ONE maximum across the whole data set. Scaling
 * each group to its own maximum would make every group look the same height,
 * which defeats the only reason to draw a grouped chart.
 *
 * `react-native-chart-kit` could not do this, which is why it was replaced.
 */
export function groupedBarLayout(
  groups: number[][],
  opts: {
    width: number;
    height: number;
    groupGap?: number;
    barGap?: number;
    max?: number;
  },
): BarRect[][] {
  if (groups.length === 0) return [];
  const groupGap = opts.groupGap ?? 12;
  const barGap = opts.barGap ?? 2;

  const safe = groups.map((g) => g.map(finite));
  const dataMax = Math.max(...safe.flat(), 0);
  const max = opts.max !== undefined && opts.max > 0 ? opts.max : dataMax;

  const slot = opts.width / groups.length;
  const inner = Math.max(0, slot - groupGap);

  return safe.map((group, gi) => {
    const n = Math.max(1, group.length);
    const barWidth = Math.max(0, (inner - barGap * (n - 1)) / n);
    const left = gi * slot + groupGap / 2;

    return group.map((v, si) => {
      const height = max > 0 ? (v / max) * opts.height : 0;
      return {
        x: left + si * (barWidth + barGap),
        y: opts.height - height,
        width: barWidth,
        height,
      };
    });
  });
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npm test -w @monthly-budget/mobile -- scale
```

Expected: all pass. Report the ACTUAL count.

- [ ] **Step 5: Check coverage**

```bash
npm run test:coverage -w @monthly-budget/mobile
```

Report `scale.ts`'s row. It was at 100% before this task; if it is lower now, name the uncovered branch.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/charts/scale.ts react-native/apps/mobile/src/charts/scale.test.ts
git commit -m "feat(charts): add grouped bar geometry for month-on-month comparison

Every group is scaled against one maximum across the whole data set. Scaling
each group to its own maximum would make every category look the same height,
which defeats the only reason to draw a grouped chart at all.

Grouped bars are what react-native-chart-kit could not do, and the reason it
was replaced.

Non-finite values are sanitised the same way the other layouts do it, after a
NaN in a donut path was found rendering as nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `comparisonModel.ts` — deciding what is honest to show

**Files:**
- Modify: `react-native/apps/mobile/jest.config.js`
- Create: `react-native/apps/mobile/src/compare/comparisonModel.ts`
- Create: `react-native/apps/mobile/src/compare/comparisonModel.test.ts`

**Interfaces:**
- Consumes: `compareMonths`, and the `Delta` / `MonthComparison` / `BudgetStore` types from `@monthly-budget/shared`
- Produces:
  - `type Tone = 'good' | 'bad' | 'neutral'`
  - `interface DeltaView { absolute; percent: number | null; showPercent: boolean; tone: Tone; direction: 'up' | 'down' | 'flat'; isPoints: boolean; status: DeltaStatus }`
  - `deltaView(delta: Delta, metric: Metric): DeltaView`
  - `interface ComparisonView { hasPrevious; currentKey; previousKey; headline: {key; view; current; previous}[]; categories: {category; view; current; previous}[] }`
  - `comparisonView(store, monthKey, opts?): ComparisonView`

**This module is the whole point of the phase.** Every way the comparison could mislead is decided here, once, under test.

- [ ] **Step 1: Widen coverage collection**

Add `'src/compare/**/*.ts',` to `collectCoverageFrom` in `jest.config.js`, before the `'!src/**/*.test.ts'` line.

- [ ] **Step 2: Write the failing test**

Create `react-native/apps/mobile/src/compare/comparisonModel.test.ts`:

```ts
import { deltaView, comparisonView } from './comparisonModel';
import { makeDelta, emptyStore, upsertEntry } from '@monthly-budget/shared';

describe('showPercent — when a percentage would mislead', () => {
  it('shows it for an ordinary change', () => {
    expect(deltaView(makeDelta(120, 100, 'income'), 'income').showPercent).toBe(true);
  });

  it('HIDES it when the previous value was negative', () => {
    // Going from a 50 loss to a 100 profit is an improvement, yet the
    // percentage computes to -300. Showing that would tell the user the
    // opposite of the truth.
    const v = deltaView(makeDelta(100, -50, 'net'), 'net');
    expect(v.showPercent).toBe(false);
    expect(v.absolute).toBe(150);
    expect(v.tone).toBe('good');
  });

  it('HIDES it when the previous value was zero', () => {
    const v = deltaView(makeDelta(300, 0, 'expenses'), 'expenses');
    expect(v.showPercent).toBe(false);
    expect(v.percent).toBeNull();
  });

  it('HIDES it for margin, which is measured in points', () => {
    const v = deltaView(makeDelta(25.2, 22.9, 'margin'), 'margin');
    expect(v.showPercent).toBe(false);
    expect(v.isPoints).toBe(true);
    expect(v.absolute).toBeCloseTo(2.3, 5);
  });

  it('marks only margin as points', () => {
    for (const m of ['income', 'expenses', 'net'] as const) {
      expect(deltaView(makeDelta(120, 100, m), m).isPoints).toBe(false);
    }
  });

  it('hides it when both current and previous are negative', () => {
    // -100 to -50 is an improvement; (50 / -100) * 100 reads as -50%.
    const v = deltaView(makeDelta(-50, -100, 'net'), 'net');
    expect(v.showPercent).toBe(false);
    expect(v.tone).toBe('good');
  });
});

describe('tone — never the opposite of the truth', () => {
  it('treats rising income as good and falling income as bad', () => {
    expect(deltaView(makeDelta(120, 100, 'income'), 'income').tone).toBe('good');
    expect(deltaView(makeDelta(80, 100, 'income'), 'income').tone).toBe('bad');
  });

  it('inverts for expenses — spending more is not an improvement', () => {
    expect(deltaView(makeDelta(120, 100, 'expenses'), 'expenses').tone).toBe('bad');
    expect(deltaView(makeDelta(80, 100, 'expenses'), 'expenses').tone).toBe('good');
  });

  it('is neutral when nothing changed', () => {
    for (const m of ['income', 'expenses', 'net', 'margin'] as const) {
      expect(deltaView(makeDelta(100, 100, m), m).tone).toBe('neutral');
    }
  });

  it('follows the core favorable flag rather than deciding again', () => {
    // The core already knows which direction is good for each metric. Deciding
    // it a second time here is how the two drift apart.
    for (const m of ['income', 'expenses', 'net', 'margin'] as const) {
      for (const [c, p] of [[120, 100], [80, 100], [100, 100]] as const) {
        const d = makeDelta(c, p, m);
        const v = deltaView(d, m);
        const expected = d.favorable === null ? 'neutral' : d.favorable ? 'good' : 'bad';
        expect(v.tone).toBe(expected);
      }
    }
  });
});

describe('direction — the glyph, so colour is never the only signal', () => {
  it('points up when the value rose, whatever that means', () => {
    expect(deltaView(makeDelta(120, 100, 'expenses'), 'expenses').direction).toBe('up');
  });

  it('points down when the value fell', () => {
    expect(deltaView(makeDelta(80, 100, 'income'), 'income').direction).toBe('down');
  });

  it('is flat when unchanged', () => {
    expect(deltaView(makeDelta(100, 100, 'net'), 'net').direction).toBe('flat');
  });

  it('reports direction independently of tone', () => {
    // Expenses rising is 'up' and 'bad' at once; conflating them is how a
    // chart ends up with a downward arrow on a growing bar.
    const v = deltaView(makeDelta(120, 100, 'expenses'), 'expenses');
    expect(v.direction).toBe('up');
    expect(v.tone).toBe('bad');
  });
});

describe('comparisonView', () => {
  const TODAY = new Date(2026, 7, 26);

  function twoMonths() {
    let s = emptyStore({ currency: 'USD', locale: 'en' });
    s = upsertEntry(s, '2026-07', 'income', { id: 'i0', name: 'Pay', category: 'salary', amount: 6000, date: '2026-07-25' });
    s = upsertEntry(s, '2026-07', 'expense', { id: 'p1', name: 'Rent', category: 'housing', amount: 1500, date: '2026-07-01' });
    s = upsertEntry(s, '2026-07', 'expense', { id: 'p2', name: 'Food', category: 'food', amount: 640, date: '2026-07-02' });
    s = upsertEntry(s, '2026-08', 'income', { id: 'i1', name: 'Pay', category: 'salary', amount: 6500, date: '2026-08-25' });
    s = upsertEntry(s, '2026-08', 'expense', { id: 'c1', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' });
    s = upsertEntry(s, '2026-08', 'expense', { id: 'c2', name: 'Food', category: 'food', amount: 810, date: '2026-08-02' });
    s = upsertEntry(s, '2026-08', 'expense', { id: 'c3', name: 'Clinic', category: 'health', amount: 300, date: '2026-08-09' });
    return s;
  }

  it('reports that a previous month exists', () => {
    const v = comparisonView(twoMonths(), '2026-08', { today: TODAY });
    expect(v.hasPrevious).toBe(true);
    expect(v.previousKey).toBe('2026-07');
  });

  it('reports the absence of a previous month, rather than showing zeros', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'income', { id: 'a', name: 'Pay', category: 'salary', amount: 100, date: '2026-08-01' });
    const v = comparisonView(s, '2026-08', { today: TODAY });
    expect(v.hasPrevious).toBe(false);
    expect(v.previousKey).toBeNull();
  });

  it('gives four headline metrics in a stable order', () => {
    const v = comparisonView(twoMonths(), '2026-08', { today: TODAY });
    expect(v.headline.map((h) => h.key)).toEqual(['income', 'expenses', 'net', 'margin']);
  });

  it('carries both raw values alongside each headline view', () => {
    const income = comparisonView(twoMonths(), '2026-08', { today: TODAY }).headline[0];
    expect(income.current).toBe(6500);
    expect(income.previous).toBe(6000);
    expect(income.view.tone).toBe('good');
  });

  it('lists categories with both months values', () => {
    const rows = comparisonView(twoMonths(), '2026-08', { today: TODAY }).categories;
    const food = rows.find((r) => r.category === 'food');
    expect(food!.current).toBe(810);
    expect(food!.previous).toBe(640);
  });

  it('includes a category that is new this month', () => {
    const health = comparisonView(twoMonths(), '2026-08', { today: TODAY }).categories
      .find((r) => r.category === 'health');
    expect(health!.previous).toBe(0);
    expect(health!.view.status).toBe('new');
    expect(health!.view.showPercent).toBe(false);
  });

  it('sorts categories by current amount descending', () => {
    const rows = comparisonView(twoMonths(), '2026-08', { today: TODAY }).categories;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].current).toBeGreaterThanOrEqual(rows[i].current);
    }
  });

  it('limits how many categories it returns, so the chart stays readable', () => {
    let s = emptyStore();
    const cats = ['housing', 'food', 'transport', 'utilities', 'health', 'education', 'shopping', 'entertainment', 'communication', 'debt'];
    cats.forEach((c, i) => {
      s = upsertEntry(s, '2026-08', 'expense', { id: `x${i}`, name: c, category: c, amount: 100 - i, date: '2026-08-01' });
    });
    const rows = comparisonView(s, '2026-08', { today: TODAY, maxCategories: 6 }).categories;
    expect(rows).toHaveLength(6);
    expect(rows[0].category).toBe('housing');
  });

  it('returns an empty category list for a month with no expenses', () => {
    expect(comparisonView(emptyStore(), '2026-08', { today: TODAY }).categories).toEqual([]);
  });

  it('never produces a NaN or Infinity in any view', () => {
    const v = comparisonView(twoMonths(), '2026-08', { today: TODAY });
    for (const row of [...v.headline, ...v.categories]) {
      expect(Number.isFinite(row.view.absolute)).toBe(true);
      expect(row.view.percent === null || Number.isFinite(row.view.percent)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
npm test -w @monthly-budget/mobile -- comparisonModel
```

Expected: FAIL with `Cannot find module './comparisonModel'`.

- [ ] **Step 4: Implement**

Create `react-native/apps/mobile/src/compare/comparisonModel.ts`:

```ts
import {
  compareMonths,
  type BudgetStore,
  type Delta,
  type DeltaStatus,
  type Metric,
  type MonthKey,
} from '@monthly-budget/shared';

export type Tone = 'good' | 'bad' | 'neutral';

export interface DeltaView {
  absolute: number;
  percent: number | null;
  /** False whenever a percentage would mislead. See the rules below. */
  showPercent: boolean;
  tone: Tone;
  /** Which way the number moved, regardless of whether that is good. */
  direction: 'up' | 'down' | 'flat';
  /** True for margin, whose change is in percentage points, not percent. */
  isPoints: boolean;
  status: DeltaStatus;
}

/**
 * Decide how a single delta may honestly be shown.
 *
 * A percentage is suppressed in three cases, each of which would otherwise
 * tell the reader the opposite of the truth or something meaningless:
 *
 *  - `previous` is negative. Going from a 50 loss to a 100 profit computes to
 *    -300%, which reads as a catastrophe rather than the recovery it is.
 *  - `previous` is 0. There is no base to be a percentage of; the core already
 *    returns null here and the view says "new" instead.
 *  - the metric is `margin`, which is already a percentage. Its change is in
 *    percentage points, so a percent-of-a-percent means nothing.
 *
 * `tone` follows the core's `favorable` flag rather than deciding again --
 * duplicating that judgement is how the two drift apart. `direction` is kept
 * separate from `tone` because expenses rising is 'up' and 'bad' at the same
 * time, and conflating them puts a falling arrow on a growing bar.
 */
export function deltaView(delta: Delta, metric: Metric): DeltaView {
  const misleading = delta.previous < 0 || delta.previous === 0 || metric === 'margin';
  return {
    absolute: delta.absolute,
    percent: delta.percent,
    showPercent: !misleading && delta.percent !== null,
    tone: delta.favorable === null ? 'neutral' : delta.favorable ? 'good' : 'bad',
    direction: delta.absolute > 0 ? 'up' : delta.absolute < 0 ? 'down' : 'flat',
    isPoints: metric === 'margin',
    status: delta.status,
  };
}

export interface HeadlineRow {
  key: Metric;
  view: DeltaView;
  current: number;
  previous: number;
}

export interface CategoryRow {
  category: string;
  view: DeltaView;
  current: number;
  previous: number;
}

export interface ComparisonView {
  hasPrevious: boolean;
  currentKey: MonthKey;
  previousKey: MonthKey | null;
  headline: HeadlineRow[];
  categories: CategoryRow[];
}

const HEADLINE_ORDER: Metric[] = ['income', 'expenses', 'net', 'margin'];

/**
 * Everything the comparison tab needs, with no rendering and no recomputation.
 * The deltas come from `compareMonths`, which is already tested; this only
 * decides how they may be shown.
 */
export function comparisonView(
  store: BudgetStore,
  monthKey: MonthKey,
  opts?: { today?: Date; maxCategories?: number },
): ComparisonView {
  const c = compareMonths(store, monthKey);
  const limit = opts?.maxCategories ?? 8;

  return {
    hasPrevious: c.previousKey !== null,
    currentKey: c.currentKey,
    previousKey: c.previousKey,
    headline: HEADLINE_ORDER.map((key) => {
      const d = c[key];
      return { key, view: deltaView(d, key), current: d.current, previous: d.previous };
    }),
    // Already sorted by current amount descending by compareMonths.
    categories: c.byCategory.slice(0, limit).map((row) => ({
      category: row.category,
      view: deltaView(row.delta, 'expenses'),
      current: row.delta.current,
      previous: row.delta.previous,
    })),
  };
}
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
npm test -w @monthly-budget/mobile -- comparisonModel
```

Expected: all pass. Report the ACTUAL count.

- [ ] **Step 6: Check coverage**

```bash
npm run test:coverage -w @monthly-budget/mobile
```

Report `comparisonModel.ts`'s row. Aim for 100% — every branch here is a rule about not misleading someone about their money.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/jest.config.js react-native/apps/mobile/src/compare/
git commit -m "feat(mobile): decide what a comparison may honestly show

compareMonths already computes every delta and is tested; this decides how
they may be displayed, which is a separate question with its own ways of
going wrong.

A percentage is suppressed in three cases. When the previous value was
negative, going from a 50 loss to a 100 profit computes to -300% -- a
recovery that reads as a catastrophe. When it was zero there is no base to be
a percentage of. And margin is already a percentage, so its change is in
points and a percent-of-a-percent is meaningless.

tone follows the core's favorable flag rather than deciding again, because
duplicating that judgement is how the two drift apart. direction stays
separate from tone: expenses rising is 'up' and 'bad' at once, and conflating
them puts a falling arrow on a growing bar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `GroupedBars.tsx` and `DeltaBadge.tsx`

**Files:**
- Create: `react-native/apps/mobile/src/charts/GroupedBars.tsx`
- Create: `react-native/apps/mobile/src/compare/DeltaBadge.tsx`

**Interfaces:**
- Consumes: `groupedBarLayout`, `niceTicks`, `colorFor` from the charts; `DeltaView` from `../compare/comparisonModel`; `t`, the direction helpers, `formatMoney`
- Produces: `<GroupedBars>`, `<DeltaBadge>`

- [ ] **Step 1: Write `GroupedBars.tsx`**

Props: `groups: { label: string; values: number[] }[]`, `seriesColors: string[]`, `width`, `height?`, `formatValue?`.

Every coordinate comes from `groupedBarLayout` and `niceTicks`. Render gridlines with tick labels, then the bars, then a group label under each. Include a legend naming each series — two bars with no legend is a guessing game.

**Do not truncate a group label.** If labels collide, the caller shows fewer groups.

- [ ] **Step 2: Write `DeltaBadge.tsx`**

Props: `view: DeltaView`, `locale`, `currency`, and an optional `compact`.

Rules it must follow, all of which come from `view` and none of which it decides:
- Render the percentage **only when `view.showPercent`**.
- When `view.isPoints`, label the absolute as points, not currency.
- When `view.status` is `'new'` or `'gone'`, show that word instead of a percentage.
- Show a glyph from `view.direction` — `▲`, `▼`, or `–` — so **colour is never the only signal**.
- Colour from `view.tone`, alongside the glyph, never instead of it.

- [ ] **Step 3: Verify**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm run typecheck -w @monthly-budget/mobile
npm test -w @monthly-budget/mobile
wc -l apps/mobile/src/charts/GroupedBars.tsx apps/mobile/src/compare/DeltaBadge.tsx
grep -n "showPercent" apps/mobile/src/compare/DeltaBadge.tsx
```

The last grep must find `showPercent` actually being used. A badge that renders `percent` without checking it is the carried finding shipping straight into the UI.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/charts/GroupedBars.tsx react-native/apps/mobile/src/compare/DeltaBadge.tsx
git commit -m "feat(mobile): render grouped bars and a delta badge

Both components are thin: every coordinate comes from the tested geometry and
every display decision from the tested comparison model. The badge checks
showPercent rather than reading percent directly, which is what keeps a
misleading -300% off the screen.

Every favourable or unfavourable indication carries a glyph as well as a
colour. A red number and a green one look identical to a colourblind reader.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `CompareScreen.tsx` and the fourth tab

**Files:**
- Create: `react-native/apps/mobile/src/compare/CompareScreen.tsx`
- Modify: `react-native/apps/mobile/src/App.tsx`
- Modify: `react-native/apps/mobile/src/i18n/en.ts`, `ar.ts`

- [ ] **Step 1: Add the strings**

Add to `en.ts` then `ar.ts`: a tab label, a heading naming both months, an empty-state message for when there is no previous month, labels for the two chart series (this month / last month), a "new" and a "gone" badge word, a points suffix for margin, and a heading for the category table.

`ar.ts` is typed against `en.ts`, so add English first and let the compiler list the missing Arabic.

- [ ] **Step 2: Write `CompareScreen.tsx`**

Read `store`, `monthKey` from `useBudget()`, then `comparisonView(store, monthKey)`.

- When `!hasPrevious`, render only the empty-state message. **Do not render zeros as though they were a comparison** — that is the whole reason `hasPrevious` exists.
- Otherwise: a heading naming both months via `monthLabel`, the four headline rows each with a `<DeltaBadge>`, the `<GroupedBars>` chart fed from `categories`, and the category table.
- Use `rowDirection(locale)` on rows and `writingDirection(locale)` on text.

- [ ] **Step 3: Add the tab**

In `App.tsx`, widen the `activeTab` union to include `'compare'`, add the tab entry, and render `<CompareScreen />` for it. Put it directly after summary — it belongs with the overview, not after the entry lists.

- [ ] **Step 4: Verify**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm run typecheck -w @monthly-budget/mobile
npm test -w @monthly-budget/mobile
npm test -w @monthly-budget/shared
npx tsc --noEmit -p apps/desktop/tsconfig.json
wc -l apps/mobile/src/App.tsx apps/mobile/src/compare/*.tsx
grep -c "hasPrevious" apps/mobile/src/compare/CompareScreen.tsx
grep -rn "I18nManager" apps/mobile/src/compare/ || echo "clean"
grep -oE '>[A-Z][a-zA-Z ]{4,40}<' apps/mobile/src/compare/CompareScreen.tsx || echo "no hardcoded English"
```

Expected: both typechecks exit 0; suites unchanged; `hasPrevious` actually used; no hardcoded English.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/
git commit -m "feat(mobile): add the comparison tab

The feature this project was asked for. An audit at the start found no
comparison logic anywhere in the codebase -- a repo-wide search for
previous, compare, delta and trend returned one calendar-widget button.

A month with nothing before it shows an explicit empty state rather than a
comparison against zeros, which would read as though last month had been a
month of nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of Done for Phase 5

- [ ] A comparison tab shows the displayed month against the previous one
- [ ] The four headline metrics each show absolute change, a direction glyph, and a tone
- [ ] A percentage is shown only when it is not misleading — never for a negative or zero previous value, never for margin
- [ ] A grouped bar chart shows both months per category, scaled against one shared maximum
- [ ] A month with no predecessor shows an empty state, not zeros
- [ ] New and disappeared categories are labelled as such
- [ ] Colour is never the only signal
- [ ] Every string comes from the i18n tables; a missing Arabic key fails the build
- [ ] `groupedBarLayout` and `comparisonModel.ts` meet the coverage gate
- [ ] Both suites pass; `apps/desktop` still typechecks
- [ ] No component over 200 lines

## What is NOT in this plan

- **Phase 6** — the recurring-items UI, and the decision on `store.recurring`, which is still written by nothing.
- A twelve-month trend chart. Comparing two months answers "better than last month"; a year answers "what is my pattern", which is a different feature and was listed as advice rather than scope.
- Comparing against an arbitrary month rather than the immediately preceding one.
- Rendering tests for any `.tsx` file, which need a device harness rather than `testEnvironment: node`.
