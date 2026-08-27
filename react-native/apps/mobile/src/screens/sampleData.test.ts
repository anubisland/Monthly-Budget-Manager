import { isKnownCategory } from '@monthly-budget/shared';
import { SAMPLE_EXPENSES, SAMPLE_INCOMES, buildSampleExpenses, buildSampleIncomes } from './sampleData';

describe('sample data categories', () => {
  it('every sample income category is a real income taxonomy id', () => {
    for (const item of SAMPLE_INCOMES) {
      expect(isKnownCategory('income', item.category)).toBe(true);
    }
  });

  it('every sample expense category is a real expense taxonomy id', () => {
    for (const item of SAMPLE_EXPENSES) {
      expect(isKnownCategory('expense', item.category)).toBe(true);
    }
  });

  // Would fail before the fix: 'Rent', 'Food', 'Fuel', 'Internet' and
  // 'Entertainment' are not taxonomy ids (wrong case, or not present at all).
  it('rejects the old free-text sample categories', () => {
    const oldCategories = ['Rent', 'Food', 'Fuel', 'Internet', 'Entertainment'];
    for (const bad of oldCategories) {
      expect(isKnownCategory('expense', bad)).toBe(false);
    }
  });
});

describe('buildSampleIncomes / buildSampleExpenses', () => {
  it('builds entries dated within the given month', () => {
    const incomes = buildSampleIncomes('2026-08');
    expect(incomes.length).toBe(SAMPLE_INCOMES.length);
    for (const entry of incomes) {
      expect(entry.date.startsWith('2026-08')).toBe(true);
      expect(isKnownCategory('income', entry.category)).toBe(true);
    }
  });

  it('builds expense entries with unique ids', () => {
    const expenses = buildSampleExpenses('2026-08');
    expect(expenses.length).toBe(SAMPLE_EXPENSES.length);
    expect(new Set(expenses.map((e) => e.id)).size).toBe(expenses.length);
    for (const entry of expenses) {
      expect(isKnownCategory('expense', entry.category)).toBe(true);
    }
  });
});
