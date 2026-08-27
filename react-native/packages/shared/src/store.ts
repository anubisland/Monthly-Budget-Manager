import { compareKeys, isValidMonthKey, type MonthKey } from './month';
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
    dismissed: {},
  };
}

/** Read a month. Returns an empty month for a missing key without creating it. */
export function getMonth(store: BudgetStore, key: MonthKey): MonthEntry {
  return store.months[key] ?? { incomes: [], expenses: [] };
}

function listKey(kind: EntryKind): 'incomes' | 'expenses' {
  return kind === 'income' ? 'incomes' : 'expenses';
}

const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Make an entry's date consistent with the month it is filed under.
 *
 * The amount was already normalised here; the date was not, and recurring.ts
 * compares date strings directly to decide which entry is most recent -- so a
 * malformed date silently misorders a template, and a date from another month
 * ranks against the wrong one.
 *
 * A bad date is repaired rather than rejected: discarding an entry because its
 * date looked odd would lose real money over a formatting problem. The day of
 * month is deliberately NOT range-checked -- the day does not decide filing,
 * and rewriting it would silently move someone's entry.
 */
function coherentDate(date: string, key: MonthKey): string {
  const trimmed = typeof date === 'string' ? date : '';
  if (FULL_DATE.test(trimmed) && trimmed.slice(0, 7) === key) return trimmed;
  if (trimmed === key && isValidMonthKey(trimmed)) return trimmed;
  return `${key}-01`;
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
  const normalized: Entry = {
    ...entry,
    amount: Math.max(0, parseAmount(entry.amount)),
    date: coherentDate(entry.date, key),
  };
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

function dismissedFor(store: BudgetStore, key: MonthKey): string[] {
  return store.dismissed?.[key] ?? [];
}

export function isDismissed(store: BudgetStore, key: MonthKey, templateId: string): boolean {
  return dismissedFor(store, key).includes(templateId);
}

/** Record that a suggestion was declined for one month. Immutable. */
export function dismissSuggestion(
  store: BudgetStore,
  key: MonthKey,
  templateId: string,
): BudgetStore {
  if (isDismissed(store, key, templateId)) return store;
  return {
    ...store,
    dismissed: {
      ...(store.dismissed ?? {}),
      [key]: [...dismissedFor(store, key), templateId],
    },
  };
}

/** Undo a dismissal. Returns the same store when there was nothing to undo. */
export function restoreSuggestion(
  store: BudgetStore,
  key: MonthKey,
  templateId: string,
): BudgetStore {
  if (!isDismissed(store, key, templateId)) return store;
  const rest = dismissedFor(store, key).filter((id) => id !== templateId);
  return {
    ...store,
    // isDismissed above only returns true when store.dismissed already has an
    // entry for this key, so store.dismissed is guaranteed defined here.
    dismissed: { ...store.dismissed!, [key]: rest },
  };
}
