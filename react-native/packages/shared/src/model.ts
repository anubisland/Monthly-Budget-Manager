import type { MonthKey } from './month';

export type EntryKind = 'income' | 'expense';

/**
 * A single budget line. `date` and `id` are both required -- an entry without
 * a date cannot be assigned to a month (audit finding F1), and index-based
 * edit/delete breaks under filtering or reordering.
 */
export interface Entry {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
}

export interface MonthEntry {
  incomes: Entry[];
  expenses: Entry[];
}

export interface RecurringTemplate {
  id: string;
  kind: EntryKind;
  name: string;
  category: string;
  lastAmount: number;
  dayOfMonth: number | null;
}

export interface BudgetStore {
  version: 1;
  currency: string;
  locale: 'ar' | 'en';
  months: Record<MonthKey, MonthEntry>;
  /**
   * Unused. Recurring items are derived by detectRecurring from history, so
   * nothing writes this. It is kept only because `recurring: []` appears in
   * around 25 test fixtures and two validators, and churning finished packages
   * to delete a harmless field is the worse trade. It has not earned its place.
   */
  recurring: RecurringTemplate[];
  /**
   * Template ids the user declined, per month.
   *
   * The only thing about a recurring item that cannot be derived. That an item
   * is absent from a month is not evidence it was declined -- it is exactly the
   * condition for suggesting it -- so the decision has to be recorded.
   *
   * Optional because every store saved before this existed has no such field,
   * and absent must behave as empty rather than as corrupt.
   */
  dismissed?: Record<MonthKey, string[]>;
}

export interface Totals {
  income: number;
  expenses: number;
  net: number;
  margin: number; // percent, 0 when income is 0
}

export interface CategoryAmount {
  category: string;
  amount: number;
  percent: number;
}
