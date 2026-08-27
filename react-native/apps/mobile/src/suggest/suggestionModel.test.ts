import { openSuggestions, suggestionToEntry } from './suggestionModel';
import { emptyStore, upsertEntry, dismissSuggestion, detectRecurring } from '@monthly-budget/shared';

const seq = () => { let n = 0; return () => `id${++n}`; };

/** Rent and salary in two months, so both are recurring. */
function history() {
  let s = emptyStore();
  for (const m of ['2026-06', '2026-07']) {
    s = upsertEntry(s, m, 'expense', { id: `r${m}`, name: 'Rent', category: 'housing', amount: 1500, date: `${m}-01` });
    s = upsertEntry(s, m, 'income', { id: `s${m}`, name: 'Salary', category: 'salary', amount: 6000, date: `${m}-25` });
  }
  return s;
}

describe('openSuggestions', () => {
  it('offers every recurring item for an empty month', () => {
    const names = openSuggestions(history(), '2026-08').map((s) => s.name).sort();
    expect(names).toEqual(['Rent', 'Salary']);
  });

  it('offers nothing when there is no history', () => {
    expect(openSuggestions(emptyStore(), '2026-08')).toEqual([]);
  });

  it('stops offering something already entered this month', () => {
    let s = history();
    s = upsertEntry(s, '2026-08', 'expense', { id: 'new', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' });
    expect(openSuggestions(s, '2026-08').map((x) => x.name)).toEqual(['Salary']);
  });

  it('stops offering something dismissed for this month', () => {
    const rent = detectRecurring(history()).find((t) => t.name === 'Rent')!;
    const s = dismissSuggestion(history(), '2026-08', rent.id);
    expect(openSuggestions(s, '2026-08').map((x) => x.name)).toEqual(['Salary']);
  });

  it('still offers it the FOLLOWING month, since dismissal is per month', () => {
    const rent = detectRecurring(history()).find((t) => t.name === 'Rent')!;
    const s = dismissSuggestion(history(), '2026-08', rent.id);
    expect(openSuggestions(s, '2026-09').map((x) => x.name).sort()).toEqual(['Rent', 'Salary']);
  });

  it('offers nothing when everything is dismissed', () => {
    let s = history();
    for (const t of detectRecurring(s)) s = dismissSuggestion(s, '2026-08', t.id);
    expect(openSuggestions(s, '2026-08')).toEqual([]);
  });

  it('carries the most recent amount', () => {
    let s = history();
    s = upsertEntry(s, '2026-07', 'expense', { id: 'r2', name: 'Rent', category: 'housing', amount: 1600, date: '2026-07-02' });
    const rent = openSuggestions(s, '2026-08').find((x) => x.name === 'Rent')!;
    expect(rent.amount).toBe(1600);
  });

  it('gives a day, falling back to the first when the template has none', () => {
    for (const s of openSuggestions(history(), '2026-08')) {
      expect(s.day).toBeGreaterThanOrEqual(1);
      expect(s.day).toBeLessThanOrEqual(31);
    }
  });

  it('caps how many it offers, so the strip cannot fill the screen', () => {
    let s = emptyStore();
    for (const m of ['2026-06', '2026-07']) {
      for (let i = 0; i < 12; i++) {
        s = upsertEntry(s, m, 'expense', { id: `e${m}${i}`, name: `Item${i}`, category: 'food', amount: 10 + i, date: `${m}-01` });
      }
    }
    expect(openSuggestions(s, '2026-08', { limit: 5 })).toHaveLength(5);
  });

  it('is stable across calls, so the strip does not reshuffle', () => {
    const a = openSuggestions(history(), '2026-08').map((s) => s.id);
    const b = openSuggestions(history(), '2026-08').map((s) => s.id);
    expect(a).toEqual(b);
  });
});

describe('suggestionToEntry', () => {
  it('builds an entry in the month it was offered for', () => {
    const s = openSuggestions(history(), '2026-08')[0];
    const e = suggestionToEntry(s, '2026-08', seq());
    expect(e.date.slice(0, 7)).toBe('2026-08');
    expect(e.name).toBe(s.name);
    expect(e.category).toBe(s.category);
    expect(e.amount).toBe(s.amount);
  });

  it('zero-pads the day', () => {
    const s = { ...openSuggestions(history(), '2026-08')[0], day: 3 };
    expect(suggestionToEntry(s, '2026-08', seq()).date).toBe('2026-08-03');
  });

  it('gives each accepted suggestion a distinct id', () => {
    const next = seq();
    const [a, b] = openSuggestions(history(), '2026-08');
    expect(suggestionToEntry(a, '2026-08', next).id)
      .not.toBe(suggestionToEntry(b, '2026-08', next).id);
  });

  it('round-trips: accepting a suggestion stops it being offered', () => {
    const s = history();
    const first = openSuggestions(s, '2026-08')[0];
    const after = upsertEntry(s, '2026-08', first.kind, suggestionToEntry(first, '2026-08', seq()));
    expect(openSuggestions(after, '2026-08').map((x) => x.id)).not.toContain(first.id);
  });
});
