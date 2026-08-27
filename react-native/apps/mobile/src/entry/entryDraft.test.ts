import {
  emptyDraft,
  draftReducer,
  stepOptions,
  canCommit,
  toEntry,
} from './entryDraft';
import { emptyStore, upsertEntry, OTHER_CATEGORY_ID, type Category } from '@monthly-budget/shared';

const seq = () => { let n = 0; return () => `id${++n}`; };

/** A store with history, so suggestions have something to draw on. */
function history() {
  let s = emptyStore();
  for (const m of ['2026-06', '2026-07']) {
    s = upsertEntry(s, m, 'expense', { id: `r${m}`, name: 'Rent', category: 'housing', amount: 1500, date: `${m}-01` });
    s = upsertEntry(s, m, 'income', { id: `s${m}`, name: 'Salary', category: 'salary', amount: 6000, date: `${m}-25` });
  }
  s = upsertEntry(s, '2026-07', 'expense', { id: 'f1', name: 'Groceries', category: 'food', amount: 400, date: '2026-07-03' });
  return s;
}

describe('the flow starts empty', () => {
  it('begins at the kind step', () => {
    expect(emptyDraft().step).toBe('kind');
  });

  it('cannot be committed yet', () => {
    expect(canCommit(emptyDraft())).toBe(false);
  });

  it('produces nothing when converted', () => {
    expect(toEntry(emptyDraft(), '2026-08')).toBeNull();
  });
});

describe('step order', () => {
  it('goes kind then category then name then amount then date', () => {
    let d = emptyDraft();
    d = draftReducer(d, { type: 'pickKind', kind: 'expense' });
    expect(d.step).toBe('category');
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    expect(d.step).toBe('name');
    d = draftReducer(d, { type: 'pickName', name: 'Rent' });
    expect(d.step).toBe('amount');
    d = draftReducer(d, { type: 'setAmount', text: '1500' });
    expect(d.step).toBe('amount');
    d = draftReducer(d, { type: 'confirmAmount' });
    expect(d.step).toBe('date');
  });

  it('can go back a step without losing what was chosen', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'income' });
    d = draftReducer(d, { type: 'pickCategory', category: 'salary' });
    d = draftReducer(d, { type: 'back' });
    expect(d.step).toBe('category');
    expect(d.kind).toBe('income');
  });

  it('stays put when going back from the first step', () => {
    const d = draftReducer(emptyDraft(), { type: 'back' });
    expect(d.step).toBe('kind');
  });

  it('clears the category when the kind changes, since the lists differ', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'back' });
    d = draftReducer(d, { type: 'pickKind', kind: 'income' });
    expect(d.category).toBe('');
  });

  it('keeps the category when re-picking the same kind', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'back' });
    d = draftReducer(d, { type: 'pickKind', kind: 'expense' });
    expect(d.category).toBe('housing');
  });

  it('keeps the name when re-picking the same category', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'pickName', name: 'Rent' });
    d = draftReducer(d, { type: 'back' }); // -> name
    d = draftReducer(d, { type: 'back' }); // -> category
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    expect(d.name).toBe('Rent');
  });
});

describe('the name step', () => {
  it('accepts a suggested name without any typing', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'pickName', name: 'Rent' });
    expect(d.name).toBe('Rent');
    expect(d.nameIsCustom).toBe(false);
  });

  it('reveals a text field only when "other" is chosen', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    expect(d.nameIsCustom).toBe(false);
    d = draftReducer(d, { type: 'chooseCustomName' });
    expect(d.nameIsCustom).toBe(true);
    expect(d.step).toBe('name'); // stays here until something is typed
  });

  it('takes a typed name once the field is revealed', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'chooseCustomName' });
    d = draftReducer(d, { type: 'setName', name: '  Boiler repair  ' });
    expect(d.name).toBe('Boiler repair'); // trimmed
    d = draftReducer(d, { type: 'confirmName' });
    expect(d.step).toBe('amount');
  });

  it('will not advance past an empty custom name', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'chooseCustomName' });
    d = draftReducer(d, { type: 'setName', name: '   ' });
    expect(draftReducer(d, { type: 'confirmName' }).step).toBe('name');
  });
});

describe('the amount step — the only typed field', () => {
  const atAmount = () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    return draftReducer(d, { type: 'pickName', name: 'Rent' });
  };

  it('accepts a suggested amount with one tap', () => {
    const d = draftReducer(atAmount(), { type: 'pickAmount', amount: 1500 });
    expect(d.amountText).toBe('1500');
    expect(d.step).toBe('date');
  });

  it('accepts a typed amount', () => {
    const d = draftReducer(atAmount(), { type: 'setAmount', text: '1234.56' });
    expect(d.amountText).toBe('1234.56');
  });

  it('will not advance on an empty, zero or unparseable amount', () => {
    for (const text of ['', '   ', '0', 'abc', '-50']) {
      const d = draftReducer(draftReducer(atAmount(), { type: 'setAmount', text }), { type: 'confirmAmount' });
      expect(d.step).toBe('amount');
    }
  });

  it('advances on a formatted amount, since parseAmount handles separators', () => {
    const d = draftReducer(draftReducer(atAmount(), { type: 'setAmount', text: '1,500.00' }), { type: 'confirmAmount' });
    expect(d.step).toBe('date');
  });
});

describe('the date step', () => {
  const atDate = () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'pickName', name: 'Rent' });
    return draftReducer(d, { type: 'pickAmount', amount: 1500 });
  };

  it('takes a day and becomes committable', () => {
    const d = draftReducer(atDate(), { type: 'pickDay', day: 14 });
    expect(d.day).toBe(14);
    expect(canCommit(d)).toBe(true);
  });

  it('is not committable before a day is chosen', () => {
    expect(canCommit(atDate())).toBe(false);
  });

  it('ignores a day outside 1..31', () => {
    for (const day of [0, 32, -1, 1.5]) {
      expect(draftReducer(atDate(), { type: 'pickDay', day }).day).toBeNull();
    }
  });
});

describe('stepOptions', () => {
  const s = history();

  it('offers nothing before a kind is chosen', () => {
    expect(stepOptions(emptyDraft(), s)).toEqual({ categories: [], names: [], amounts: [] });
  });

  it('offers the expense taxonomy for an expense', () => {
    const d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    const ids = stepOptions(d, s).categories.map((c: Category) => c.id);
    expect(ids).toContain('housing');
    expect(ids).not.toContain('salary');
    expect(ids[ids.length - 1]).toBe(OTHER_CATEGORY_ID);
  });

  it('offers the income taxonomy for an income', () => {
    const d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'income' });
    const ids = stepOptions(d, s).categories.map((c: Category) => c.id);
    expect(ids).toContain('salary');
    expect(ids).not.toContain('housing');
  });

  it('suggests names already used in the chosen category', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    expect(stepOptions(d, s).names).toEqual(['Rent']);
  });

  it('does not leak names from another category', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    expect(stepOptions(d, s).names).not.toContain('Groceries');
  });

  it('suggests amounts used for the chosen item', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'pickName', name: 'Rent' });
    expect(stepOptions(d, s).amounts).toEqual([1500]);
  });

  it('offers no names or amounts before a category is chosen', () => {
    const d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    expect(stepOptions(d, s).names).toEqual([]);
    expect(stepOptions(d, s).amounts).toEqual([]);
  });

  it('offers no suggestions at all from an empty store', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    expect(stepOptions(d, emptyStore()).names).toEqual([]);
  });
});

describe('toEntry', () => {
  const complete = () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'pickName', name: 'Rent' });
    d = draftReducer(d, { type: 'pickAmount', amount: 1500 });
    return draftReducer(d, { type: 'pickDay', day: 14 });
  };

  it('builds an entry in the month it was given', () => {
    const e = toEntry(complete(), '2026-08', seq());
    expect(e).not.toBeNull();
    expect(e!.date).toBe('2026-08-14');
    expect(e!.name).toBe('Rent');
    expect(e!.category).toBe('housing');
    expect(e!.amount).toBe(1500);
  });

  it('zero-pads a single-digit day', () => {
    let d = complete();
    d = draftReducer(d, { type: 'pickDay', day: 3 });
    expect(toEntry(d, '2026-08', seq())!.date).toBe('2026-08-03');
  });

  it('gives every entry a distinct id', () => {
    const next = seq();
    const a = toEntry(complete(), '2026-08', next);
    const b = toEntry(complete(), '2026-08', next);
    expect(a!.id).not.toBe(b!.id);
  });

  it('returns null when the draft is incomplete', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    expect(toEntry(d, '2026-08', seq())).toBeNull();
  });

  it('parses a typed amount with separators', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'pickName', name: 'Rent' });
    d = draftReducer(d, { type: 'setAmount', text: '1,234.56' });
    d = draftReducer(d, { type: 'confirmAmount' });
    d = draftReducer(d, { type: 'pickDay', day: 1 });
    expect(toEntry(d, '2026-08', seq())!.amount).toBe(1234.56);
  });

  it('reports the kind separately, since upsert needs it', () => {
    expect(complete().kind).toBe('expense');
  });
});

describe('reset', () => {
  it('returns to an empty draft', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    expect(draftReducer(d, { type: 'reset' })).toEqual(emptyDraft());
  });
});

describe('unknown actions', () => {
  it('return the draft unchanged rather than producing undefined', () => {
    const d = emptyDraft();
    expect(draftReducer(d, { type: 'not-real' } as never)).toBe(d);
  });
});

describe('a stale name surviving a category change via back', () => {
  it('does not carry a name that was never offered under the new category', () => {
    // Pick a category, pick a name under it, then back up twice to the
    // category step and pick a DIFFERENT category. The name from the old
    // category must not survive -- it was never suggested for this one.
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing' });
    d = draftReducer(d, { type: 'pickName', name: 'Rent' });
    d = draftReducer(d, { type: 'back' }); // -> name step, name still 'Rent'
    d = draftReducer(d, { type: 'back' }); // -> category step
    d = draftReducer(d, { type: 'pickCategory', category: 'food' });
    expect(d.name).toBe('');
    expect(d.nameIsCustom).toBe(false);
  });
});

// With nothing to suggest, the name step would render only an "other" chip --
// a dead end for the first entry ever made in a category. The caller holds the
// store and so knows whether suggestions exist; it says so here, which keeps
// the decision in the reducer where a test can reach it. It was briefly a
// render-time useEffect in the component instead, where nothing could test it.
describe('a category with nothing to suggest goes straight to typing', () => {
  const pick = (hasSuggestions?: boolean) => {
    const d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    return draftReducer(d, { type: 'pickCategory', category: 'housing', hasSuggestions });
  };

  it('reveals the text field when there is nothing to suggest', () => {
    const d = pick(false);
    expect(d.nameIsCustom).toBe(true);
    expect(d.step).toBe('name');
  });

  it('shows the suggestion chips when there is something to suggest', () => {
    expect(pick(true).nameIsCustom).toBe(false);
  });

  it('shows the chips when the caller says nothing either way', () => {
    // An omitted flag must not be read as "no suggestions" -- that would send
    // every entry straight to the keyboard, defeating the whole point.
    expect(pick(undefined).nameIsCustom).toBe(false);
  });

  it('does not disturb nameIsCustom when the same category is re-picked', () => {
    let d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing', hasSuggestions: true });
    d = draftReducer(d, { type: 'chooseCustomName' });
    d = draftReducer(d, { type: 'setName', name: 'Boiler' });
    d = draftReducer(d, { type: 'pickCategory', category: 'housing', hasSuggestions: true });
    expect(d.nameIsCustom).toBe(true);
    expect(d.name).toBe('Boiler');
  });
});
