import type { Locale } from '@monthly-budget/shared';
import { en } from './en';
import { t, type StringKey } from './index';

/**
 * The display name for a stored category id.
 *
 * Ids in the fixed taxonomy have a `category.<id>` translation. Anything else
 * is data that predates the taxonomy -- migrated entries kept whatever free
 * text the old app stored -- and is shown as-is rather than as a missing key.
 *
 * It lives here, tested, rather than inline in a screen: two screens need it,
 * and a .tsx file is unreachable under testEnvironment: node.
 */
export function categoryLabel(categoryId: string, locale: Locale): string {
  const key = `category.${categoryId}` as StringKey;
  return key in en ? t(key, locale) : categoryId;
}
