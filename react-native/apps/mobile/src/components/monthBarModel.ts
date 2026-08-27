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
