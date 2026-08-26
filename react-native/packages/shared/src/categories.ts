import type { EntryKind } from './model';

export interface Category {
  id: string;
  icon: string;
  kind: EntryKind;
}

// NOTE: this id appears in BOTH EXPENSE_CATEGORIES and INCOME_CATEGORIES, as
// two distinct Category objects. Never build a flat id-keyed lookup across both
// lists -- the two 'other' entries would collapse into one and lose a kind.
// Always resolve a category with its kind, via categoriesFor(kind).
export const OTHER_CATEGORY_ID = 'other';

/**
 * Icons are emoji rather than an icon font: no extra dependency, renders on
 * both platforms, and unaffected by text direction. The trade-off is that
 * glyph shapes vary between platforms, which is acceptable here.
 *
 * `id` is stored in user data and never translated. Display names come from
 * the i18n layer, so switching language cannot corrupt stored entries.
 */
export const EXPENSE_CATEGORIES: readonly Category[] = [
  { id: 'housing', icon: '🏠', kind: 'expense' },
  { id: 'food', icon: '🍽️', kind: 'expense' },
  { id: 'transport', icon: '🚗', kind: 'expense' },
  { id: 'utilities', icon: '💡', kind: 'expense' },
  { id: 'health', icon: '⚕️', kind: 'expense' },
  { id: 'education', icon: '📚', kind: 'expense' },
  { id: 'shopping', icon: '🛍️', kind: 'expense' },
  { id: 'entertainment', icon: '🎬', kind: 'expense' },
  { id: 'communication', icon: '📱', kind: 'expense' },
  { id: 'debt', icon: '🏦', kind: 'expense' },
  { id: 'charity', icon: '🤲', kind: 'expense' },
  { id: 'savings', icon: '🐖', kind: 'expense' },
  { id: OTHER_CATEGORY_ID, icon: '▫️', kind: 'expense' },
];

export const INCOME_CATEGORIES: readonly Category[] = [
  { id: 'salary', icon: '💼', kind: 'income' },
  { id: 'freelance', icon: '💻', kind: 'income' },
  { id: 'business', icon: '🏪', kind: 'income' },
  { id: 'rental', icon: '🔑', kind: 'income' },
  { id: 'investment', icon: '📈', kind: 'income' },
  { id: 'gift', icon: '🎁', kind: 'income' },
  { id: OTHER_CATEGORY_ID, icon: '▫️', kind: 'income' },
];

export function categoriesFor(kind: EntryKind): readonly Category[] {
  return kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}

export function isKnownCategory(kind: EntryKind, id: string): boolean {
  return categoriesFor(kind).some((c) => c.id === id);
}
