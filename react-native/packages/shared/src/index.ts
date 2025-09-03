export type Income = { name: string; amount: number; date?: string };
export type Expense = { name: string; category: string; amount: number; date?: string };
export type Meta = { year: number; month: number; saved_at?: string };
export type BudgetDoc = { meta: Meta; incomes: Income[]; expenses: Expense[] };

export function parseAmount(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s]/g, ''));
  if (!isFinite(n) || isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function totals(incomes: Income[], expenses: Expense[]) {
  const income_total = incomes.reduce((s, r) => s + parseAmount(r.amount), 0);
  const expense_total = expenses.reduce((s, r) => s + parseAmount(r.amount), 0);
  const profit = income_total - expense_total;
  const profit_margin = income_total > 0 ? (profit / income_total) * 100 : 0;
  return { income_total, expense_total, profit, profit_margin };
}

export function expensesByCategory(expenses: Expense[]) {
  const by: Record<string, number> = {};
  for (const r of expenses) {
    const k = (r.category || 'Uncategorized').trim() || 'Uncategorized';
    by[k] = (by[k] ?? 0) + parseAmount(r.amount);
  }
  const total = Object.values(by).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(by)
    .map(([category, amount]) => ({ category, amount, percent: (amount / total) * 100 }))
    .sort((a, b) => b.amount - a.amount);
}

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
  const incomes: Income[] = Array.isArray(raw?.incomes)
    ? raw.incomes.map((r: any) => ({ name: String(r?.name || ''), amount: parseAmount(r?.amount), date: r?.date || undefined }))
    : [];
  const expenses: Expense[] = Array.isArray(raw?.expenses)
    ? raw.expenses.map((r: any) => ({ name: String(r?.name || ''), category: String(r?.category || 'Uncategorized'), amount: parseAmount(r?.amount), date: r?.date || undefined }))
    : [];
  return { meta, incomes, expenses };
}
