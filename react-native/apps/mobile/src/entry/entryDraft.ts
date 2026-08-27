import {
  amountSuggestions,
  categoriesFor,
  makeId,
  nameSuggestions,
  parseAmount,
  type BudgetStore,
  type Category,
  type Entry,
  type EntryKind,
  type MonthKey,
} from '@monthly-budget/shared';

export type EntryStep = 'kind' | 'category' | 'name' | 'amount' | 'date';

export interface EntryDraft {
  step: EntryStep;
  kind: EntryKind | null;
  category: string;
  name: string;
  /** True once "other" was chosen, which is the only thing that reveals a text field. */
  nameIsCustom: boolean;
  amountText: string;
  day: number | null;
}

export type DraftAction =
  | { type: 'pickKind'; kind: EntryKind }
  | { type: 'pickCategory'; category: string }
  | { type: 'pickName'; name: string }
  | { type: 'chooseCustomName' }
  | { type: 'setName'; name: string }
  | { type: 'confirmName' }
  | { type: 'pickAmount'; amount: number }
  | { type: 'setAmount'; text: string }
  | { type: 'confirmAmount' }
  | { type: 'pickDay'; day: number }
  | { type: 'back' }
  | { type: 'reset' };

const ORDER: EntryStep[] = ['kind', 'category', 'name', 'amount', 'date'];

export function emptyDraft(): EntryDraft {
  return {
    step: 'kind',
    kind: null,
    category: '',
    name: '',
    nameIsCustom: false,
    amountText: '',
    day: null,
  };
}

function stepBefore(step: EntryStep): EntryStep {
  const i = ORDER.indexOf(step);
  return i <= 0 ? ORDER[0] : ORDER[i - 1];
}

/** An amount is usable only if it parses to something above zero. */
function amountValue(text: string): number | null {
  const n = parseAmount(text.trim());
  return n > 0 ? n : null;
}

export function draftReducer(draft: EntryDraft, action: DraftAction): EntryDraft {
  switch (action.type) {
    case 'pickKind':
      // The two kinds have different category lists, so a category chosen
      // under one kind is meaningless under the other.
      return {
        ...draft,
        kind: action.kind,
        category: draft.kind === action.kind ? draft.category : '',
        step: 'category',
      };

    case 'pickCategory':
      // Names are suggested per category, so a name chosen under one
      // category is meaningless under another -- e.g. after going back and
      // picking a different category, a name picked for the old one must
      // not silently ride along into the new one.
      return {
        ...draft,
        category: action.category,
        name: draft.category === action.category ? draft.name : '',
        nameIsCustom: draft.category === action.category ? draft.nameIsCustom : false,
        step: 'name',
      };

    case 'pickName':
      return { ...draft, name: action.name, nameIsCustom: false, step: 'amount' };

    case 'chooseCustomName':
      return { ...draft, nameIsCustom: true, name: '', step: 'name' };

    case 'setName':
      return { ...draft, name: action.name.trim() };

    case 'confirmName':
      return draft.name ? { ...draft, step: 'amount' } : draft;

    case 'pickAmount':
      return { ...draft, amountText: String(action.amount), step: 'date' };

    case 'setAmount':
      return { ...draft, amountText: action.text };

    case 'confirmAmount':
      return amountValue(draft.amountText) === null ? draft : { ...draft, step: 'date' };

    case 'pickDay':
      // Out of range or fractional days are ignored rather than clamped: a
      // silently changed day would put the entry on a date nobody chose.
      return Number.isInteger(action.day) && action.day >= 1 && action.day <= 31
        ? { ...draft, day: action.day }
        : draft;

    case 'back':
      return { ...draft, step: stepBefore(draft.step) };

    case 'reset':
      return emptyDraft();

    default:
      return draft;
  }
}

export interface StepOptions {
  categories: readonly Category[];
  names: string[];
  amounts: number[];
}

/** What the current step can offer, drawn from the taxonomy and past months. */
export function stepOptions(draft: EntryDraft, store: BudgetStore): StepOptions {
  if (!draft.kind) return { categories: [], names: [], amounts: [] };
  return {
    categories: categoriesFor(draft.kind),
    names: draft.category ? nameSuggestions(store, draft.kind, draft.category) : [],
    amounts: draft.name ? amountSuggestions(store, draft.kind, draft.name) : [],
  };
}

export function canCommit(draft: EntryDraft): boolean {
  return Boolean(
    draft.kind &&
      draft.category &&
      draft.name &&
      amountValue(draft.amountText) !== null &&
      draft.day !== null,
  );
}

/**
 * Turn a complete draft into an entry in the given month.
 *
 * The date is composed from the DISPLAYED month rather than today, which is
 * what lets someone go back and fill in a past month.
 */
export function toEntry(
  draft: EntryDraft,
  monthKey: MonthKey,
  idFactory: () => string = makeId,
): Entry | null {
  if (!canCommit(draft)) return null;
  // canCommit already established that this parses to a positive number;
  // the assertion just carries that fact through to the type checker.
  const amount = amountValue(draft.amountText)!;
  return {
    id: idFactory(),
    name: draft.name,
    category: draft.category,
    amount,
    date: `${monthKey}-${String(draft.day).padStart(2, '0')}`,
  };
}
