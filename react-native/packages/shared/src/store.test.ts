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

  it('returns a distinct object each call, so a caller cannot corrupt the store', () => {
    const s = emptyStore();
    const a = getMonth(s, '2026-08');
    const b = getMonth(s, '2026-08');
    expect(a).not.toBe(b);
    a.expenses.push(entry());
    expect(getMonth(s, '2026-08').expenses).toHaveLength(0);
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

  it('leaves an earlier store version untouched when updating', () => {
    const v1 = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ amount: 1500 }));
    const snapshot = JSON.stringify(v1);
    const v2 = upsertEntry(v1, '2026-08', 'expense', entry({ amount: 1600 }));
    expect(JSON.stringify(v1)).toBe(snapshot);
    expect(getMonth(v1, '2026-08').expenses[0].amount).toBe(1500);
    expect(getMonth(v2, '2026-08').expenses[0].amount).toBe(1600);
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

  // toBe, not toEqual: the contract is that a no-op returns the SAME store
  // reference. Deep equality would still pass if a regression made this
  // always spread into a fresh object, defeating reference-equality checks
  // in the modules built on this store.
  it('is a no-op for an unknown id, returning the same reference', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ id: 'a' }));
    expect(removeEntry(s, '2026-08', 'expense', 'zzz')).toBe(s);
  });

  it('is a no-op for an unknown month, returning the same reference', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry());
    expect(removeEntry(s, '2020-01', 'expense', 'e1')).toBe(s);
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

// The update path maps over the existing list, passing non-matching entries
// through untouched. Every other update test uses a single-entry month, so the
// pass-through arm never ran: editing one expense in a busy month was never
// shown to leave its neighbours alone. That is exactly what a user would
// notice, so it is pinned here.
describe('updating one entry in a busy month', () => {
  it('leaves every other entry in that month untouched', () => {
    let s = emptyStore();
    for (let i = 0; i < 5; i++) {
      s = upsertEntry(s, '2026-08', 'expense', entry({ id: `e${i}`, name: `Item${i}`, amount: (i + 1) * 100 }));
    }
    const before = getMonth(s, '2026-08').expenses.filter((e) => e.id !== 'e2');
    s = upsertEntry(s, '2026-08', 'expense', entry({ id: 'e2', name: 'Item2', amount: 9999 }));
    const after = getMonth(s, '2026-08').expenses;

    expect(after).toHaveLength(5);
    expect(after.find((e) => e.id === 'e2')?.amount).toBe(9999);
    expect(after.filter((e) => e.id !== 'e2')).toEqual(before);
    expect(after.map((e) => e.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']); // order preserved
  });
});
