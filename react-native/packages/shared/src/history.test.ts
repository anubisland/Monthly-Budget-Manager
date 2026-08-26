import { nameSuggestions, amountSuggestions } from './history';
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

function history(): BudgetStore {
  let s = emptyStore();
  // Rent appears in three months at 1500, then 1600 once.
  s = upsertEntry(s, '2026-06', 'expense', e({ id: 'r1', name: 'Rent', category: 'housing', amount: 1500, date: '2026-06-01' }));
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'r2', name: 'Rent', category: 'housing', amount: 1500, date: '2026-07-01' }));
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'r3', name: 'Rent', category: 'housing', amount: 1600, date: '2026-08-01' }));
  // Maintenance appears once, in housing.
  s = upsertEntry(s, '2026-07', 'expense', e({ id: 'm1', name: 'Maintenance', category: 'housing', amount: 300, date: '2026-07-05' }));
  // Groceries is a different category.
  s = upsertEntry(s, '2026-08', 'expense', e({ id: 'g1', name: 'Groceries', category: 'food', amount: 400 }));
  // Salary is income, not expense.
  s = upsertEntry(s, '2026-08', 'income', e({ id: 's1', name: 'Salary', category: 'salary', amount: 6000 }));
  return s;
}

describe('nameSuggestions', () => {
  it('returns names used in that category, most frequent first', () => {
    expect(nameSuggestions(history(), 'expense', 'housing')).toEqual([
      'Rent',
      'Maintenance',
    ]);
  });

  it('does not leak names from other categories', () => {
    expect(nameSuggestions(history(), 'expense', 'housing')).not.toContain('Groceries');
  });

  it('does not leak across kinds', () => {
    expect(nameSuggestions(history(), 'expense', 'salary')).toEqual([]);
    expect(nameSuggestions(history(), 'income', 'salary')).toEqual(['Salary']);
  });

  it('deduplicates repeated names', () => {
    const names = nameSuggestions(history(), 'expense', 'housing');
    expect(new Set(names).size).toBe(names.length);
  });

  it('respects the limit', () => {
    expect(nameSuggestions(history(), 'expense', 'housing', 1)).toEqual(['Rent']);
  });

  it('returns an empty list for an unknown category', () => {
    expect(nameSuggestions(history(), 'expense', 'no_such', 5)).toEqual([]);
  });

  it('returns an empty list for an empty store', () => {
    expect(nameSuggestions(emptyStore(), 'expense', 'housing')).toEqual([]);
  });

  it('skips entries with an empty name', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'expense', e({ id: 'blank', name: '', category: 'housing', amount: 5 }));
    expect(nameSuggestions(s, 'expense', 'housing')).toEqual([]);
  });

  it('breaks frequency ties by most recent month, then alphabetically', () => {
    // Two names each appearing once in the same category but different months:
    // more recent month should rank first.
    let s = emptyStore();
    s = upsertEntry(s, '2026-06', 'expense', e({ id: 'a1', name: 'Alpha', category: 'misc', amount: 10, date: '2026-06-01' }));
    s = upsertEntry(s, '2026-07', 'expense', e({ id: 'b1', name: 'Beta', category: 'misc', amount: 20, date: '2026-07-01' }));
    expect(nameSuggestions(s, 'expense', 'misc')).toEqual(['Beta', 'Alpha']);

    // Same frequency, same most-recent month: alphabetical tie-break.
    let s2 = emptyStore();
    s2 = upsertEntry(s2, '2026-07', 'expense', e({ id: 'z1', name: 'Zeta', category: 'misc', amount: 10, date: '2026-07-01' }));
    s2 = upsertEntry(s2, '2026-07', 'expense', e({ id: 'y1', name: 'Yankee', category: 'misc', amount: 20, date: '2026-07-02' }));
    expect(nameSuggestions(s2, 'expense', 'misc')).toEqual(['Yankee', 'Zeta']);
  });
});

describe('amountSuggestions', () => {
  it('returns amounts used for that name, most frequent first', () => {
    expect(amountSuggestions(history(), 'expense', 'Rent')).toEqual([1500, 1600]);
  });

  it('matches the name case-insensitively', () => {
    expect(amountSuggestions(history(), 'expense', 'rent')).toEqual([1500, 1600]);
  });

  it('does not leak across kinds', () => {
    expect(amountSuggestions(history(), 'expense', 'Salary')).toEqual([]);
    expect(amountSuggestions(history(), 'income', 'Salary')).toEqual([6000]);
  });

  it('respects the limit', () => {
    expect(amountSuggestions(history(), 'expense', 'Rent', 1)).toEqual([1500]);
  });

  it('returns an empty list for an unknown name', () => {
    expect(amountSuggestions(history(), 'expense', 'Nothing')).toEqual([]);
  });

  it('breaks frequency ties by most recent month, then numerically', () => {
    // Two amounts each appearing once for the same name but different months.
    let s = emptyStore();
    s = upsertEntry(s, '2026-06', 'expense', e({ id: 'p1', name: 'Parking', category: 'transport', amount: 50, date: '2026-06-01' }));
    s = upsertEntry(s, '2026-07', 'expense', e({ id: 'p2', name: 'Parking', category: 'transport', amount: 20, date: '2026-07-01' }));
    expect(amountSuggestions(s, 'expense', 'Parking')).toEqual([20, 50]);

    // Same frequency, same most-recent month: numeric tie-break.
    let s2 = emptyStore();
    s2 = upsertEntry(s2, '2026-07', 'expense', e({ id: 'q1', name: 'Snack', category: 'food', amount: 90, date: '2026-07-01' }));
    s2 = upsertEntry(s2, '2026-07', 'expense', e({ id: 'q2', name: 'Snack', category: 'food', amount: 10, date: '2026-07-02' }));
    expect(amountSuggestions(s2, 'expense', 'Snack')).toEqual([10, 90]);
  });

  it('does not mutate the store', () => {
    const before = history();
    const snapshot = JSON.stringify(before);
    amountSuggestions(before, 'expense', 'Rent');
    nameSuggestions(before, 'expense', 'housing');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
