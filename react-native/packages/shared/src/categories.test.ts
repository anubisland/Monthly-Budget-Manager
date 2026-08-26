import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoriesFor,
  isKnownCategory,
  OTHER_CATEGORY_ID,
} from './categories';

describe('category taxonomy', () => {
  it('has 13 expense categories and 7 income categories', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(13);
    expect(INCOME_CATEGORIES).toHaveLength(7);
  });

  it('uses ids that are stable ascii slugs', () => {
    for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      expect(c.id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('has unique ids within each kind', () => {
    const expenseIds = EXPENSE_CATEGORIES.map((c) => c.id);
    const incomeIds = INCOME_CATEGORIES.map((c) => c.id);
    expect(new Set(expenseIds).size).toBe(expenseIds.length);
    expect(new Set(incomeIds).size).toBe(incomeIds.length);
  });

  it('gives every category a non-empty icon', () => {
    for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      expect(c.icon.length).toBeGreaterThan(0);
    }
  });

  it('tags every category with its kind', () => {
    expect(EXPENSE_CATEGORIES.every((c) => c.kind === 'expense')).toBe(true);
    expect(INCOME_CATEGORIES.every((c) => c.kind === 'income')).toBe(true);
  });

  it('ends each list with the "other" fallback', () => {
    expect(EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1].id).toBe(OTHER_CATEGORY_ID);
    expect(INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1].id).toBe(OTHER_CATEGORY_ID);
  });
});

describe('categoriesFor', () => {
  it('returns the list matching the kind', () => {
    expect(categoriesFor('expense')).toBe(EXPENSE_CATEGORIES);
    expect(categoriesFor('income')).toBe(INCOME_CATEGORIES);
  });
});

describe('isKnownCategory', () => {
  it('recognises ids in the right list', () => {
    expect(isKnownCategory('expense', 'housing')).toBe(true);
    expect(isKnownCategory('income', 'salary')).toBe(true);
  });

  it('does not cross kinds', () => {
    expect(isKnownCategory('expense', 'salary')).toBe(false);
    expect(isKnownCategory('income', 'housing')).toBe(false);
  });

  it('rejects unknown ids', () => {
    expect(isKnownCategory('expense', 'no_such_category')).toBe(false);
  });
});
