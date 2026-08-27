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
