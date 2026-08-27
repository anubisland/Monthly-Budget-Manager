import {
  currentMonthKey,
  isFutureKey,
  nextKey,
  prevKey,
  removeEntry,
  upsertEntry,
  dismissSuggestion,
  type BudgetStore,
  type Entry,
  type EntryKind,
  type Locale,
  type MonthKey,
  emptyStore,
} from '@monthly-budget/shared';

export type Status = 'loading' | 'ready' | 'error';
export type Notice = 'migrated' | 'corrupt' | null;

export interface BudgetState {
  status: Status;
  store: BudgetStore;
  monthKey: MonthKey;
  today: Date;
  error: string | null;
  notice: Notice;
}

export type BudgetAction =
  | { type: 'loaded'; store: BudgetStore; notice: Notice }
  | { type: 'loadFailed'; error: string }
  | { type: 'goPrev' }
  | { type: 'goNext' }
  | { type: 'goCurrent' }
  | { type: 'goTo'; monthKey: MonthKey }
  | { type: 'upsert'; kind: EntryKind; entry: Entry }
  | { type: 'upsertToMonth'; monthKey: MonthKey; kind: EntryKind; entry: Entry }
  | { type: 'remove'; kind: EntryKind; id: string }
  | { type: 'acceptSuggestion'; kind: EntryKind; entry: Entry }
  | { type: 'dismissSuggestion'; templateId: string }
  | { type: 'saveFailed'; error: string }
  | { type: 'dismissError' }
  | { type: 'dismissNotice' }
  | { type: 'setLocale'; locale: Locale };

export function initialBudgetState(today: Date = new Date()): BudgetState {
  return {
    status: 'loading',
    store: emptyStore(),
    monthKey: currentMonthKey(today),
    today,
    error: null,
    notice: null,
  };
}

/**
 * P2, in one place: nothing may be written to storage until the first read has
 * completed. The old app saved from an effect that fired on mount with an empty
 * initial state, racing the load -- which is how stored data could be
 * overwritten with nothing.
 */
export function canPersist(state: BudgetState): boolean {
  return state.status === 'ready';
}

export function budgetReducer(state: BudgetState, action: BudgetAction): BudgetState {
  switch (action.type) {
    case 'loaded':
      return { ...state, status: 'ready', store: action.store, notice: action.notice };

    case 'loadFailed':
      return { ...state, status: 'error', error: action.error };

    case 'goPrev':
      return { ...state, monthKey: prevKey(state.monthKey) };

    case 'goNext': {
      const candidate = nextKey(state.monthKey);
      // A month that has not happened yet holds nothing and cannot be budgeted.
      return isFutureKey(candidate, state.today) ? state : { ...state, monthKey: candidate };
    }

    case 'goCurrent':
      return { ...state, monthKey: currentMonthKey(state.today) };

    case 'goTo':
      return isFutureKey(action.monthKey, state.today)
        ? state
        : { ...state, monthKey: action.monthKey };

    case 'upsert':
      // Guarded: an edit arriving before the load finishes would be built on an
      // empty store and would then be persisted over the real data.
      if (!canPersist(state)) return state;
      return {
        ...state,
        store: upsertEntry(state.store, state.monthKey, action.kind, action.entry),
      };

    case 'upsertToMonth':
      // Like 'upsert', but files the entry under an explicit month rather
      // than the displayed one -- for callers (import) that already know
      // which month an entry belongs to and must not have it silently
      // refiled under whatever month happens to be on screen.
      if (!canPersist(state)) return state;
      return {
        ...state,
        store: upsertEntry(state.store, action.monthKey, action.kind, action.entry),
      };

    case 'remove':
      if (!canPersist(state)) return state;
      return {
        ...state,
        store: removeEntry(state.store, state.monthKey, action.kind, action.id),
      };

    case 'acceptSuggestion':
      if (!canPersist(state)) return state;
      return {
        ...state,
        store: upsertEntry(state.store, state.monthKey, action.kind, action.entry),
      };

    case 'dismissSuggestion':
      // Against the DISPLAYED month, not today: declining rent while looking
      // at September must not silence it for August.
      if (!canPersist(state)) return state;
      return {
        ...state,
        store: dismissSuggestion(state.store, state.monthKey, action.templateId),
      };

    case 'saveFailed':
      // The store is deliberately left alone: the user's work stays on screen
      // so they can retry, rather than vanishing along with the error.
      return { ...state, error: action.error };

    case 'dismissError':
      return { ...state, error: null };

    case 'dismissNotice':
      return { ...state, notice: null };

    case 'setLocale':
      // Guarded like every other mutation: a locale set before the load
      // completes would be built on the empty initial store and then
      // persisted over real data.
      if (!canPersist(state)) return state;
      return { ...state, store: { ...state.store, locale: action.locale } };

    default:
      return state;
  }
}
