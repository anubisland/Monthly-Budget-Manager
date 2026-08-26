import { compareKeys, type MonthKey } from './month';
import { parseAmount } from './money';
import type { BudgetStore, Entry, EntryKind, MonthEntry } from './model';

export function emptyStore(opts?: {
  currency?: string;
  locale?: 'ar' | 'en';
}): BudgetStore {
  return {
    version: 1,
    currency: opts?.currency ?? 'SAR',
    locale: opts?.locale ?? 'ar',
    months: {},
    recurring: [],
  };
}

/** Read a month. Returns an empty month for a missing key without creating it. */
export function getMonth(store: BudgetStore, key: MonthKey): MonthEntry {
  return store.months[key] ?? { incomes: [], expenses: [] };
}

function listKey(kind: EntryKind): 'incomes' | 'expenses' {
  return kind === 'income' ? 'incomes' : 'expenses';
}

/** Add or replace an entry by id. Returns a new store; never mutates. */
export function upsertEntry(
  store: BudgetStore,
  key: MonthKey,
  kind: EntryKind,
  entry: Entry,
): BudgetStore {
  const month = getMonth(store, key);
  const field = listKey(kind);
  const normalized: Entry = { ...entry, amount: Math.max(0, parseAmount(entry.amount)) };
  const existing = month[field];
  const at = existing.findIndex((e) => e.id === normalized.id);
  const list =
    at === -1
      ? [...existing, normalized]
      : existing.map((e, i) => (i === at ? normalized : e));

  return {
    ...store,
    months: { ...store.months, [key]: { ...month, [field]: list } },
  };
}

/** Remove an entry by id. No-op if the month or id is unknown. */
export function removeEntry(
  store: BudgetStore,
  key: MonthKey,
  kind: EntryKind,
  id: string,
): BudgetStore {
  const month = store.months[key];
  if (!month) return store;
  const field = listKey(kind);
  const list = month[field].filter((e) => e.id !== id);
  if (list.length === month[field].length) return store;

  return {
    ...store,
    months: { ...store.months, [key]: { ...month, [field]: list } },
  };
}

/** Months that hold at least one entry, in chronological order. */
export function monthsWithData(store: BudgetStore): MonthKey[] {
  return Object.keys(store.months)
    .filter((k) => {
      const m = store.months[k];
      return m.incomes.length > 0 || m.expenses.length > 0;
    })
    .sort(compareKeys);
}
