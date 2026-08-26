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
