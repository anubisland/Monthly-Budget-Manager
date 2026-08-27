import { currentMonthKey, type MonthKey } from '@monthly-budget/shared';

export type ShortcutKey = 'today' | 'yesterday' | 'firstOfMonth' | 'lastOfMonth';

export interface DayShortcut {
  key: ShortcutKey;
  day: number;
}

/**
 * How many days the month holds.
 *
 * Day 0 of the next month is the last day of this one, which handles leap years
 * without a rule about centuries. A malformed key falls back to 31: too many
 * days leaves an unreachable cell, too few would hide a real one.
 */
export function daysInMonth(monthKey: MonthKey): number {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return 31;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return 31;
  return new Date(Number(m[1]), month, 0).getDate();
}

/**
 * The date shortcuts worth offering for a given month.
 *
 * "Today" is only offered while the current month is on screen -- someone
 * filling in last March should not be handed a day that is not in March.
 * Duplicates are dropped, so the first of the month does not appear twice when
 * today happens to be the first.
 */
export function dayShortcuts(monthKey: MonthKey, today: Date = new Date()): DayShortcut[] {
  const last = daysInMonth(monthKey);
  const out: DayShortcut[] = [];
  const seen = new Set<number>();

  const add = (key: ShortcutKey, day: number) => {
    if (day < 1 || day > last || seen.has(day)) return;
    seen.add(day);
    out.push({ key, day });
  };

  if (monthKey === currentMonthKey(today)) {
    add('today', today.getDate());
    // Yesterday belongs to the previous month on the 1st, so it is not offered.
    add('yesterday', today.getDate() - 1);
  }
  add('firstOfMonth', 1);
  add('lastOfMonth', last);

  return out;
}
