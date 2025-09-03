export type Income = {
    name: string;
    amount: number;
    date?: string;
};
export type Expense = {
    name: string;
    category: string;
    amount: number;
    date?: string;
};
export type Meta = {
    year: number;
    month: number;
    saved_at?: string;
};
export type BudgetDoc = {
    meta: Meta;
    incomes: Income[];
    expenses: Expense[];
};
export declare function parseAmount(v: any): number;
export declare function totals(incomes: Income[], expenses: Expense[]): {
    income_total: number;
    expense_total: number;
    profit: number;
    profit_margin: number;
};
export declare function expensesByCategory(expenses: Expense[]): {
    category: string;
    amount: number;
    percent: number;
}[];
export declare function serialize(doc: BudgetDoc): string;
export declare function deserialize(text: string): BudgetDoc;
