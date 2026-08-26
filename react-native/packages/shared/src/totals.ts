import type { MonthKey } from './month';
import { parseAmount } from './money';
import { getMonth } from './store';
import type { BudgetStore, CategoryAmount, Totals } from './model';

/**
 * The minimum shape the aggregation helpers need.
 *
 * Deliberately structural rather than `Entry`: apps/desktop passes objects
 * with no `id`, and the legacy exports below must keep accepting those.
 */
export interface AmountRow {
  amount: number;
  category?: string;
}

function sum(entries: AmountRow[]): number {
  return entries.reduce((acc, r) => acc + parseAmount(r.amount), 0);
}

function bucket(entries: AmountRow[], fallback: string): CategoryAmount[] {
  const by: Record<string, number> = {};
  for (const r of entries) {
    const k = (r.category || fallback).trim() || fallback;
    by[k] = (by[k] ?? 0) + parseAmount(r.amount);
  }
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return Object.entries(by)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

/** Totals for one month only. This is what makes the app actually monthly. */
export function totalsForMonth(store: BudgetStore, key: MonthKey): Totals {
  const m = getMonth(store, key);
  const income = sum(m.incomes);
  const expenses = sum(m.expenses);
  const net = income - expenses;
  return { income, expenses, net, margin: income > 0 ? (net / income) * 100 : 0 };
}

/** Expense breakdown for one month only, sorted by amount descending. */
export function expensesByCategoryForMonth(
  store: BudgetStore,
  key: MonthKey,
): CategoryAmount[] {
  return bucket(getMonth(store, key).expenses, 'other');
}

// ---------------------------------------------------------------------------
// Legacy API. apps/desktop imports these and CI builds it, so the signatures
// and behavior must not change. Do not "improve" them.
// ---------------------------------------------------------------------------

export function totals(incomes: AmountRow[], expenses: AmountRow[]) {
  const income_total = sum(incomes);
  const expense_total = sum(expenses);
  const profit = income_total - expense_total;
  return {
    income_total,
    expense_total,
    profit,
    profit_margin: income_total > 0 ? (profit / income_total) * 100 : 0,
  };
}

export function expensesByCategory(expenses: AmountRow[]): CategoryAmount[] {
  return bucket(expenses, 'Uncategorized');
}
