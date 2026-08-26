import { compareKeys, type MonthKey } from './month';
import type { BudgetStore, Entry, EntryKind } from './model';

interface Seen {
  count: number;
  lastMonth: MonthKey;
}

/** Walk every entry of one kind across all months, newest month last. */
function* walk(
  store: BudgetStore,
  kind: EntryKind,
): Generator<{ entry: Entry; month: MonthKey }> {
  const field = kind === 'income' ? 'incomes' : 'expenses';
  for (const month of Object.keys(store.months).sort(compareKeys)) {
    for (const entry of store.months[month][field]) {
      yield { entry, month };
    }
  }
}

/** Rank by frequency desc, then most recent month desc, then the given tie-break. */
function rank<T>(seen: Map<T, Seen>, tie: (a: T, b: T) => number): T[] {
  return [...seen.entries()]
    .sort(
      ([ka, a], [kb, b]) =>
        b.count - a.count ||
        compareKeys(b.lastMonth, a.lastMonth) ||
        tie(ka, kb),
    )
    .map(([k]) => k);
}

function bump<T>(seen: Map<T, Seen>, key: T, month: MonthKey): void {
  const prev = seen.get(key);
  if (!prev) {
    seen.set(key, { count: 1, lastMonth: month });
    return;
  }
  prev.count += 1;
  if (compareKeys(month, prev.lastMonth) > 0) prev.lastMonth = month;
}

/** Names previously used for this kind and category, best suggestion first. */
export function nameSuggestions(
  store: BudgetStore,
  kind: EntryKind,
  category: string,
  limit = 8,
): string[] {
  const seen = new Map<string, Seen>();
  for (const { entry, month } of walk(store, kind)) {
    if (entry.category !== category) continue;
    if (!entry.name) continue;
    bump(seen, entry.name, month);
  }
  return rank(seen, (a, b) => a.localeCompare(b)).slice(0, limit);
}

/** Amounts previously used for this exact item name, best suggestion first. */
export function amountSuggestions(
  store: BudgetStore,
  kind: EntryKind,
  name: string,
  limit = 4,
): number[] {
  const needle = name.trim().toLowerCase();
  const seen = new Map<number, Seen>();
  for (const { entry, month } of walk(store, kind)) {
    if (entry.name.trim().toLowerCase() !== needle) continue;
    bump(seen, entry.amount, month);
  }
  return rank(seen, (a, b) => a - b).slice(0, limit);
}
