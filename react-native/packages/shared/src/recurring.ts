import { compareKeys, type MonthKey } from './month';
import type { BudgetStore, Entry, EntryKind, RecurringTemplate } from './model';

interface Track {
  kind: EntryKind;
  name: string;
  category: string;
  months: Set<MonthKey>;
  lastMonth: MonthKey;
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
            lastMonth: month,
            lastAmount: entry.amount,
            lastDay: dayOf(entry),
          });
          continue;
        }
        prev.months.add(month);
        // Months are walked in ascending order, so a later month always wins.
        if (compareKeys(month, prev.lastMonth) >= 0) {
          prev.lastMonth = month;
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
      kind: t.kind,
      name: t.name,
      category: t.category,
      amount: t.lastAmount,
      dayOfMonth: t.dayOfMonth,
    }));
}
