import { makeDelta, compareMonths } from './compare';
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

describe('makeDelta status', () => {
  it('is flat when nothing changed', () => {
    expect(makeDelta(100, 100, 'income').status).toBe('flat');
    expect(makeDelta(0, 0, 'expenses').status).toBe('flat');
  });

  it('is new when previous was zero and current is not', () => {
    expect(makeDelta(300, 0, 'expenses').status).toBe('new');
  });

  it('is gone when current is zero and previous was not', () => {
    expect(makeDelta(0, 300, 'expenses').status).toBe('gone');
  });

  it('is changed otherwise', () => {
    expect(makeDelta(120, 100, 'income').status).toBe('changed');
  });
});

describe('makeDelta percent -- never divides by zero', () => {
  it('is null when previous is zero', () => {
    expect(makeDelta(300, 0, 'expenses').percent).toBeNull();
  });

  it('is null when both are zero', () => {
    expect(makeDelta(0, 0, 'expenses').percent).toBeNull();
  });

  it('computes a normal percentage change', () => {
    expect(makeDelta(120, 100, 'income').percent).toBeCloseTo(20, 5);
    expect(makeDelta(80, 100, 'expenses').percent).toBeCloseTo(-20, 5);
  });

  it('is always null for margin, which is measured in points', () => {
    const d = makeDelta(25.2, 22.9, 'margin');
    expect(d.percent).toBeNull();
    expect(d.absolute).toBeCloseTo(2.3, 5);
  });
});

describe('makeDelta favorable -- metric aware', () => {
  it('treats rising income, net and margin as favorable', () => {
    expect(makeDelta(120, 100, 'income').favorable).toBe(true);
    expect(makeDelta(120, 100, 'net').favorable).toBe(true);
    expect(makeDelta(26, 25, 'margin').favorable).toBe(true);
  });

  it('treats falling income, net and margin as unfavorable', () => {
    expect(makeDelta(80, 100, 'income').favorable).toBe(false);
    expect(makeDelta(80, 100, 'net').favorable).toBe(false);
  });

  it('inverts the sign for expenses -- rising spend is unfavorable', () => {
    expect(makeDelta(120, 100, 'expenses').favorable).toBe(false);
    expect(makeDelta(80, 100, 'expenses').favorable).toBe(true);
  });

  it('is null when nothing changed', () => {
    expect(makeDelta(100, 100, 'income').favorable).toBeNull();
    expect(makeDelta(100, 100, 'expenses').favorable).toBeNull();
  });
});

function august(): BudgetStore {
  let s = emptyStore({ currency: 'USD', locale: 'en' });
  // July
  s = upsertEntry(s, '2026-07', 'income', e({ id: 'i0', amount: 6000, date: '2026-07-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'p1', amount: 1500, category: 'housing', date: '2026-07-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'p2', amount: 640, category: 'food', date: '2026-07-02' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'p3', amount: 420, category: 'transport', date: '2026-07-03' }));
  // August
  s = upsertEntry(s, '2026-08', 'income', e({ id: 'i1', amount: 6500 }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c1', amount: 1500, category: 'housing' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c2', amount: 810, category: 'food' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c3', amount: 355, category: 'transport' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c4', amount: 300, category: 'health' }));
  return s;
}

describe('compareMonths', () => {
  it('picks the previous calendar month automatically', () => {
    const c = compareMonths(august(), '2026-08');
    expect(c.currentKey).toBe('2026-08');
    expect(c.previousKey).toBe('2026-07');
  });

  it('compares the four headline metrics', () => {
    const c = compareMonths(august(), '2026-08');
    expect(c.income.current).toBe(6500);
    expect(c.income.previous).toBe(6000);
    expect(c.income.absolute).toBe(500);
    expect(c.income.favorable).toBe(true);

    expect(c.expenses.current).toBe(2965);
    expect(c.expenses.previous).toBe(2560);
    expect(c.expenses.favorable).toBe(false);

    expect(c.net.current).toBe(3535);
    expect(c.net.previous).toBe(3440);
    expect(c.net.favorable).toBe(true);
  });

  it('includes the union of both months categories', () => {
    const cats = compareMonths(august(), '2026-08').byCategory.map((r) => r.category);
    expect(cats.sort()).toEqual(['food', 'health', 'housing', 'transport']);
  });

  it('marks a category present only this month as new', () => {
    const row = compareMonths(august(), '2026-08').byCategory.find(
      (r) => r.category === 'health',
    );
    expect(row?.delta.status).toBe('new');
    expect(row?.delta.previous).toBe(0);
    expect(row?.delta.percent).toBeNull();
  });

  it('marks a category present only last month as gone', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-07', 'expense', e({ id: 'g', amount: 50, category: 'gift_wrap', date: '2026-07-01' }));
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'h', amount: 50, category: 'food' }));
    const row = compareMonths(s, '2026-08').byCategory.find((r) => r.category === 'gift_wrap');
    expect(row?.delta.status).toBe('gone');
    expect(row?.delta.current).toBe(0);
  });

  it('marks an unchanged category as flat', () => {
    const row = compareMonths(august(), '2026-08').byCategory.find(
      (r) => r.category === 'housing',
    );
    expect(row?.delta.status).toBe('flat');
    expect(row?.delta.absolute).toBe(0);
  });

  it('sorts categories by current amount descending', () => {
    const cats = compareMonths(august(), '2026-08').byCategory.map((r) => r.category);
    expect(cats).toEqual(['housing', 'food', 'transport', 'health']);
  });

  it('handles a missing previous month as an explicit null, not zeros', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'income', e({ id: 'i', amount: 100 }));
    const c = compareMonths(s, '2026-08');
    expect(c.previousKey).toBeNull();
    expect(c.income.previous).toBe(0);
    expect(c.income.percent).toBeNull();
    expect(c.income.status).toBe('new');
  });

  it('reports margin change in points with a null percent', () => {
    const c = compareMonths(august(), '2026-08');
    expect(c.margin.percent).toBeNull();
    expect(c.margin.absolute).toBeCloseTo(
      (3535 / 6500) * 100 - (3440 / 6000) * 100,
      5,
    );
  });

  it('returns an all-zero comparison for two empty months', () => {
    const c = compareMonths(emptyStore(), '2026-08');
    expect(c.income.status).toBe('flat');
    expect(c.byCategory).toEqual([]);
  });
});
