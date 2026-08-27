/**
 * English is the key source of truth. Every key here must exist in ar.ts,
 * which is typed against this object -- a missing translation is a compile
 * error rather than a silent English fallback in the UI.
 */
export const en = {
  'app.title': 'Monthly Budget',

  'month.current': 'This month',
  'month.previous': 'Previous month',
  'month.next': 'Next month',
  'month.empty': 'Nothing recorded for this month yet',
  'month.entriesCount': '{count} entries',

  'totals.income': 'Income',
  'totals.expenses': 'Expenses',
  'totals.net': 'Net',
  'totals.margin': 'Margin',

  'kind.income': 'Income',
  'kind.expense': 'Expense',

  'status.loading': 'Loading your budget…',
  'status.saveFailed': 'Could not save. Your changes are still on screen — try again.',
  'status.loadCorrupt': 'Your saved data could not be read. It has been kept safe, not deleted.',
  'status.migrated': 'Your data has been organised into months.',

  'action.retry': 'Try again',
  'action.dismiss': 'Dismiss',
} as const;
