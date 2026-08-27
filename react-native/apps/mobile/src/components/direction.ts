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
