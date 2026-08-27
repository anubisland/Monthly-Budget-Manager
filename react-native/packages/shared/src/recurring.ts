import { compareKeys, type MonthKey } from './month';
import type { BudgetStore, Entry, EntryKind, RecurringTemplate } from './model';

interface Track {
  kind: EntryKind;
  name: string;
  category: string;
  months: Set<MonthKey>;
  lastDate: string;
  lastAmount: number;
  lastDay: number | null;
}

/** Stable, human-readable template id. Same inputs always give the same id. */
function templateId(kind: EntryKind, category: string, name: string): string {
  return `${kind}:${category}:${name.trim().toLowerCase()}`;
}

function dayOf(entry: Entry): number | null {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(entry.date);
  return m ? Number(m[1]) : null;
}

function collect(store: BudgetStore): Map<string, Track> {
  const tracks = new Map<string, Track>();
  const kinds: Array<{ kind: EntryKind; field: 'incomes' | 'expenses' }> = [
    { kind: 'income', field: 'incomes' },
    { kind: 'expense', field: 'expenses' },
  ];

  // The ascending sort is no longer required for correctness -- lastDate is a
  // max over full date strings, which is order-independent. It is kept because
  // upsertEntry does not verify that an entry's date agrees with the month key
  // it is filed under, and in that inconsistent case iteration order decides
  // which entry wins. Sorting keeps that outcome deterministic.
  for (const month of Object.keys(store.months).sort(compareKeys)) {
    for (const { kind, field } of kinds) {
      for (const entry of store.months[month][field]) {
        if (!entry.name) continue;
        const id = templateId(kind, entry.category, entry.name);
        const prev = tracks.get(id);
        if (!prev) {
          tracks.set(id, {
            kind,
            name: entry.name,
            category: entry.category,
            months: new Set([month]),
            lastDate: entry.date,
            lastAmount: entry.amount,
            lastDay: dayOf(entry),
          });
          continue;
        }
        prev.months.add(month);
        // Compare FULL DATES, not month keys. Entries within a month are stored
        // in insertion order, not date order, so a month-level comparison would
        // let the last-INSERTED entry win over the chronologically latest one --
        // making the template report a stale amount. Date strings are YYYY-MM-DD
        // (or month-only YYYY-MM), both of which sort lexicographically in
        // chronological order.
        if (entry.date >= prev.lastDate) {
          prev.lastDate = entry.date;
          prev.lastAmount = entry.amount;
          prev.lastDay = dayOf(entry);
        }
      }
    }
  }
  return tracks;
}

/** Items that appeared in at least `minMonths` distinct months. */
export function detectRecurring(store: BudgetStore, minMonths = 2): RecurringTemplate[] {
  return [...collect(store).entries()]
    .filter(([, t]) => t.months.size >= minMonths)
    .map(([id, t]) => ({
      id,
      kind: t.kind,
      name: t.name,
      category: t.category,
      lastAmount: t.lastAmount,
      dayOfMonth: t.lastDay,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Recurring items that are not yet entered in the target month. */
export function suggestionsForMonth(
  store: BudgetStore,
  key: MonthKey,
): Array<{
  id: string;
  kind: EntryKind;
  name: string;
  category: string;
  amount: number;
  dayOfMonth: number | null;
}> {
  const target = store.months[key];
  const present = new Set<string>();
  if (target) {
    for (const entry of target.incomes) {
      present.add(templateId('income', entry.category, entry.name));
    }
    for (const entry of target.expenses) {
      present.add(templateId('expense', entry.category, entry.name));
    }
  }

  return detectRecurring(store)
    .filter((t) => !present.has(t.id))
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      category: t.category,
      amount: t.lastAmount,
      dayOfMonth: t.dayOfMonth,
    }));
}
