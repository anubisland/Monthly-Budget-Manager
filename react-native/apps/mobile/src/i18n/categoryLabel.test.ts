import { categoryLabel } from './categoryLabel';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@monthly-budget/shared';
import { en, ar } from './index';

describe('categoryLabel', () => {
  it('translates every id in the taxonomy, in both languages', () => {
    for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      for (const locale of ['en', 'ar'] as const) {
        const label = categoryLabel(c.id, locale);
        expect(label).not.toBe(c.id);        // a real translation, not the slug
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives different text for the two languages', () => {
    expect(categoryLabel('housing', 'en')).not.toBe(categoryLabel('housing', 'ar'));
  });

  it('matches the tables exactly', () => {
    expect(categoryLabel('housing', 'en')).toBe(en['category.housing']);
    expect(categoryLabel('housing', 'ar')).toBe(ar['category.housing']);
  });

  it('shows legacy free-text categories as they were stored', () => {
    // Migrated data kept whatever the old app had. Showing the raw text beats
    // showing a missing-key placeholder for someone's own category name.
    for (const legacy of ['Housing', 'Weird Custom Cat', 'مصروف قديم', '']) {
      expect(categoryLabel(legacy, 'en')).toBe(legacy);
    }
  });

  it('does not confuse a legacy id that differs only by case', () => {
    // 'housing' is in the taxonomy; 'Housing' is legacy free text.
    expect(categoryLabel('Housing', 'en')).toBe('Housing');
    expect(categoryLabel('housing', 'en')).not.toBe('housing');
  });

  it('cannot be tricked by a key-shaped category name', () => {
    // A stored value must never be able to reach an unrelated translation.
    expect(categoryLabel('app.title', 'en')).toBe('app.title');
  });
});
