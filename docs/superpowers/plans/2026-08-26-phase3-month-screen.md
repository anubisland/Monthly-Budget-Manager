# Phase 3 Implementation Plan — Month Bar, Screens, Charts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app a month bar you can navigate with, charts that draw only the displayed month, an Arabic/English interface that flips direction instantly, and a screen tree small enough for Phases 4–5 to build on.

**Architecture:** Every piece of computation is separated from rendering so it can be tested under `testEnvironment: node`, which cannot render React. Chart geometry lives in `scale.ts`, text direction lives in `direction.ts`, and the `.tsx` components are thin. `react-native-chart-kit` is replaced by our own components over `react-native-svg`.

**Tech Stack:** TypeScript 5.4 (strict), React 18.2, React Native 0.74.7, `react-native-svg` 15.12.1 (already a dependency, currently unused), Jest 29 + ts-jest.

## Global Constraints

- **`@monthly-budget/shared` is DONE.** 198 tests, 100% on all four metrics. Import from it; report rather than edit.
- **`src/state/` and `src/i18n/` are DONE.** 139 tests. `budgetReducer.ts`, `storage.ts`, `kv.ts`, `keys.ts` are finished. The ONE permitted change is adding a `setLocale` action, in Task 5, done additively.
- **`apps/desktop` must keep compiling.** `npx tsc --noEmit -p apps/desktop/tsconfig.json` exits 0.
- **RTL is per-component, never `I18nManager`.** The user chose instant switching. `I18nManager.forceRTL` needs an app restart, so it is banned here. Direction is a value derived from locale and passed down — which is also what makes it testable.
- **`testEnvironment: node` cannot render React.** Every `.tsx` file is verified by typecheck only. Anything that needs a test must live in a `.ts` module. This is the single most important constraint shaping the task order below.
- **No new runtime dependencies.** `react-native-svg` is already present. The repo carries 43 pre-existing transitive vulnerabilities; do not add to them.
- **No non-injectable clock or randomness** in testable logic.
- **Coverage gate 90/90/90/80**, collected from `src/state/**/*.ts`, `src/i18n/**/*.ts`, and — added in Task 1 — `src/charts/**/*.ts` and `src/components/**/*.ts`. `.tsx` files are excluded by that pattern, deliberately.
- **Do not redesign what you are not asked to.** Colours, spacing and copy stay as they are unless a task says otherwise.
- **Target 300 lines per file**, and far less for a component. `App.tsx` is 1,227 lines today and must end this phase under 150.
- Commit after every task. Prefixes: `chore:`, `feat:`, `test:`, `fix:`, `refactor:`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/mobile/jest.config.js` | Modify: collect coverage from `charts/` and `components/` too |
| `apps/mobile/src/charts/scale.ts` | Create: pure geometry — ticks, bar rects, donut arcs |
| `apps/mobile/src/charts/Bars.tsx` | Create: bar chart over `react-native-svg` |
| `apps/mobile/src/charts/Donut.tsx` | Create: category donut |
| `apps/mobile/src/charts/palette.ts` | Create: the category colour ramp, one place |
| `apps/mobile/src/components/direction.ts` | Create: locale → direction values (pure) |
| `apps/mobile/src/components/MonthBar.tsx` | Create: ◀ label ▶ and "this month" |
| `apps/mobile/src/components/monthBarModel.ts` | Create: which controls are enabled (pure) |
| `apps/mobile/src/screens/SummaryScreen.tsx` | Create: extracted from `App.tsx` |
| `apps/mobile/src/screens/IncomeScreen.tsx` | Create: extracted from `App.tsx` |
| `apps/mobile/src/screens/ExpenseScreen.tsx` | Create: extracted from `App.tsx` |
| `apps/mobile/src/screens/styles.ts` | Create: the shared `StyleSheet`, moved out of `App.tsx` |
| `apps/mobile/src/i18n/en.ts`, `ar.ts` | Modify: add the screen strings |
| `apps/mobile/src/state/budgetReducer.ts` | Modify: add `setLocale` (additive only) |
| `apps/mobile/src/App.tsx` | Modify: shrink to a shell |
| `apps/mobile/package.json` | Modify: drop `react-native-chart-kit` |

---

## Task 1: `scale.ts` and `palette.ts` — chart geometry with no rendering

**Files:**
- Modify: `react-native/apps/mobile/jest.config.js`
- Create: `react-native/apps/mobile/src/charts/scale.ts`
- Create: `react-native/apps/mobile/src/charts/palette.ts`
- Create: `react-native/apps/mobile/src/charts/scale.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `niceTicks(max: number, count?: number): number[]`
  - `barLayout(values: number[], opts): { x: number; y: number; width: number; height: number }[]`
  - `donutArcs(values: number[], opts): { d: string; fraction: number }[]`
  - `colorFor(index: number): string` and `CATEGORY_COLORS`

Everything here is pure maths returning plain data, so it is fully testable without rendering. The `.tsx` files in Tasks 2–3 do nothing but map these results onto SVG elements.

- [ ] **Step 1: Widen coverage collection**

In `react-native/apps/mobile/jest.config.js`, replace the `collectCoverageFrom` array with:

```js
  collectCoverageFrom: [
    'src/state/**/*.ts',
    'src/i18n/**/*.ts',
    'src/charts/**/*.ts',
    'src/components/**/*.ts',
    '!src/**/*.test.ts',
  ],
```

`.tsx` files stay excluded: `testEnvironment: node` cannot render them, so collecting coverage there would report an unreachable zero.

- [ ] **Step 2: Write the failing test**

Create `react-native/apps/mobile/src/charts/scale.test.ts`:

```ts
import { niceTicks, barLayout, donutArcs } from './scale';
import { colorFor, CATEGORY_COLORS } from './palette';

describe('niceTicks', () => {
  it('starts at zero and ends at or above the max', () => {
    const t = niceTicks(87);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(87);
  });

  it('returns evenly spaced values', () => {
    const t = niceTicks(1000);
    const gaps = t.slice(1).map((v, i) => v - t[i]);
    expect(new Set(gaps).size).toBe(1);
  });

  it('produces round numbers, not raw fractions of the max', () => {
    for (const tick of niceTicks(87)) {
      expect(Number.isInteger(tick)).toBe(true);
    }
  });

  it('handles a max of zero without dividing by it', () => {
    const t = niceTicks(0);
    expect(t[0]).toBe(0);
    expect(t.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('handles a negative max by treating it as zero', () => {
    expect(niceTicks(-50)[0]).toBe(0);
    expect(niceTicks(-50).every(Number.isFinite)).toBe(true);
  });

  it('honours the requested tick count', () => {
    expect(niceTicks(1000, 3)).toHaveLength(4); // count intervals + the zero
  });
});

describe('barLayout', () => {
  const opts = { width: 300, height: 200, gap: 10 };

  it('returns one rect per value', () => {
    expect(barLayout([1, 2, 3], opts)).toHaveLength(3);
  });

  it('gives the largest value the full height', () => {
    const bars = barLayout([50, 100], opts);
    expect(bars[1].height).toBe(200);
  });

  it('scales the others proportionally', () => {
    const bars = barLayout([50, 100], opts);
    expect(bars[0].height).toBe(100);
  });

  it('keeps every bar inside the box', () => {
    for (const b of barLayout([3, 7, 1, 9], opts)) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(opts.width + 0.001);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(opts.height + 0.001);
    }
  });

  it('anchors bars to the bottom, so y + height is the baseline', () => {
    for (const b of barLayout([3, 7], opts)) {
      expect(b.y + b.height).toBeCloseTo(opts.height, 5);
    }
  });

  it('gives all-zero values zero height rather than NaN', () => {
    for (const b of barLayout([0, 0], opts)) {
      expect(b.height).toBe(0);
      expect(Number.isNaN(b.height)).toBe(false);
    }
  });

  it('returns an empty array for no values', () => {
    expect(barLayout([], opts)).toEqual([]);
  });

  it('scales against an explicit max when given one', () => {
    // 50 against an axis max of 200 is a quarter of the height, even though
    // it is the largest value present.
    expect(barLayout([50], { ...opts, max: 200 })[0].height).toBe(50);
  });

  it('ignores a zero or negative explicit max and falls back to the data max', () => {
    expect(barLayout([50], { ...opts, max: 0 })[0].height).toBe(200);
    expect(barLayout([50], { ...opts, max: -5 })[0].height).toBe(200);
  });

  it('handles a single value', () => {
    const bars = barLayout([42], opts);
    expect(bars).toHaveLength(1);
    expect(bars[0].height).toBe(200);
  });
});

describe('donutArcs', () => {
  const opts = { size: 200, thickness: 30 };

  it('returns one arc per value', () => {
    expect(donutArcs([1, 2, 3], opts)).toHaveLength(3);
  });

  it('fractions sum to 1', () => {
    const total = donutArcs([25, 25, 50], opts).reduce((s, a) => s + a.fraction, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('computes each fraction from the total', () => {
    const arcs = donutArcs([25, 75], opts);
    expect(arcs[0].fraction).toBeCloseTo(0.25, 6);
    expect(arcs[1].fraction).toBeCloseTo(0.75, 6);
  });

  it('emits a path string for each arc', () => {
    for (const a of donutArcs([1, 1], opts)) {
      expect(a.d.length).toBeGreaterThan(0);
      expect(a.d.startsWith('M')).toBe(true);
    }
  });

  it('never emits NaN inside a path', () => {
    for (const a of donutArcs([1, 2, 3], opts)) {
      expect(a.d).not.toContain('NaN');
    }
  });

  it('returns an empty array when every value is zero, rather than dividing by zero', () => {
    expect(donutArcs([0, 0], opts)).toEqual([]);
  });

  it('returns an empty array for no values', () => {
    expect(donutArcs([], opts)).toEqual([]);
  });

  it('draws a single value as a full ring without NaN', () => {
    const arcs = donutArcs([5], opts);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].fraction).toBeCloseTo(1, 6);
    expect(arcs[0].d).not.toContain('NaN');
  });
});

describe('palette', () => {
  it('gives every colour as a hex string', () => {
    for (const c of CATEGORY_COLORS) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('has no duplicate colours, so adjacent categories stay distinguishable', () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length);
  });

  it('wraps around rather than returning undefined past the end', () => {
    expect(colorFor(CATEGORY_COLORS.length)).toBe(CATEGORY_COLORS[0]);
    expect(colorFor(CATEGORY_COLORS.length * 3 + 2)).toBe(CATEGORY_COLORS[2]);
  });

  it('is stable — the same index always gives the same colour', () => {
    expect(colorFor(4)).toBe(colorFor(4));
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/mobile -- scale
```

Expected: FAIL with `Cannot find module './scale'`.

- [ ] **Step 4: Write `palette.ts`**

Create `react-native/apps/mobile/src/charts/palette.ts`:

```ts
/**
 * Category colours, in one place so a chart and a legend cannot drift apart.
 * Indexes wrap, so a month with more categories than colours still renders.
 */
export const CATEGORY_COLORS = [
  '#1B6B57',
  '#8A6A3B',
  '#3D6E8F',
  '#A0522D',
  '#5B7553',
  '#7A5C8E',
  '#B0761C',
  '#4A6E6E',
  '#8C5A6E',
  '#5C6B63',
] as const;

export function colorFor(index: number): string {
  const n = CATEGORY_COLORS.length;
  return CATEGORY_COLORS[((index % n) + n) % n];
}
```

- [ ] **Step 5: Write `scale.ts`**

Create `react-native/apps/mobile/src/charts/scale.ts`:

```ts
/**
 * Chart geometry. Pure functions returning plain data.
 *
 * Kept apart from the components on purpose: `testEnvironment: node` cannot
 * render React, so anything that lives in a .tsx file cannot be tested. All of
 * the arithmetic a chart can get wrong lives here instead, where it can be.
 */

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Arc {
  d: string;
  fraction: number;
}

/** Round axis values from 0 up to at least `max`, evenly spaced. */
export function niceTicks(max: number, count = 4): number[] {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  if (safeMax === 0) return Array.from({ length: count + 1 }, (_, i) => i);

  const rawStep = safeMax / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  // 1, 2, 5, 10 give humans round numbers to read.
  const niceStep = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;

  return Array.from({ length: count + 1 }, (_, i) => Math.round(niceStep * i * 1e6) / 1e6);
}

/**
 * Bars anchored to the bottom of the box. The tallest value fills the height;
 * an all-zero set yields zero-height bars rather than NaN from a 0/0 scale.
 */
export function barLayout(
  values: number[],
  opts: { width: number; height: number; gap?: number; max?: number },
): BarRect[] {
  if (values.length === 0) return [];
  const gap = opts.gap ?? 8;
  // An explicit max lets a caller scale bars against an AXIS maximum rather
  // than the data maximum, so the tallest bar meets the top gridline instead
  // of overshooting it. Without this the caller has to recompute every height.
  const max = opts.max !== undefined && opts.max > 0 ? opts.max : Math.max(...values, 0);
  const slot = opts.width / values.length;
  const width = Math.max(0, slot - gap);

  return values.map((v, i) => {
    const height = max > 0 ? (Math.max(0, v) / max) * opts.height : 0;
    return {
      x: i * slot + gap / 2,
      y: opts.height - height,
      width,
      height,
    };
  });
}

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

/**
 * Donut segments as SVG path strings, starting at twelve o'clock.
 *
 * A single value would otherwise degenerate: a 360° arc has identical start and
 * end points, which SVG draws as nothing. It is emitted as two half arcs.
 */
export function donutArcs(
  values: number[],
  opts: { size: number; thickness: number },
): Arc[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (values.length === 0 || total <= 0) return [];

  const outer = opts.size / 2;
  const inner = outer - opts.thickness;
  const cx = outer;
  const cy = outer;

  let angle = -Math.PI / 2;
  return values.map((v) => {
    const fraction = Math.max(0, v) / total;
    const sweep = fraction * Math.PI * 2;
    const end = angle + sweep;

    const d =
      fraction >= 1
        ? ringPath(cx, cy, outer, inner)
        : segmentPath(cx, cy, outer, inner, angle, end);

    angle = end;
    return { d, fraction };
  });
}

function segmentPath(
  cx: number, cy: number, outer: number, inner: number, from: number, to: number,
): string {
  const large = to - from > Math.PI ? 1 : 0;
  const [ox1, oy1] = polar(cx, cy, outer, from);
  const [ox2, oy2] = polar(cx, cy, outer, to);
  const [ix2, iy2] = polar(cx, cy, inner, to);
  const [ix1, iy1] = polar(cx, cy, inner, from);
  return [
    `M ${ox1} ${oy1}`,
    `A ${outer} ${outer} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1}`,
    'Z',
  ].join(' ');
}

/** A full ring, drawn as two half arcs so it is not a degenerate zero-length arc. */
function ringPath(cx: number, cy: number, outer: number, inner: number): string {
  return [
    `M ${cx} ${cy - outer}`,
    `A ${outer} ${outer} 0 1 1 ${cx} ${cy + outer}`,
    `A ${outer} ${outer} 0 1 1 ${cx} ${cy - outer}`,
    `M ${cx} ${cy - inner}`,
    `A ${inner} ${inner} 0 1 0 ${cx} ${cy + inner}`,
    `A ${inner} ${inner} 0 1 0 ${cx} ${cy - inner}`,
    'Z',
  ].join(' ');
}
```

- [ ] **Step 6: Run it, confirm it passes**

```bash
npm test -w @monthly-budget/mobile -- scale
```

Expected: all pass. Report the ACTUAL count — do not reconcile it against any number in this plan.

- [ ] **Step 7: Check coverage**

```bash
npm run test:coverage -w @monthly-budget/mobile
```

Report the rows for `scale.ts` and `palette.ts`, and name any uncovered line.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/jest.config.js react-native/apps/mobile/src/charts/
git commit -m "feat(mobile): add chart geometry as pure, testable functions

testEnvironment: node cannot render React, so anything inside a .tsx file
is unreachable by a test. All the arithmetic a chart can get wrong -- axis
ticks, bar rects, donut arcs -- lives here in plain functions instead, and
the components added next do nothing but map these results onto SVG.

The degenerate cases are the point: an all-zero month yields zero-height
bars rather than NaN from a 0/0 scale, an empty month yields no arcs rather
than dividing by zero, and a single category is drawn as two half arcs
because a 360-degree arc has identical endpoints and renders as nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `direction.ts` and `monthBarModel.ts` — the testable half of the UI

**Files:**
- Create: `react-native/apps/mobile/src/components/direction.ts`
- Create: `react-native/apps/mobile/src/components/monthBarModel.ts`
- Create: `react-native/apps/mobile/src/components/direction.test.ts`
- Create: `react-native/apps/mobile/src/components/monthBarModel.test.ts`

**Interfaces:**
- Consumes: `type Locale`, `MonthKey`, `currentMonthKey`, `isFutureKey`, `nextKey`, `prevKey`, `monthLabel` from `@monthly-budget/shared`
- Produces:
  - `rowDirection(locale): 'row' | 'row-reverse'`, `textAlign(locale): 'left' | 'right'`, `writingDirection(locale): 'ltr' | 'rtl'`, `isRTLLocale(locale): boolean`
  - `monthBarModel(monthKey, locale, today?): { label; canGoNext; canGoPrev; isCurrent; prevLabel; nextLabel }`

The user chose per-component direction over `I18nManager` so the language switch takes effect instantly. That choice also makes direction a value rather than global native state, which is why it can be tested here at all.

- [ ] **Step 1: Write the failing tests**

Create `react-native/apps/mobile/src/components/direction.test.ts`:

```ts
import { rowDirection, textAlign, writingDirection, isRTLLocale } from './direction';

describe('direction from locale', () => {
  it('lays Arabic rows out from the right', () => {
    expect(rowDirection('ar')).toBe('row-reverse');
    expect(rowDirection('en')).toBe('row');
  });

  it('aligns Arabic text to the right', () => {
    expect(textAlign('ar')).toBe('right');
    expect(textAlign('en')).toBe('left');
  });

  it('reports the writing direction for text nodes', () => {
    expect(writingDirection('ar')).toBe('rtl');
    expect(writingDirection('en')).toBe('ltr');
  });

  it('identifies which locales are right-to-left', () => {
    expect(isRTLLocale('ar')).toBe(true);
    expect(isRTLLocale('en')).toBe(false);
  });

  it('is consistent across the four helpers', () => {
    for (const locale of ['ar', 'en'] as const) {
      const rtl = isRTLLocale(locale);
      expect(rowDirection(locale)).toBe(rtl ? 'row-reverse' : 'row');
      expect(textAlign(locale)).toBe(rtl ? 'right' : 'left');
      expect(writingDirection(locale)).toBe(rtl ? 'rtl' : 'ltr');
    }
  });
});
```

Create `react-native/apps/mobile/src/components/monthBarModel.test.ts`:

```ts
import { monthBarModel } from './monthBarModel';

const TODAY = new Date(2026, 7, 26); // 2026-08

describe('monthBarModel', () => {
  it('labels the displayed month in the chosen locale', () => {
    expect(monthBarModel('2026-08', 'en', TODAY).label).toBe('August 2026');
    expect(monthBarModel('2026-08', 'ar', TODAY).label).toBe('أغسطس 2026');
  });

  it('knows when the displayed month is the current one', () => {
    expect(monthBarModel('2026-08', 'en', TODAY).isCurrent).toBe(true);
    expect(monthBarModel('2026-07', 'en', TODAY).isCurrent).toBe(false);
  });

  it('disables forward navigation at the current month', () => {
    expect(monthBarModel('2026-08', 'en', TODAY).canGoNext).toBe(false);
  });

  it('enables forward navigation in the past', () => {
    expect(monthBarModel('2026-05', 'en', TODAY).canGoNext).toBe(true);
  });

  it('always allows going back', () => {
    expect(monthBarModel('2026-08', 'en', TODAY).canGoPrev).toBe(true);
    expect(monthBarModel('2020-01', 'en', TODAY).canGoPrev).toBe(true);
  });

  it('labels the adjacent months, so a control can name where it goes', () => {
    const m = monthBarModel('2026-07', 'en', TODAY);
    expect(m.prevLabel).toBe('June 2026');
    expect(m.nextLabel).toBe('August 2026');
  });

  it('names the adjacent months across a year boundary', () => {
    const m = monthBarModel('2026-01', 'en', TODAY);
    expect(m.prevLabel).toBe('December 2025');
    expect(m.nextLabel).toBe('February 2026');
  });

  it('still names the next month even when moving there is disabled', () => {
    // The label is for a screen reader; the disabled flag governs the tap.
    const m = monthBarModel('2026-08', 'en', TODAY);
    expect(m.canGoNext).toBe(false);
    expect(m.nextLabel).toBe('September 2026');
  });
});
```

- [ ] **Step 2: Run them, confirm they fail**

```bash
npm test -w @monthly-budget/mobile -- direction
npm test -w @monthly-budget/mobile -- monthBarModel
```

Expected: FAIL with module-not-found for each.

- [ ] **Step 3: Write `direction.ts`**

Create `react-native/apps/mobile/src/components/direction.ts`:

```ts
import type { Locale } from '@monthly-budget/shared';

/**
 * Text direction as plain values, derived from the locale.
 *
 * Deliberately NOT React Native's I18nManager. `I18nManager.forceRTL` only
 * takes effect after the app restarts, so a language switch would require
 * telling the user to relaunch. Passing direction down as a value flips the
 * interface immediately -- and, unlike global native state, can be tested.
 */
export function isRTLLocale(locale: Locale): boolean {
  return locale === 'ar';
}

export function rowDirection(locale: Locale): 'row' | 'row-reverse' {
  return isRTLLocale(locale) ? 'row-reverse' : 'row';
}

export function textAlign(locale: Locale): 'left' | 'right' {
  return isRTLLocale(locale) ? 'right' : 'left';
}

export function writingDirection(locale: Locale): 'ltr' | 'rtl' {
  return isRTLLocale(locale) ? 'rtl' : 'ltr';
}
```

- [ ] **Step 4: Write `monthBarModel.ts`**

Create `react-native/apps/mobile/src/components/monthBarModel.ts`:

```ts
import {
  currentMonthKey,
  isFutureKey,
  monthLabel,
  nextKey,
  prevKey,
  type Locale,
  type MonthKey,
} from '@monthly-budget/shared';

export interface MonthBarModel {
  label: string;
  prevLabel: string;
  nextLabel: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  isCurrent: boolean;
}

/**
 * Everything the month bar needs to decide what to show, with no rendering.
 *
 * `nextLabel` is provided even when `canGoNext` is false: the label describes
 * where the control points for a screen reader, while the flag governs whether
 * the tap does anything.
 */
export function monthBarModel(
  monthKey: MonthKey,
  locale: Locale,
  today: Date = new Date(),
): MonthBarModel {
  const current = currentMonthKey(today);
  const next = nextKey(monthKey);
  return {
    label: monthLabel(monthKey, locale),
    prevLabel: monthLabel(prevKey(monthKey), locale),
    nextLabel: monthLabel(next, locale),
    canGoPrev: true,
    // A month that has not happened cannot hold anything to budget.
    canGoNext: !isFutureKey(next, today),
    isCurrent: monthKey === current,
  };
}
```

- [ ] **Step 5: Run them, confirm they pass**

```bash
npm test -w @monthly-budget/mobile -- direction
npm test -w @monthly-budget/mobile -- monthBarModel
```

Expected: all pass. Report the ACTUAL counts.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/components/
git commit -m "feat(mobile): derive text direction and month-bar state as values

Text direction is computed from the locale and passed down, not set through
I18nManager. forceRTL only takes effect after an app restart, so a language
switch would have meant telling the user to relaunch; as a value it flips
immediately. The side benefit is that direction becomes testable, which
global native state never is.

monthBarModel holds every decision the bar makes -- which controls are live,
what each is called -- so the component itself has nothing left to get wrong.
It reports nextLabel even when moving forward is disabled, because the label
describes where a control points for a screen reader while the flag governs
the tap.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The chart and month-bar components

**Files:**
- Create: `react-native/apps/mobile/src/charts/Bars.tsx`
- Create: `react-native/apps/mobile/src/charts/Donut.tsx`
- Create: `react-native/apps/mobile/src/components/MonthBar.tsx`
- Modify: `react-native/apps/mobile/package.json` (drop `react-native-chart-kit`)

**Interfaces:**
- Consumes: `barLayout`, `donutArcs`, `niceTicks` from `../charts/scale`; `colorFor` from `../charts/palette`; `monthBarModel` from `./monthBarModel`; `rowDirection`, `textAlign` from `./direction`; `Svg`, `Rect`, `Path`, `Line`, `Text as SvgText`, `G` from `react-native-svg`
- Produces: `<Bars>`, `<Donut>`, `<MonthBar>`

These are thin: every number they draw comes from Task 1 and Task 2. They are verified by typecheck, since `testEnvironment: node` cannot render them.

- [ ] **Step 1: Confirm what is being replaced**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
grep -n "chart-kit\|BarChart\|PieChart" apps/mobile/src/App.tsx
```

Record the output — there are three chart sites, and Task 4 replaces them.

- [ ] **Step 2: Write `Bars.tsx`**

Create `react-native/apps/mobile/src/charts/Bars.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { barLayout, niceTicks } from './scale';
import { colorFor } from './palette';

export interface BarsProps {
  data: { label: string; value: number; colorIndex?: number }[];
  width: number;
  height?: number;
  formatValue?: (v: number) => string;
}

/**
 * A bar chart. Every coordinate comes from barLayout/niceTicks, which are
 * tested; this component only maps them onto SVG elements.
 */
export function Bars({ data, width, height = 180, formatValue }: BarsProps) {
  const axisWidth = 44;
  const labelHeight = 22;
  const plotWidth = Math.max(0, width - axisWidth);
  const plotHeight = Math.max(0, height - labelHeight);

  const values = data.map((d) => d.value);
  const ticks = niceTicks(Math.max(...values, 0));
  const axisMax = ticks[ticks.length - 1];
  // Scaled against the AXIS maximum, so the tallest bar meets the top
  // gridline rather than overshooting it.
  const bars = barLayout(values, {
    width: plotWidth,
    height: plotHeight,
    gap: 14,
    max: axisMax,
  });

  return (
    <View>
      <Svg width={width} height={height}>
        <G x={axisWidth}>
          {ticks.map((tick) => {
            const y = plotHeight - (axisMax > 0 ? (tick / axisMax) * plotHeight : 0);
            return (
              <G key={`t${tick}`}>
                <Line x1={0} y1={y} x2={plotWidth} y2={y} stroke="#D8DED8" strokeWidth={1} />
                <SvgText x={-6} y={y + 4} fontSize={10} fill="#5C6B63" textAnchor="end">
                  {formatValue ? formatValue(tick) : String(tick)}
                </SvgText>
              </G>
            );
          })}
          {bars.map((b, i) => (
            <Rect
              key={data[i].label + i}
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              rx={3}
              fill={colorFor(data[i].colorIndex ?? i)}
            />
          ))}
          {bars.map((b, i) => (
            <SvgText
              key={`l${data[i].label}${i}`}
              x={b.x + b.width / 2}
              y={plotHeight + 15}
              fontSize={11}
              fill="#141F1A"
              textAnchor="middle"
            >
              {data[i].label}
            </SvgText>
          ))}
        </G>
      </Svg>
    </View>
  );
}
```

- [ ] **Step 3: Write `Donut.tsx`**

Create `react-native/apps/mobile/src/charts/Donut.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { donutArcs } from './scale';
import { colorFor } from './palette';

export interface DonutProps {
  data: { label: string; value: number }[];
  size?: number;
  thickness?: number;
}

/** A category donut. All geometry comes from donutArcs, which is tested. */
export function Donut({ data, size = 180, thickness = 34 }: DonutProps) {
  const arcs = donutArcs(data.map((d) => d.value), { size, thickness });

  return (
    <View>
      <Svg width={size} height={size}>
        {arcs.map((arc, i) => (
          <Path key={data[i].label + i} d={arc.d} fill={colorFor(i)} />
        ))}
      </Svg>
    </View>
  );
}
```

- [ ] **Step 4: Write `MonthBar.tsx`**

Create `react-native/apps/mobile/src/components/MonthBar.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Locale, MonthKey } from '@monthly-budget/shared';
import { t } from '../i18n';
import { monthBarModel } from './monthBarModel';
import { rowDirection, writingDirection } from './direction';

export interface MonthBarProps {
  monthKey: MonthKey;
  locale: Locale;
  onPrev(): void;
  onNext(): void;
  onCurrent(): void;
  today?: Date;
}

export function MonthBar({ monthKey, locale, onPrev, onNext, onCurrent, today }: MonthBarProps) {
  const m = monthBarModel(monthKey, locale, today);
  // In a right-to-left layout the row itself reverses, so the control that
  // means "back" stays on the side the reader expects without swapping the
  // handlers -- swapping those would break the arrows for screen readers.
  const row = rowDirection(locale);

  return (
    <View style={[styles.bar, { flexDirection: row }]}>
      <TouchableOpacity
        style={styles.arrow}
        onPress={onPrev}
        accessibilityRole="button"
        accessibilityLabel={`${t('month.previous', locale)}: ${m.prevLabel}`}
      >
        <Text style={styles.arrowText}>‹</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.center}
        onPress={onCurrent}
        disabled={m.isCurrent}
        accessibilityRole="button"
        accessibilityLabel={m.isCurrent ? m.label : t('month.current', locale)}
      >
        <Text style={[styles.label, { writingDirection: writingDirection(locale) }]}>
          {m.label}
        </Text>
        {!m.isCurrent && <Text style={styles.jump}>{t('month.current', locale)}</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.arrow, !m.canGoNext && styles.arrowDisabled]}
        onPress={onNext}
        disabled={!m.canGoNext}
        accessibilityRole="button"
        accessibilityState={{ disabled: !m.canGoNext }}
        accessibilityLabel={`${t('month.next', locale)}: ${m.nextLabel}`}
      >
        <Text style={[styles.arrowText, !m.canGoNext && styles.arrowTextDisabled]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowDisabled: { opacity: 0.3 },
  arrowText: { fontSize: 28, color: '#1B6B57' },
  arrowTextDisabled: { color: '#5C6B63' },
  center: { flex: 1, alignItems: 'center' },
  label: { fontSize: 18, fontWeight: '600', color: '#141F1A' },
  jump: { fontSize: 12, color: '#1B6B57', marginTop: 2 },
});
```

- [ ] **Step 5: Drop the chart-kit dependency**

In `react-native/apps/mobile/package.json`, remove the `"react-native-chart-kit"` line from `dependencies`. Leave `react-native-svg` — it is now actually used.

Do NOT run `npm uninstall`; edit the manifest and reinstall:

```bash
npm install --workspaces --include-workspace-root
```

`App.tsx` still imports chart-kit at this point, so the typecheck will fail until Task 4. That is expected and is why these two tasks are adjacent.

- [ ] **Step 6: Verify the new components compile in isolation**

```bash
npm run typecheck -w @monthly-budget/mobile 2>&1 | grep -E "charts/|components/MonthBar" || echo "no errors in the new components"
```

Run the project's own typecheck and filter to the new files. A standalone
`tsc` invocation will not resolve React Native's types the way the project
config does, and would report errors that are artefacts of the invocation
rather than real problems.

Expected: nothing from `charts/` or `components/MonthBar`. Errors in `App.tsx`,
which still imports chart-kit at this point, are expected until Task 4.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/charts/ react-native/apps/mobile/src/components/MonthBar.tsx \
        react-native/apps/mobile/package.json react-native/package-lock.json
git commit -m "feat(mobile): add SVG chart and month-bar components, drop chart-kit

react-native-chart-kit was already a dependency and already drew three
charts, but it cannot do grouped bars, has no RTL support, and truncates
category names with substring(0, 8) -- which destroys Arabic. It is replaced
by components over react-native-svg, which was already installed and unused.

The components are deliberately thin. Every coordinate comes from the tested
geometry functions, so the parts that can be wrong are the parts under test.

MonthBar reverses its row for Arabic rather than swapping the handlers:
swapping them would leave a screen reader announcing the wrong direction.

App.tsx still imports chart-kit at this commit, so the app typecheck fails
until the next task swaps the call sites.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Wire the month bar and the new charts into `App.tsx`

**Files:**
- Modify: `react-native/apps/mobile/src/App.tsx`

**Interfaces:**
- Consumes: `<MonthBar>` from `./components/MonthBar`, `<Bars>` and `<Donut>` from `./charts/*`, plus the provider actions already available from `useBudget()`
- Produces: an app you can navigate month by month, whose charts show only the displayed month

- [ ] **Step 1: Add the month bar**

Render `<MonthBar>` directly beneath the app header, above the tab strip, passing `monthKey`, `store.locale`, and the `goPrev` / `goNext` / `goCurrent` actions from `useBudget()`.

- [ ] **Step 2: Retire the old month/year modal**

The screen has a `renderMonthYearPicker` modal and a "Tap to change" control that opened it. The month bar replaces both for ordinary navigation. Keep the modal ONLY if it can still jump to an arbitrary month — that is the one thing the bar cannot do. If you keep it, wire its confirm handler to `goTo(monthKey)` from `useBudget()` rather than to the old local state. If you remove it, delete the state, the handler and the styles it used, leaving nothing orphaned.

State which you did and why in your report.

- [ ] **Step 3: Replace the income-vs-expenses bar chart**

Swap the first `<BarChart>` for:

```tsx
<Bars
  width={screenWidth - 32}
  data={[
    { label: t('totals.income', store.locale), value: stats.income, colorIndex: 0 },
    { label: t('totals.expenses', store.locale), value: stats.expenses, colorIndex: 3 },
  ]}
  formatValue={(v) => formatMoney(v, store.currency, store.locale)}
/>
```

- [ ] **Step 4: Replace the category pie with the donut**

Swap the `<PieChart>` for `<Donut data={categoryStats.map(c => ({ label: c.category, value: c.amount }))} />`. Keep whatever legend the screen already renders; if the legend came from chart-kit's own props, render a simple one from `categoryStats` using `colorFor(i)` so the colours match the donut.

- [ ] **Step 5: Replace the category bar chart**

Swap the second `<BarChart>` for `<Bars>` fed from `categoryStats`. **Do not truncate the labels.** The old code did `substring(0, 8)`, which mangles Arabic. If labels collide visually, show fewer categories rather than cutting the text.

- [ ] **Step 6: Remove the chart-kit import**

Delete `import { BarChart, PieChart } from 'react-native-chart-kit';`.

- [ ] **Step 7: Verify**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm run typecheck -w @monthly-budget/mobile
npm test -w @monthly-budget/mobile
npm test -w @monthly-budget/shared
npx tsc --noEmit -p apps/desktop/tsconfig.json
grep -c "chart-kit" apps/mobile/src/App.tsx
grep -rn "substring(0, 8)" apps/mobile/src/ || echo "no truncation left"
```

Expected: typechecks exit 0; mobile and shared suites at their existing counts; `0` chart-kit references; no truncation.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/App.tsx
git commit -m "feat(mobile): navigate months, and draw only the month on screen

Adds the month bar and swaps all three charts to the SVG components. The
charts already existed and already worked, but they read every loaded entry
regardless of date, so a January expense appeared in an August pie. They now
read the displayed month, which is what makes them mean anything.

Category labels are no longer cut to eight characters. That was harmless for
'Food' and destroys an Arabic category name.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Translate the screen and add the language switch

**Files:**
- Modify: `react-native/apps/mobile/src/i18n/en.ts`, `ar.ts`
- Modify: `react-native/apps/mobile/src/state/budgetReducer.ts` and its test
- Modify: `react-native/apps/mobile/src/state/BudgetProvider.tsx`
- Modify: `react-native/apps/mobile/src/App.tsx`

**Interfaces:**
- Produces: a `setLocale` action on the reducer, a `setLocale(locale)` action on the provider, and a screen with no hardcoded English

This is the ONE permitted change to `src/state/`, and it must be additive: add a case, add a provider action, change nothing existing.

- [ ] **Step 1: Collect the strings that need translating**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
grep -oE '>[A-Z][a-zA-Z ?!.,'"'"'-]{2,40}<' apps/mobile/src/App.tsx | sort -u
```

There are roughly 28. Record the list; every one becomes a key.

- [ ] **Step 2: Add the keys to `en.ts`, then `ar.ts`**

Add a key per string to `en.ts` under a `screen.*` prefix, then add the matching Arabic to `ar.ts`. `ar.ts` is typed as `Record<keyof typeof en, string>`, so a missing key is a compile error — let the compiler tell you what you missed rather than checking by hand.

The existing i18n test asserts no Arabic value equals its English one, which catches a placeholder that was copied and never translated. Do not weaken it.

- [ ] **Step 3: Write the failing reducer test**

Add to `react-native/apps/mobile/src/state/budgetReducer.test.ts`:

```ts
describe('setLocale', () => {
  const ready = () =>
    budgetReducer(initialBudgetState(TODAY), { type: 'loaded', store: emptyStore(), notice: null });

  it('changes the stored locale', () => {
    const s = budgetReducer(ready(), { type: 'setLocale', locale: 'en' });
    expect(s.store.locale).toBe('en');
  });

  it('is persisted like any other change, not held only in memory', () => {
    // A new store object means the autosave effect sees a change and writes it.
    const before = ready();
    const after = budgetReducer(before, { type: 'setLocale', locale: 'en' });
    expect(after.store).not.toBe(before.store);
  });

  it('leaves the months untouched', () => {
    let s = ready();
    s = budgetReducer(s, {
      type: 'upsert', kind: 'expense',
      entry: { id: 'a', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' },
    });
    const months = s.store.months;
    s = budgetReducer(s, { type: 'setLocale', locale: 'en' });
    expect(s.store.months).toEqual(months);
  });

  it('is ignored before the load completes', () => {
    const s = initialBudgetState(TODAY);
    expect(budgetReducer(s, { type: 'setLocale', locale: 'en' })).toBe(s);
  });
});
```

- [ ] **Step 4: Run it, confirm it fails, then implement**

```bash
npm test -w @monthly-budget/mobile -- budgetReducer
```

Add `| { type: 'setLocale'; locale: Locale }` to `BudgetAction`, and a case to the reducer:

```ts
    case 'setLocale':
      // Guarded like every other mutation: a locale set before the load would
      // be built on the empty initial store and then persisted over real data.
      if (!canPersist(state)) return state;
      return { ...state, store: { ...state.store, locale: action.locale } };
```

Then add `setLocale: (locale: Locale) => dispatch({ type: 'setLocale', locale })` to the provider's context value and its interface.

- [ ] **Step 5: Replace the hardcoded strings**

Swap each string in `App.tsx` for `t('screen.…', store.locale)`. Apply `textAlign(store.locale)` and `writingDirection(store.locale)` to text blocks, and `rowDirection(store.locale)` to rows that read as sequences.

- [ ] **Step 6: Add the language switch**

Add a control in the "Data Management" section that calls `setLocale(store.locale === 'ar' ? 'en' : 'ar')`, labelled with the language it switches TO — a control labelled with the current language is ambiguous. It should take effect immediately, with no reload.

- [ ] **Step 7: Verify**

```bash
npm run typecheck -w @monthly-budget/mobile
npm test -w @monthly-budget/mobile
npm test -w @monthly-budget/shared
npx tsc --noEmit -p apps/desktop/tsconfig.json
grep -oE '>[A-Z][a-zA-Z ]{4,40}<' apps/mobile/src/App.tsx | sort -u
grep -rn "I18nManager" apps/mobile/src/ || echo "no I18nManager, as required"
```

The grep for capitalised strings should return nothing but genuinely non-translatable text (currency codes, numbers). Report anything it finds and justify it.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/
git commit -m "feat(mobile): translate the screen and switch language instantly

Every visible string now comes from the typed i18n tables, so a missing
Arabic translation is a compile error rather than English leaking into an
Arabic interface.

The switch is labelled with the language it moves TO -- a control showing the
current language leaves the user guessing what tapping it does. It takes
effect immediately because direction is a passed value rather than
I18nManager state, which would have required an app restart.

setLocale is guarded exactly like every other mutation: applied before the
load completes it would be built on the empty initial store and then
persisted over real data.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Break `App.tsx` apart

**Files:**
- Create: `react-native/apps/mobile/src/screens/SummaryScreen.tsx`
- Create: `react-native/apps/mobile/src/screens/IncomeScreen.tsx`
- Create: `react-native/apps/mobile/src/screens/ExpenseScreen.tsx`
- Create: `react-native/apps/mobile/src/screens/styles.ts`
- Modify: `react-native/apps/mobile/src/App.tsx`

**Interfaces:**
- Produces: `<SummaryScreen>`, `<IncomeScreen>`, `<ExpenseScreen>`, and a shared `styles`

Pure extraction. Behaviour must not change — this is what lets Phases 4 and 5 add screens without touching a 1,200-line file.

- [ ] **Step 1: Record the starting point**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
wc -l apps/mobile/src/App.tsx
```

Record it. The target is under 150 by Step 6.

- [ ] **Step 2: Move the StyleSheet**

Move the whole `StyleSheet.create({...})` into `src/screens/styles.ts`, exported as `styles`. Import it where needed. Nothing else changes.

- [ ] **Step 3: Extract the three tab bodies**

Move `renderSummary`, `renderIncomes` and `renderExpenses` into their own components. Each takes what it needs as props rather than closing over `App`'s scope, and each calls `useBudget()` directly for state.

Take the modals with the screen that owns them: the category picker belongs to the expense screen.

- [ ] **Step 4: Reduce `App.tsx` to a shell**

What should remain: the `BudgetProvider` wrapper, the header, `<MonthBar>`, the tab strip, the loading and error and notice banners, and the switch that picks a screen from `activeTab`.

- [ ] **Step 5: Verify nothing changed**

```bash
npm run typecheck -w @monthly-budget/mobile
npm test -w @monthly-budget/mobile
npm test -w @monthly-budget/shared
npx tsc --noEmit -p apps/desktop/tsconfig.json
wc -l apps/mobile/src/App.tsx apps/mobile/src/screens/*.tsx
grep -rn "AsyncStorage\|chart-kit\|I18nManager" apps/mobile/src/ || echo "clean"
```

Expected: typechecks exit 0; both suites unchanged; `App.tsx` under 150 lines; no screen file over 400; none of those three imports anywhere.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/
git commit -m "refactor(mobile): split the screen tree into one file per tab

App.tsx had grown past 1,200 lines holding the header, three tab bodies, two
modals and the whole StyleSheet. Phases 4 and 5 add an entry screen and a
comparison tab, and neither should have to be threaded into a file that size.

Pure extraction -- no behaviour changes. Each screen reads what it needs from
useBudget() rather than taking a dozen props, and each modal moves to the
screen that owns it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of Done for Phase 3

- [ ] A month bar navigates back and forward, refuses future months, and returns to the current one
- [ ] All three charts read the displayed month only
- [ ] `react-native-chart-kit` is gone from `package.json` and from every import
- [ ] No category label is truncated
- [ ] Every visible string comes from the i18n tables; a missing Arabic key fails the build
- [ ] The language switch takes effect immediately, with no `I18nManager` anywhere
- [ ] `App.tsx` is under 150 lines; no screen file over 400
- [ ] `src/charts/*.ts` and `src/components/*.ts` meet the coverage gate
- [ ] Both suites pass; `apps/desktop` still typechecks

## What is NOT in this plan

- **Phase 4** — the multiple-choice add-entry screen, and the `entry.date` validation that must land with it
- **Phase 5** — the comparison tab and the grouped bar chart. Note the carried finding: a sign-crossing net delta produces a real but counter-intuitive percent, so that view must render `absolute` and the `favorable` flag when `previous` is negative, never the raw percent
- **Phase 6** — recurring-items UI
- Rendering tests for any `.tsx` file, which need a device harness rather than `testEnvironment: node`
