import type { Locale } from '@monthly-budget/shared';
import { t } from '../i18n';

// Helper function to get the translated day-of-week abbreviation
const DAY_KEYS = [
  'screen.daySun', 'screen.dayMon', 'screen.dayTue', 'screen.dayWed',
  'screen.dayThu', 'screen.dayFri', 'screen.daySat',
] as const;

const FULL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_ONLY_RE = /^(\d{4})-(\d{2})$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

/**
 * Parse a "YYYY-MM-DD" (or bare "YYYY-MM", day defaulted to 1) string into
 * its own local calendar components.
 *
 * Never goes through `new Date(dateStr)`: that parses the string as UTC
 * midnight, and `.getDate()`/`.getDay()` read it back in local time, so in
 * any negative-offset zone the reported day silently shifts back by one.
 * Returns null for anything that isn't one of those two shapes, rather than
 * producing NaN.
 */
function parseDateParts(dateStr: string): DateParts | null {
  const full = FULL_DATE_RE.exec(dateStr);
  if (full) {
    const year = Number(full[1]);
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }
  const monthOnly = MONTH_ONLY_RE.exec(dateStr);
  if (monthOnly) {
    const year = Number(monthOnly[1]);
    const month = Number(monthOnly[2]);
    if (month < 1 || month > 12) return null;
    return { year, month, day: 1 };
  }
  return null;
}

// Takes already-parsed parts rather than re-parsing the string: every caller
// has already checked parseDateParts() for null, so a second null check here
// would be an unreachable branch.
const getDayOfWeek = (parts: DateParts, locale: Locale): string => {
  // Built from explicit local components -- timezone-safe, unlike parsing
  // the string itself through `new Date()`.
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return t(DAY_KEYS[date.getDay()], locale);
};

// Helper function to get day of month
export const getDayOfMonth = (dateStr: string): number => {
  const parts = parseDateParts(dateStr);
  return parts ? parts.day : 1;
};

// Helper function to format date for display
export const formatDateDisplay = (dateStr: string, locale: Locale): string => {
  if (!dateStr) return '';
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  const dayOfWeek = getDayOfWeek(parts, locale);
  return `${parts.day} (${dayOfWeek})`;
};

/**
 * Compose a full entry date from the displayed month and a day.
 *
 * A MonthKey is "YYYY-MM", so an entry recorded while viewing a month always
 * lands in that month rather than today's -- which is what lets you go back
 * and fill in a past month.
 */
export const dateForDay = (monthKey: string, day: number): string =>
  `${monthKey}-${String(day).padStart(2, '0')}`;
