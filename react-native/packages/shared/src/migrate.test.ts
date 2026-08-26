import { migrateV0toV1, needsMigration } from './migrate';
import { getMonth, monthsWithData } from './store';

/**
 * A v0 document whose meta says August but whose entries span July and
 * August. This is exactly the corruption finding F3 produced: the label and
 * the entry dates disagree, so the entry date must win.
 */
const v0 = {
  meta: { year: 2026, month: 8, saved_at: '2026-08-26T10:00:00Z' },
  incomes: [
    { name: 'Salary', amount: 6000, date: '2026-08-01' },
    { name: 'Bonus', amount: 500, date: '2026-07-15' },
  ],
  expenses: [
    { name: 'Rent', category: 'Housing', amount: 1500, date: '2026-08-01' },
    { name: 'Groceries', category: 'Food', amount: 400, date: '2026-07-03' },
    { name: 'Mystery', category: 'Weird Custom Cat', amount: 50, date: '2026-08-09' },
    { name: 'No date', category: 'Food', amount: 25 },
  ],
};

describe('needsMigration', () => {
  it('is true for a v0 document', () => {
    expect(needsMigration(v0)).toBe(true);
  });

  it('is false for a v1 store', () => {
    expect(needsMigration({ version: 1, months: {}, recurring: [] })).toBe(false);
  });

  it('is false for null or garbage', () => {
    expect(needsMigration(null)).toBe(false);
    expect(needsMigration('nonsense')).toBe(false);
    expect(needsMigration(42)).toBe(false);
  });
});

describe('migrateV0toV1', () => {
  it('distributes entries by their own date, not by meta.month', () => {
    const { store } = migrateV0toV1(v0);
    expect(monthsWithData(store)).toEqual(['2026-07', '2026-08']);
    expect(getMonth(store, '2026-07').incomes.map((e) => e.name)).toEqual(['Bonus']);
    expect(getMonth(store, '2026-07').expenses.map((e) => e.name)).toEqual(['Groceries']);
  });

  it('puts August entries in August', () => {
    const { store } = migrateV0toV1(v0);
    expect(getMonth(store, '2026-08').incomes.map((e) => e.name)).toEqual(['Salary']);
    expect(getMonth(store, '2026-08').expenses.map((e) => e.name).sort()).toEqual([
      'Mystery',
      'No date',
      'Rent',
    ]);
  });

  it('falls back to meta year and month for an entry with no date', () => {
    const { store } = migrateV0toV1(v0);
    const noDate = getMonth(store, '2026-08').expenses.find((e) => e.name === 'No date');
    expect(noDate).toBeDefined();
    expect(noDate?.date).toBe('2026-08-01');
  });

  it('maps known categories case-insensitively to their slug', () => {
    const { store } = migrateV0toV1(v0);
    const rent = getMonth(store, '2026-08').expenses.find((e) => e.name === 'Rent');
    expect(rent?.category).toBe('housing');
  });

  it('sends unmatched categories to other and keeps the item name', () => {
    const { store } = migrateV0toV1(v0);
    const mystery = getMonth(store, '2026-08').expenses.find((e) => e.name === 'Mystery');
    expect(mystery?.category).toBe('other');
    expect(mystery?.name).toBe('Mystery');
  });

  it('gives every migrated entry an id', () => {
    const { store } = migrateV0toV1(v0);
    const all = [
      ...getMonth(store, '2026-07').incomes,
      ...getMonth(store, '2026-07').expenses,
      ...getMonth(store, '2026-08').incomes,
      ...getMonth(store, '2026-08').expenses,
    ];
    expect(all.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });

  it('returns the original payload verbatim as a backup', () => {
    const { backup } = migrateV0toV1(v0);
    expect(JSON.parse(backup)).toEqual(v0);
  });

  it('reports how many entries it moved', () => {
    expect(migrateV0toV1(v0).entriesMoved).toBe(6);
    expect(migrateV0toV1(v0).migrated).toBe(true);
  });

  it('parses amounts and clamps negatives to zero', () => {
    const { store } = migrateV0toV1({
      meta: { year: 2026, month: 8 },
      incomes: [],
      expenses: [{ name: 'Refund', category: 'Food', amount: -40, date: '2026-08-02' }],
    });
    expect(getMonth(store, '2026-08').expenses[0].amount).toBe(0);
  });

  it('returns an empty v1 store for a v0 document with no entries', () => {
    const { store, entriesMoved } = migrateV0toV1({ meta: { year: 2026, month: 8 } });
    expect(store.version).toBe(1);
    expect(monthsWithData(store)).toEqual([]);
    expect(entriesMoved).toBe(0);
  });

  it('does not re-migrate a v1 store and reports migrated false', () => {
    const already = { version: 1, currency: 'USD', locale: 'en', months: {}, recurring: [] };
    const r = migrateV0toV1(already);
    expect(r.migrated).toBe(false);
    expect(r.store).toEqual(already);
  });

  it('returns an empty store for unusable input rather than throwing', () => {
    expect(migrateV0toV1(null).store.version).toBe(1);
    expect(migrateV0toV1('garbage').entriesMoved).toBe(0);
  });

  it('uses the injected today when meta has no usable year', () => {
    const { store } = migrateV0toV1(
      { meta: {}, incomes: [], expenses: [{ name: 'Orphan', category: 'Food', amount: 10 }] },
      { today: new Date(2031, 4, 9) },
    );
    // No meta.year, so the injected clock supplies the year; month falls back to 01.
    expect(getMonth(store, '2031-01').expenses.map((e) => e.name)).toEqual(['Orphan']);
  });

  it('honours currency and locale options', () => {
    const { store } = migrateV0toV1(v0, { currency: 'EGP', locale: 'en' });
    expect(store.currency).toBe('EGP');
    expect(store.locale).toBe('en');
  });

  // --- Beyond-the-brief tests: this module carries irreversible data risk. ---

  it('does not silently drop any valid entry: total moved equals total distributed', () => {
    const { store, entriesMoved } = migrateV0toV1(v0);
    const total = Object.values(store.months).reduce(
      (sum, m) => sum + m.incomes.length + m.expenses.length,
      0,
    );
    expect(total).toBe(entriesMoved);
  });

  it('round-trips the backup exactly, including fields the migration ignores', () => {
    const withExtra = { ...v0, unrelatedField: { nested: [1, 2, 3] }, notes: 'keep me' };
    const { backup } = migrateV0toV1(withExtra);
    expect(JSON.parse(backup)).toEqual(withExtra);
  });

  it('gives every entry a unique id across incomes and expenses combined', () => {
    const { store } = migrateV0toV1(v0);
    const all = Object.values(store.months).flatMap((m) => [...m.incomes, ...m.expenses]);
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('accepts a month-only entry date (no day) and pads it to the first of the month', () => {
    const { store } = migrateV0toV1({
      meta: { year: 2026, month: 1 },
      incomes: [{ name: 'Grant', amount: 100, date: '2026-08' }],
      expenses: [],
    });
    expect(getMonth(store, '2026-08').incomes[0].date).toBe('2026-08-01');
  });

  it('falls back to the injected clock when there is no meta object at all', () => {
    const { store } = migrateV0toV1(
      { incomes: [{ name: 'NoMeta', amount: 10 }], expenses: [] },
      { today: new Date(2029, 2, 1) },
    );
    expect(getMonth(store, '2029-01').incomes.map((e) => e.name)).toEqual(['NoMeta']);
  });

  it('skips a non-object row instead of crashing or counting it', () => {
    const { store, entriesMoved } = migrateV0toV1({
      meta: { year: 2026, month: 8 },
      incomes: ['not an object', 42, null],
      expenses: [{ name: 'Rent', category: 'Housing', amount: 100, date: '2026-08-01' }],
    });
    expect(entriesMoved).toBe(1);
    expect(getMonth(store, '2026-08').incomes).toEqual([]);
    expect(getMonth(store, '2026-08').expenses.map((e) => e.name)).toEqual(['Rent']);
  });

  it('defaults an unnamed entry to a generic label per kind rather than an empty string', () => {
    const { store } = migrateV0toV1({
      meta: { year: 2026, month: 8 },
      incomes: [{ amount: 10, date: '2026-08-01' }],
      expenses: [{ amount: 20, date: '2026-08-01' }],
    });
    expect(getMonth(store, '2026-08').incomes[0].name).toBe('Income');
    expect(getMonth(store, '2026-08').expenses[0].name).toBe('Expense');
  });

  it('defaults a missing amount to zero instead of NaN', () => {
    const { store } = migrateV0toV1({
      meta: { year: 2026, month: 8 },
      incomes: [{ name: 'No amount', date: '2026-08-01' }],
      expenses: [],
    });
    expect(getMonth(store, '2026-08').incomes[0].amount).toBe(0);
  });

  it('drops a row whose only date signal is a malformed meta year, rather than mis-filing it', () => {
    // meta.year has 5 digits, so the fallback key ("20261-01") can never be a
    // valid MonthKey. The row must be skipped, not silently misfiled.
    const { store, entriesMoved } = migrateV0toV1({
      meta: { year: 20261, month: 8 },
      incomes: [{ name: 'Bad year', amount: 5 }],
      expenses: [],
    });
    expect(entriesMoved).toBe(0);
    expect(monthsWithData(store)).toEqual([]);
  });
});
