import * as api from './index';

describe('legacy API surface -- apps/desktop depends on these', () => {
  it('still exports the four functions desktop imports', () => {
    expect(typeof api.totals).toBe('function');
    expect(typeof api.expensesByCategory).toBe('function');
    expect(typeof api.serialize).toBe('function');
    expect(typeof api.deserialize).toBe('function');
  });

  it('keeps parseAmount exported', () => {
    expect(api.parseAmount('1,234.5')).toBe(1234.5);
  });

  it('keeps the legacy totals result keys unchanged', () => {
    const incomes = [{ id: 'a', name: 'i', category: 'x', amount: 100, date: '2026-08-01' }];
    const expenses = [{ id: 'b', name: 'e', category: 'x', amount: 25, date: '2026-08-01' }];
    const r = api.totals(incomes, expenses);
    expect(Object.keys(r).sort()).toEqual([
      'expense_total',
      'income_total',
      'profit',
      'profit_margin',
    ]);
  });

  it('round-trips a legacy BudgetDoc through serialize and deserialize', () => {
    const doc = {
      meta: { year: 2026, month: 8, saved_at: '' },
      incomes: [{ name: 'Salary', amount: 6000, date: '2026-08-01' }],
      expenses: [{ name: 'Rent', category: 'Housing', amount: 1500, date: '2026-08-01' }],
    };
    const back = api.deserialize(api.serialize(doc));
    expect(back.meta.year).toBe(2026);
    expect(back.meta.month).toBe(8);
    expect(back.incomes[0].name).toBe('Salary');
    expect(back.expenses[0].category).toBe('Housing');
  });
});

describe('new month-aware API surface', () => {
  it('exports the month helpers', () => {
    expect(api.currentMonthKey(new Date(2026, 7, 26))).toBe('2026-08');
    expect(api.prevKey('2026-01')).toBe('2025-12');
    expect(api.monthLabel('2026-08', 'ar')).toBe('أغسطس 2026');
  });

  it('exports the store, totals, compare, history, recurring and migrate entry points', () => {
    expect(typeof api.emptyStore).toBe('function');
    expect(typeof api.upsertEntry).toBe('function');
    expect(typeof api.totalsForMonth).toBe('function');
    expect(typeof api.compareMonths).toBe('function');
    expect(typeof api.nameSuggestions).toBe('function');
    expect(typeof api.detectRecurring).toBe('function');
    expect(typeof api.migrateV0toV1).toBe('function');
  });

  it('exports the category taxonomy', () => {
    expect(api.EXPENSE_CATEGORIES).toHaveLength(13);
    expect(api.INCOME_CATEGORIES).toHaveLength(7);
  });

  it('composes end to end: build a store, then compare two months', () => {
    let s = api.emptyStore({ currency: 'USD', locale: 'en' });
    s = api.upsertEntry(s, '2026-07', 'expense', {
      id: 'p', name: 'Rent', category: 'housing', amount: 1000, date: '2026-07-01',
    });
    s = api.upsertEntry(s, '2026-08', 'expense', {
      id: 'c', name: 'Rent', category: 'housing', amount: 1200, date: '2026-08-01',
    });
    const c = api.compareMonths(s, '2026-08');
    expect(c.previousKey).toBe('2026-07');
    expect(c.expenses.absolute).toBe(200);
    expect(c.expenses.favorable).toBe(false);
  });
});
