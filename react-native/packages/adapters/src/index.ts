import { BudgetDoc } from '@monthly-budget/shared';

export interface BudgetAdapter {
  openJSON(): Promise<BudgetDoc | null>;
  saveJSON(doc: BudgetDoc): Promise<void>;
  exportXLSX(doc: BudgetDoc): Promise<void>;
}

export function pickAdapter(): BudgetAdapter {
  // Placeholder selection logic; to be implemented in apps using Platform.OS
  throw new Error('pickAdapter not wired: provide platform adapter in app layer');
}
