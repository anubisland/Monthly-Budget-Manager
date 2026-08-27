/**
 * Every storage key the app uses, in one place.
 *
 * The old app wrote the same document under TWO keys from four competing
 * effects, so whichever resolved last won and the other silently lost. One
 * key is now the single source of truth; the rivals are listed only so they
 * can be read once during migration and then cleaned up.
 */
export const STORE_KEY = '@MonthlyBudget:store:v1';

/** The verbatim pre-migration payload. Written BEFORE the new store (P6). */
export const BACKUP_KEY = '@MonthlyBudget:backup:v0';

/** Unparseable data is moved here, never deleted (P5). */
export const CORRUPT_KEY = '@MonthlyBudget:corrupt';

/** Read during migration, then removed. Order matters: adapter key first. */
export const LEGACY_KEYS = [
  '@MonthlyBudget:current_budget',
  'budget_data',
] as const;
