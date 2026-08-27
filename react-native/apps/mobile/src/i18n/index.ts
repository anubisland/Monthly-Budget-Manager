import type { Locale } from '@monthly-budget/shared';
import { en } from './en';
import { ar } from './ar';

export type StringKey = keyof typeof en;

const TABLES: Record<Locale, Record<StringKey, string>> = { en, ar };

/**
 * Look up a display string.
 *
 * An unmatched placeholder is left visible as `{name}` rather than replaced
 * with a blank: a blank is invisible in the UI and ships unnoticed, whereas a
 * visible token gets reported.
 */
export function t(
  key: StringKey,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const raw = TABLES[locale][key];
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function isRTL(locale: Locale): boolean {
  return locale === 'ar';
}

export function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

export { en, ar };
