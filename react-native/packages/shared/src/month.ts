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
