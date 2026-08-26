import { detectRecurring, suggestionsForMonth } from './recurring';
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

function store(): BudgetStore {
  let s = emptyStore();
  // Rent: three consecutive months -> recurring
  s = upsertEntry(s, '2026-06', 'expense', e({ id: 'r1', name: 'Rent', category: 'housing', amount: 1500, date: '2026-06-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'r2', name: 'Rent', category: 'housing', amount: 1500, date: '2026-07-01' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'r3', name: 'Rent', category: 'housing', amount: 1600, date: '2026-08-03' }));
  // Salary: two months -> recurring
  s = upsertEntry(s, '2026-07', 'income', e({ id: 's1', name: 'Salary', category: 'salary', amount: 6000, date: '2026-07-25' }));
  s = upsertEntry(s, '2026-08', 'income', e({ id: 's2', name: 'Salary', category: 'salary', amount: 6500, date: '2026-08-25' }));
  // Car repair: one month only -> not recurring
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'c1', name: 'Car repair', category: 'transport', amount: 300 }));
  return s;
}

describe('detectRecurring', () => {
  it('detects items appearing in at least two months', () => {
    const names = detectRecurring(store()).map((t) => t.name).sort();
    expect(names).toEqual(['Rent', 'Salary']);
  });

  it('excludes one-off items', () => {
    expect(detectRecurring(store()).map((t) => t.name)).not.toContain('Car repair');
  });

  it('carries the most recent amount, not the first', () => {
    const rent = detectRecurring(store()).find((t) => t.name === 'Rent');
    expect(rent?.lastAmount).toBe(1600);
  });

  it('records the kind and category', () => {
    const salary = detectRecurring(store()).find((t) => t.name === 'Salary');
    expect(salary?.kind).toBe('income');
    expect(salary?.category).toBe('salary');
  });

  it('infers the usual day of month from the most recent entry', () => {
    const salary = detectRecurring(store()).find((t) => t.name === 'Salary');
    expect(salary?.dayOfMonth).toBe(25);
  });

  it('honours a higher minMonths threshold', () => {
    expect(detectRecurring(store(), 3).map((t) => t.name)).toEqual(['Rent']);
  });

  it('returns an empty list for an empty store', () => {
    expect(detectRecurring(emptyStore())).toEqual([]);
  });

  it('gives each template a stable id derived from kind, category and name', () => {
    const a = detectRecurring(store()).find((t) => t.name === 'Rent');
    const b = detectRecurring(store()).find((t) => t.name === 'Rent');
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toBe('expense:housing:rent');
  });

  it('sorts templates by id in ascending order', () => {
    const ids = detectRecurring(store()).map((t) => t.id);
    // expense:housing:rent < income:salary:salary lexicographically ('e' < 'i')
    expect(ids).toEqual(['expense:housing:rent', 'income:salary:salary']);
  });

  it('keeps an income "other" template distinct from an expense "other" template', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-06', 'income', e({ id: 'io1', name: 'Misc', category: 'other', amount: 10 }));
    s = upsertEntry(s, '2026-07', 'income', e({ id: 'io2', name: 'Misc', category: 'other', amount: 10 }));
    s = upsertEntry(s, '2026-06', 'expense', e({ id: 'eo1', name: 'Misc', category: 'other', amount: 20 }));
    s = upsertEntry(s, '2026-07', 'expense', e({ id: 'eo2', name: 'Misc', category: 'other', amount: 20 }));
    const templates = detectRecurring(s);
    expect(templates).toHaveLength(2);
    const ids = templates.map((t) => t.id).sort();
    expect(ids).toEqual(['expense:other:misc', 'income:other:misc']);
  });

  it('yields null dayOfMonth when the most recent date is not a full YYYY-MM-DD', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-06', 'expense', e({ id: 'd1', name: 'Weird', category: 'other', amount: 5, date: '2026-06-01' }));
    s = upsertEntry(s, '2026-07', 'expense', e({ id: 'd2', name: 'Weird', category: 'other', amount: 5, date: '2026-07' }));
    const t = detectRecurring(s).find((x) => x.name === 'Weird');
    expect(t?.dayOfMonth).toBeNull();
  });

  it('does not count two entries in the same month as recurring', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-06', 'expense', e({ id: 'm1', name: 'Twice', category: 'other', amount: 5 }));
    s = upsertEntry(s, '2026-06', 'expense', e({ id: 'm2', name: 'Twice', category: 'other', amount: 7 }));
    expect(detectRecurring(s).map((t) => t.name)).not.toContain('Twice');
  });

  it('does not mutate the store', () => {
    const s = store();
    const before = JSON.stringify(s);
    detectRecurring(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('skips entries with an empty name rather than treating them as recurring', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-06', 'expense', e({ id: 'blank1', name: '', category: 'other', amount: 5 }));
    s = upsertEntry(s, '2026-07', 'expense', e({ id: 'blank2', name: '', category: 'other', amount: 5 }));
    expect(detectRecurring(s)).toEqual([]);
  });
});

// The spec says the template carries the MOST RECENT amount. Entries within a
// month are stored in insertion order, not date order, so comparing month keys
// alone let the last-INSERTED entry win over the chronologically latest one.
// Here the 20th is inserted BEFORE the 1st: the 20th must still win.
describe('most-recent within a single month', () => {
  it('uses the chronologically latest entry, not the last inserted', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-07', 'expense', e({ id: 'p', name: 'Rent', category: 'housing', amount: 9, date: '2026-07-01' }));
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'late', name: 'Rent', category: 'housing', amount: 200, date: '2026-08-20' }));
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'early', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' }));
    const t = detectRecurring(s).find((x) => x.name === 'Rent');
    expect(t?.lastAmount).toBe(200);
    expect(t?.dayOfMonth).toBe(20);
  });

  it('still prefers a later month over an earlier one', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'aug', name: 'Rent', category: 'housing', amount: 1600, date: '2026-08-01' }));
    s = upsertEntry(s, '2026-07', 'expense', e({ id: 'jul', name: 'Rent', category: 'housing', amount: 1500, date: '2026-07-28' }));
    const t = detectRecurring(s).find((x) => x.name === 'Rent');
    expect(t?.lastAmount).toBe(1600);
  });
});

// A forcing fixture: collect() visits income before expense each month, so
// 'income:salary:zebra' is discovered FIRST -- yet 'expense:food:apple' must
// sort ahead of it. This test fails if the .sort() is removed, which the
// previous ordering test did not.
describe('template sort is actually applied', () => {
  it('sorts by id even when discovery order is the reverse', () => {
    let s = emptyStore();
    for (const m of ['2026-06', '2026-07']) {
      s = upsertEntry(s, m, 'income', e({ id: 'z' + m, name: 'Zebra', category: 'salary', amount: 1, date: m + '-01' }));
      s = upsertEntry(s, m, 'expense', e({ id: 'a' + m, name: 'Apple', category: 'food', amount: 2, date: m + '-01' }));
    }
    expect(detectRecurring(s).map((t) => t.id)).toEqual([
      'expense:food:apple',
      'income:salary:zebra',
    ]);
  });
});

describe('suggestionsForMonth', () => {
  it('suggests recurring items not yet present in the target month', () => {
    const names = suggestionsForMonth(store(), '2026-09').map((s) => s.name).sort();
    expect(names).toEqual(['Rent', 'Salary']);
  });

  it('omits items already entered in the target month', () => {
    let s = store();
    s = upsertEntry(s, '2026-09', 'expense', e({ id: 'r4', name: 'Rent', category: 'housing', amount: 1600, date: '2026-09-01' }));
    expect(suggestionsForMonth(s, '2026-09').map((x) => x.name)).toEqual(['Salary']);
  });

  it('omits an already-entered income item too, not just expenses', () => {
    let s = store();
    s = upsertEntry(s, '2026-09', 'income', e({ id: 's3', name: 'Salary', category: 'salary', amount: 6500, date: '2026-09-25' }));
    expect(suggestionsForMonth(s, '2026-09').map((x) => x.name)).toEqual(['Rent']);
  });

  it('carries the last known amount into the suggestion', () => {
    const rent = suggestionsForMonth(store(), '2026-09').find((s) => s.name === 'Rent');
    expect(rent?.amount).toBe(1600);
  });

  it('returns nothing when the store has no history', () => {
    expect(suggestionsForMonth(emptyStore(), '2026-09')).toEqual([]);
  });

  it('does not mutate the store', () => {
    const s = store();
    const before = JSON.stringify(s);
    suggestionsForMonth(s, '2026-09');
    expect(JSON.stringify(s)).toBe(before);
  });
});
