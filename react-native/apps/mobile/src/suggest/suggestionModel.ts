import {
  isDismissed,
  makeId,
  suggestionsForMonth,
  type BudgetStore,
  type Entry,
  type EntryKind,
  type MonthKey,
} from '@monthly-budget/shared';

export interface Suggestion {
  id: string;
  kind: EntryKind;
  name: string;
  category: string;
  amount: number;
  day: number;
}

/**
 * The recurring items worth offering for a month.
 *
 * `suggestionsForMonth` already drops anything already entered. This drops what
 * the user declined for this month, which is the part that cannot be derived
 * from the data itself.
 */
export function openSuggestions(
  store: BudgetStore,
  monthKey: MonthKey,
  opts?: { limit?: number },
): Suggestion[] {
  const limit = opts?.limit ?? 6;
  return suggestionsForMonth(store, monthKey)
    .filter((s) => !isDismissed(store, monthKey, s.id))
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      category: s.category,
      amount: s.amount,
      // A template without a known day falls back to the first: an entry has
      // to land on some day, and the first is the least surprising guess.
      day: s.dayOfMonth ?? 1,
    }))
    .slice(0, limit);
}

/** Turn an accepted suggestion into an entry in the month it was offered for. */
export function suggestionToEntry(
  suggestion: Suggestion,
  monthKey: MonthKey,
  idFactory: () => string = makeId,
): Entry {
  return {
    id: idFactory(),
    name: suggestion.name,
    category: suggestion.category,
    amount: suggestion.amount,
    date: `${monthKey}-${String(suggestion.day).padStart(2, '0')}`,
  };
}
