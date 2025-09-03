"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAmount = parseAmount;
exports.totals = totals;
exports.expensesByCategory = expensesByCategory;
exports.serialize = serialize;
exports.deserialize = deserialize;
function parseAmount(v) {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s]/g, ''));
    if (!isFinite(n) || isNaN(n))
        return 0;
    return Math.round(n * 100) / 100;
}
function totals(incomes, expenses) {
    const income_total = incomes.reduce((s, r) => s + parseAmount(r.amount), 0);
    const expense_total = expenses.reduce((s, r) => s + parseAmount(r.amount), 0);
    const profit = income_total - expense_total;
    const profit_margin = income_total > 0 ? (profit / income_total) * 100 : 0;
    return { income_total, expense_total, profit, profit_margin };
}
function expensesByCategory(expenses) {
    const by = {};
    for (const r of expenses) {
        const k = (r.category || 'Uncategorized').trim() || 'Uncategorized';
        by[k] = (by[k] ?? 0) + parseAmount(r.amount);
    }
    const total = Object.values(by).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(by)
        .map(([category, amount]) => ({ category, amount, percent: (amount / total) * 100 }))
        .sort((a, b) => b.amount - a.amount);
}
function serialize(doc) {
    return JSON.stringify(doc, null, 2);
}
function deserialize(text) {
    const raw = JSON.parse(text);
    const meta = {
        year: Number(raw?.meta?.year) || new Date().getFullYear(),
        month: Number(raw?.meta?.month) || new Date().getMonth() + 1,
        saved_at: String(raw?.meta?.saved_at || ''),
    };
    const incomes = Array.isArray(raw?.incomes)
        ? raw.incomes.map((r) => ({ name: String(r?.name || ''), amount: parseAmount(r?.amount), date: r?.date || undefined }))
        : [];
    const expenses = Array.isArray(raw?.expenses)
        ? raw.expenses.map((r) => ({ name: String(r?.name || ''), category: String(r?.category || 'Uncategorized'), amount: parseAmount(r?.amount), date: r?.date || undefined }))
        : [];
    return { meta, incomes, expenses };
}
