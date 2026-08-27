import type { Locale } from '@monthly-budget/shared';
import { t } from '../i18n';

// Helper function to get the translated day-of-week abbreviation
const DAY_KEYS = [
  'screen.daySun', 'screen.dayMon', 'screen.dayTue', 'screen.dayWed',
  'screen.dayThu', 'screen.dayFri', 'screen.daySat',
] as const;

const getDayOfWeek = (dateStr: string, locale: Locale): string => {
  const date = new Date(dateStr);
  return t(DAY_KEYS[date.getDay()], locale);
};

// Helper function to get day of month
export const getDayOfMonth = (dateStr: string): number => {
  const date = new Date(dateStr);
  return date.getDate();
};

// Helper function to format date for display
export const formatDateDisplay = (dateStr: string, locale: Locale): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = date.getDate();
  const dayOfWeek = getDayOfWeek(dateStr, locale);
  return `${day} (${dayOfWeek})`;
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
