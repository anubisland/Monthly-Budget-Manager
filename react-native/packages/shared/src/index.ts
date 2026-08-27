// Public surface of @monthly-budget/shared.
//
// The legacy block at the bottom exists because apps/desktop imports it and
// CI builds that app. Those signatures must not change.

import { parseAmount } from './money';

export type { Locale } from './money';
export { parseAmount, formatMoney } from './money';

export type { MonthKey } from './month';
export {
  isValidMonthKey,
  monthKey,
  currentMonthKey,
  prevKey,
  nextKey,
  isFutureKey,
  monthLabel,
  compareKeys,
} from './month';

export type {
  EntryKind,
  Entry,
  MonthEntry,
  RecurringTemplate,
  BudgetStore,
  Totals,
  CategoryAmount,
} from './model';

export type { Category } from './categories';
export {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoriesFor,
  isKnownCategory,
  OTHER_CATEGORY_ID,
} from './categories';

export { makeId } from './ids';

export {
  emptyStore,
  getMonth,
  upsertEntry,
  removeEntry,
  monthsWithData,
  isDismissed,
  dismissSuggestion,
  restoreSuggestion,
} from './store';

export { totalsForMonth, expensesByCategoryForMonth } from './totals';

export type { Delta, DeltaStatus, Metric, CategoryDelta, MonthComparison } from './compare';
export { makeDelta, compareMonths } from './compare';

export { nameSuggestions, amountSuggestions } from './history';

export { detectRecurring, suggestionsForMonth } from './recurring';

export type { MigrationResult } from './migrate';
export { needsMigration, migrateV0toV1 } from './migrate';

// ---------------------------------------------------------------------------
// Legacy API -- consumed by apps/desktop. Do not change these signatures.
// ---------------------------------------------------------------------------

export { totals, expensesByCategory } from './totals';

// apps/desktop imports Income and Expense and builds them WITHOUT an id.
// These must stay the loose shapes they are today -- do not alias to Entry.
export type Income = { name: string; amount: number; date?: string };
export type Expense = { name: string; category: string; amount: number; date?: string };
export type Meta = { year: number; month: number; saved_at?: string };
export type BudgetDoc = { meta: Meta; incomes: Income[]; expenses: Expense[] };

export function serialize(doc: BudgetDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function deserialize(text: string): BudgetDoc {
  const raw = JSON.parse(text);
  const meta: Meta = {
    year: Number(raw?.meta?.year) || new Date().getFullYear(),
    month: Number(raw?.meta?.month) || new Date().getMonth() + 1,
    saved_at: String(raw?.meta?.saved_at || ''),
  };
  const incomes = Array.isArray(raw?.incomes)
    ? raw.incomes.map((r: Record<string, unknown>) => ({
        name: String(r?.name || ''),
        amount: parseAmount(r?.amount),
        date: (r?.date as string) || undefined,
      }))
    : [];
  const expenses = Array.isArray(raw?.expenses)
    ? raw.expenses.map((r: Record<string, unknown>) => ({
        name: String(r?.name || ''),
        category: String(r?.category || 'Uncategorized'),
        amount: parseAmount(r?.amount),
        date: (r?.date as string) || undefined,
      }))
    : [];
  return { meta, incomes, expenses };
}
