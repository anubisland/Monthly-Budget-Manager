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
  recurring: RecurringTemplate[];
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
