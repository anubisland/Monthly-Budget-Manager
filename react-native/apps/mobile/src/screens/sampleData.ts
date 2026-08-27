import { Entry, makeId, type MonthKey } from '@monthly-budget/shared';
import { dateForDay } from './dateDisplay';

/**
 * Sample entries offered from the "add sample data" button.
 *
 * `category` must be a real taxonomy id (see @monthly-budget/shared's
 * EXPENSE_CATEGORIES / INCOME_CATEGORIES) -- sampleData.test.ts asserts this
 * for every row. An id outside the taxonomy cannot be translated by
 * categoryLabel, is invisible to nameSuggestions/amountSuggestions (which
 * filter on exact category id), and groups wrongly in detectRecurring
 * (which keys templates by `kind:category:name`).
 *
 * Pulled out of SummaryScreen.tsx (a .tsx file, unreachable under
 * testEnvironment: node) so the list itself can be covered by a test --
 * a hardcoded list nobody could test is how the wrong ids shipped.
 */
interface SampleItem {
  name: string;
  category: string;
  amount: number;
  /** Day of the displayed month this entry is dated on. */
  day: number;
}

export const SAMPLE_INCOMES: readonly SampleItem[] = [
  { name: 'Salary', category: 'salary', amount: 5000, day: 1 },
  { name: 'Freelance', category: 'freelance', amount: 1500, day: 15 },
];

export const SAMPLE_EXPENSES: readonly SampleItem[] = [
  { name: 'Rent', category: 'housing', amount: 1200, day: 1 },
  { name: 'Groceries', category: 'food', amount: 400, day: 3 },
  { name: 'Gas Bill', category: 'transport', amount: 80, day: 5 },
  { name: 'Internet', category: 'utilities', amount: 60, day: 10 },
  { name: 'Movies', category: 'entertainment', amount: 25, day: 12 },
];

function buildEntries(items: readonly SampleItem[], monthKey: MonthKey): Entry[] {
  return items.map((item) => ({
    id: makeId(),
    name: item.name,
    category: item.category,
    amount: item.amount,
    date: dateForDay(monthKey, item.day),
  }));
}

export function buildSampleIncomes(monthKey: MonthKey): Entry[] {
  return buildEntries(SAMPLE_INCOMES, monthKey);
}

export function buildSampleExpenses(monthKey: MonthKey): Entry[] {
  return buildEntries(SAMPLE_EXPENSES, monthKey);
}
