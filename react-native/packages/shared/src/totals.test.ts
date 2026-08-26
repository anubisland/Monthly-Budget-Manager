import { totalsForMonth, expensesByCategoryForMonth, totals, expensesByCategory } from './totals';
import { emptyStore, upsertEntry } from './store';
import type { BudgetStore, Entry } from './model';

const e = (over: Partial<Entry>): Entry => ({
  id: 'x',
  name: 'n',
  category: 'other',
  amount: 0,
  date: '2026-08-01',
  ...over,
});

/** Two months of data: August and July, deliberately different. */
function twoMonths(): BudgetStore {
  let s = emptyStore({ currency: 'USD', locale: 'en' });
  s = upsertEntry(s, '2026-08', 'income', e({ id: 'i1', amount: 6000, category: 'salary' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'x1', amount: 1500, category: 'housing' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'x2', amount: 500, category: 'food' }));
  s = upsertEntry(s, '2026-07', 'income', e({ id: 'i2', amount: 1000, category: 'salary', date: '2026-07-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'x3', amount: 9999, category: 'debt', date: '2026-07-01' }));
  return s;
}

describe('totalsForMonth', () => {
  it('counts only the requested month -- regression guard for F1', () => {
    const t = totalsForMonth(twoMonths(), '2026-08');
    expect(t.income).toBe(6000);
    expect(t.expenses).toBe(2000);
    expect(t.net).toBe(4000);
  });

  it('reads a different month independently', () => {
    const t = totalsForMonth(twoMonths(), '2026-07');
    expect(t.income).toBe(1000);
    expect(t.expenses).toBe(9999);
    expect(t.net).toBe(-8999);
  });

  it('computes the profit margin as a percentage', () => {
    expect(totalsForMonth(twoMonths(), '2026-08').margin).toBeCloseTo(66.67, 2);
  });

  it('returns a zero margin when income is zero rather than dividing by zero', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'x', amount: 100 }));
    const t = totalsForMonth(s, '2026-08');
    expect(t.income).toBe(0);
    expect(t.margin).toBe(0);
    expect(t.net).toBe(-100);
  });

  it('returns all zeros for a month with no data', () => {
    expect(totalsForMonth(emptyStore(), '1999-01')).toEqual({
      income: 0,
      expenses: 0,
      net: 0,
      margin: 0,
    });
  });
});

describe('expensesByCategoryForMonth', () => {
  it('buckets by category for that month only', () => {
    const rows = expensesByCategoryForMonth(twoMonths(), '2026-08');
    expect(rows.map((r) => r.category)).toEqual(['housing', 'food']);
    expect(rows.map((r) => r.amount)).toEqual([1500, 500]);
  });

  it('sorts by amount descending', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'a', amount: 10, category: 'food' }));
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'b', amount: 90, category: 'housing' }));
    expect(expensesByCategoryForMonth(s, '2026-08').map((r) => r.category)).toEqual([
      'housing',
      'food',
    ]);
  });

  it('computes percent of that month total expenses', () => {
    const rows = expensesByCategoryForMonth(twoMonths(), '2026-08');
    expect(rows[0].percent).toBeCloseTo(75, 5);
    expect(rows[1].percent).toBeCloseTo(25, 5);
  });

  it('sums multiple entries in the same category', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'a', amount: 30, category: 'food' }));
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'b', amount: 70, category: 'food' }));
    const rows = expensesByCategoryForMonth(s, '2026-08');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(100);
  });

  it('returns an empty list for a month with no expenses', () => {
    expect(expensesByCategoryForMonth(emptyStore(), '2026-08')).toEqual([]);
  });
});

describe('legacy exports stay byte-compatible', () => {
  it('totals keeps its original shape and keys', () => {
    const r = totals(
      [e({ amount: 100 })],
      [e({ amount: 40 }), e({ amount: 10 })],
    );
    expect(r).toEqual({
      income_total: 100,
      expense_total: 50,
      profit: 50,
      profit_margin: 50,
    });
  });

  it('totals returns a zero margin for zero income', () => {
    expect(totals([], [e({ amount: 10 })]).profit_margin).toBe(0);
  });

  it('expensesByCategory defaults blank categories to Uncategorized', () => {
    const rows = expensesByCategory([e({ amount: 10, category: '' })]);
    expect(rows[0].category).toBe('Uncategorized');
  });

  it('expensesByCategory sorts by amount descending', () => {
    const rows = expensesByCategory([
      e({ amount: 10, category: 'a' }),
      e({ amount: 90, category: 'b' }),
    ]);
    expect(rows.map((r) => r.category)).toEqual(['b', 'a']);
  });

  it('accepts the loose shape apps/desktop passes -- no id, no date', () => {
    // This is exactly what apps/desktop/src/App.tsx:75 constructs.
    const loose = [{ name: 'Salary', amount: 5000 }];
    const looseExp = [{ name: 'Rent', category: 'Housing', amount: 1500 }];
    expect(totals(loose, looseExp).profit).toBe(3500);
    expect(expensesByCategory(looseExp)[0].category).toBe('Housing');
  });
});
