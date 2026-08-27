import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  expensesByCategoryForMonth,
  getMonth,
  totalsForMonth,
  type Entry,
  type EntryKind,
  type Locale,
  type MonthKey,
} from '@monthly-budget/shared';
import { asyncStorageKV, type KVStore } from './kv';
import { loadStore, saveStore } from './storage';
import {
  budgetReducer,
  canPersist,
  initialBudgetState,
  type BudgetState,
} from './budgetReducer';

interface BudgetContextValue extends BudgetState {
  month: ReturnType<typeof getMonth>;
  totals: ReturnType<typeof totalsForMonth>;
  byCategory: ReturnType<typeof expensesByCategoryForMonth>;
  goPrev(): void;
  goNext(): void;
  goCurrent(): void;
  goTo(monthKey: MonthKey): void;
  upsert(kind: EntryKind, entry: Entry): void;
  remove(kind: EntryKind, id: string): void;
  acceptSuggestion(kind: EntryKind, entry: Entry): void;
  dismissSuggestion(templateId: string): void;
  dismissError(): void;
  dismissNotice(): void;
  setLocale(locale: Locale): void;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function BudgetProvider({
  children,
  kv = asyncStorageKV,
  today,
}: {
  children: React.ReactNode;
  kv?: KVStore;
  today?: Date;
}) {
  const [state, dispatch] = useReducer(budgetReducer, undefined, () =>
    initialBudgetState(today ?? new Date()),
  );

  // Watermark for the autosave effect below; seeded by the load so the store
  // we just read is not written straight back. Declared here because the load
  // effect assigns it.
  const lastSaved = useRef<BudgetState['store'] | null>(null);

  // Load once on mount. Nothing may be written until this resolves (P2).
  useEffect(() => {
    let cancelled = false;
    loadStore(kv, { today })
      .then((r) => {
        if (cancelled) return;
        const notice = r.status === 'migrated' ? 'migrated' : r.status === 'corrupt' ? 'corrupt' : null;
        // Seed the autosave watermark with what we just read, so the next
        // effect does not immediately write the store straight back.
        lastSaved.current = r.store;
        dispatch({ type: 'loaded', store: r.store, notice });
        if (r.status === 'corrupt' && r.error) {
          dispatch({ type: 'saveFailed', error: r.error });
        }
      })
      .catch((e) => {
        if (!cancelled) dispatch({ type: 'loadFailed', error: String(e) });
      });
    return () => {
      cancelled = true;
    };
    // kv and today are injected once at mount; re-running would re-load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave on every change (P3), but never before the load completes (P2),
  // and not for the store we just loaded -- the load effect seeds this ref.
  useEffect(() => {
    if (!canPersist(state)) return;
    if (state.store === lastSaved.current) return;
    lastSaved.current = state.store;
    saveStore(kv, state.store).catch((e) =>
      dispatch({ type: 'saveFailed', error: String(e) }),
    );
  }, [state, kv]);

  const value = useMemo<BudgetContextValue>(
    () => ({
      ...state,
      month: getMonth(state.store, state.monthKey),
      totals: totalsForMonth(state.store, state.monthKey),
      byCategory: expensesByCategoryForMonth(state.store, state.monthKey),
      goPrev: () => dispatch({ type: 'goPrev' }),
      goNext: () => dispatch({ type: 'goNext' }),
      goCurrent: () => dispatch({ type: 'goCurrent' }),
      goTo: (monthKey) => dispatch({ type: 'goTo', monthKey }),
      upsert: (kind, entry) => dispatch({ type: 'upsert', kind, entry }),
      remove: (kind, id) => dispatch({ type: 'remove', kind, id }),
      acceptSuggestion: (kind, entry) => dispatch({ type: 'acceptSuggestion', kind, entry }),
      dismissSuggestion: (templateId) => dispatch({ type: 'dismissSuggestion', templateId }),
      dismissError: () => dispatch({ type: 'dismissError' }),
      dismissNotice: () => dispatch({ type: 'dismissNotice' }),
      setLocale: (locale) => dispatch({ type: 'setLocale', locale }),
    }),
    [state],
  );

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used inside a BudgetProvider');
  return ctx;
}
