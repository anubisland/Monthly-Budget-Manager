import {
  emptyStore,
  getMonth,
  upsertEntry,
  removeEntry,
  monthsWithData,
} from './store';
import { makeId } from './ids';
import type { Entry } from './model';

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  name: 'Rent',
  category: 'housing',
  amount: 1500,
  date: '2026-08-01',
  ...over,
});

describe('emptyStore', () => {
  it('creates a v1 store with no months', () => {
    const s = emptyStore();
    expect(s.version).toBe(1);
    expect(s.months).toEqual({});
    expect(s.recurring).toEqual([]);
  });

  it('defaults currency and locale but accepts overrides', () => {
    expect(emptyStore().currency).toBe('SAR');
    expect(emptyStore().locale).toBe('ar');
    expect(emptyStore({ currency: 'USD', locale: 'en' }).currency).toBe('USD');
    expect(emptyStore({ currency: 'USD', locale: 'en' }).locale).toBe('en');
  });
});

describe('getMonth', () => {
  it('returns an empty month for a key with no data', () => {
    expect(getMonth(emptyStore(), '2026-08')).toEqual({ incomes: [], expenses: [] });
  });

  it('does not create the key as a side effect', () => {
    const s = emptyStore();
    getMonth(s, '2026-08');
    expect(Object.keys(s.months)).toEqual([]);
  });
});

describe('upsertEntry', () => {
  it('adds an expense to the right month', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry());
    expect(getMonth(s, '2026-08').expenses).toHaveLength(1);
    expect(getMonth(s, '2026-08').expenses[0].name).toBe('Rent');
    expect(getMonth(s, '2026-08').incomes).toHaveLength(0);
  });

  it('adds an income to the right month', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'income', entry({ id: 'salary', name: 'Salary' }));
    expect(getMonth(s, '2026-08').incomes).toHaveLength(1);
    expect(getMonth(s, '2026-08').incomes[0].name).toBe('Salary');
    expect(getMonth(s, '2026-08').expenses).toHaveLength(0);
  });

  it('does not mutate the input store', () => {
    const before = emptyStore();
    upsertEntry(before, '2026-08', 'expense', entry());
    expect(before.months).toEqual({});
  });

  it('updates in place when the id already exists', () => {
    let s = upsertEntry(emptyStore(), '2026-08', 'expense', entry());
    s = upsertEntry(s, '2026-08', 'expense', entry({ amount: 1600 }));
    expect(getMonth(s, '2026-08').expenses).toHaveLength(1);
    expect(getMonth(s, '2026-08').expenses[0].amount).toBe(1600);
  });

  it('clamps negative amounts to zero', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ amount: -50 }));
    expect(getMonth(s, '2026-08').expenses[0].amount).toBe(0);
  });

  it('keeps months independent -- writing one never touches another', () => {
    let s = upsertEntry(emptyStore(), '2026-07', 'expense', entry({ id: 'jul' }));
    s = upsertEntry(s, '2026-08', 'expense', entry({ id: 'aug' }));
    expect(getMonth(s, '2026-07').expenses.map((e) => e.id)).toEqual(['jul']);
    expect(getMonth(s, '2026-08').expenses.map((e) => e.id)).toEqual(['aug']);
  });
});

describe('removeEntry', () => {
  it('removes by id', () => {
    let s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ id: 'a' }));
    s = upsertEntry(s, '2026-08', 'expense', entry({ id: 'b' }));
    s = removeEntry(s, '2026-08', 'expense', 'a');
    expect(getMonth(s, '2026-08').expenses.map((e) => e.id)).toEqual(['b']);
  });

  it('is a no-op for an unknown id', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ id: 'a' }));
    expect(removeEntry(s, '2026-08', 'expense', 'zzz')).toEqual(s);
  });

  it('is a no-op for an unknown month', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry());
    expect(removeEntry(s, '2020-01', 'expense', 'e1')).toEqual(s);
  });
});

describe('monthsWithData', () => {
  it('lists months chronologically', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-10', 'expense', entry({ id: '1' }));
    s = upsertEntry(s, '2025-12', 'expense', entry({ id: '2' }));
    s = upsertEntry(s, '2026-02', 'expense', entry({ id: '3' }));
    expect(monthsWithData(s)).toEqual(['2025-12', '2026-02', '2026-10']);
  });

  it('omits months whose entries were all removed', () => {
    let s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ id: 'a' }));
    s = removeEntry(s, '2026-08', 'expense', 'a');
    expect(monthsWithData(s)).toEqual([]);
  });

  it('returns an empty list for an empty store', () => {
    expect(monthsWithData(emptyStore())).toEqual([]);
  });
});

describe('makeId', () => {
  it('is deterministic when given a seed', () => {
    let n = 0;
    const seed = () => ++n;
    expect(makeId(seed)).toBe('1');
    expect(makeId(seed)).toBe('2');
  });

  it('produces distinct ids across many calls without a seed', () => {
    const ids = new Set(Array.from({ length: 500 }, () => makeId()));
    expect(ids.size).toBe(500);
  });
});
