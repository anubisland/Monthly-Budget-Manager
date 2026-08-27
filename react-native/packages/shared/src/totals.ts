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

/** Round to 2 decimals, the same money convention `parseAmount` uses. */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Totals for one month only. This is what makes the app actually monthly.
 *
 * `sum()` adds already-rounded row values without re-rounding, so the raw
 * total can carry IEEE-754 float drift that depends on entry order -- the
 * same set of amounts in a different order can produce a different float
 * (e.g. 6168.3099999999995 vs 6168.31). Rounding here, rather than in
 * `sum()` or the legacy `totals()` export, keeps that drift out of the
 * money fields callers compare (notably `compareMonths`) without touching
 * `totals()`, which apps/desktop depends on byte-for-byte.
 */
export function totalsForMonth(store: BudgetStore, key: MonthKey): Totals {
  const m = getMonth(store, key);
  const income = round2(sum(m.incomes));
  const expenses = round2(sum(m.expenses));
  const net = round2(income - expenses);
  // margin is deliberately NOT rounded here. It's derived purely from
  // `net` and `income`, which are already canonical rounded values -- so
  // dividing them is deterministic and order-independent on its own; no
  // extra float drift can enter at this step. Rounding it to 2dp would
  // throw away real precision that an existing consumer (the margin-delta
  // test in compare.test.ts) depends on, for a case that doesn't need it.
  const margin = income > 0 ? (net / income) * 100 : 0;
  return { income, expenses, net, margin };
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
