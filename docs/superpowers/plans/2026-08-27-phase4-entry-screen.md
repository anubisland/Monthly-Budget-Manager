# Phase 4 Implementation Plan — The Multiple-Choice Entry Screen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the typed forms with a five-step flow where only the amount is typed and everything else is chosen — and stop invalid dates reaching the store.

**Architecture:** The flow is a state machine in a pure reducer, exactly like the budget state. Which step you are on, which options that step offers, and whether the entry can be committed are all decisions in `.ts` modules that tests can reach; the `.tsx` files render the current step and forward taps.

**Tech Stack:** TypeScript 5.4 (strict), React 18.2, React Native 0.74.7, Jest 29 + ts-jest.

## Global Constraints

- **`@monthly-budget/shared` is DONE.** 198 tests, 100% on all four metrics. Import from it; report rather than edit. `nameSuggestions`, `amountSuggestions`, `categoriesFor`, `OTHER_CATEGORY_ID` and `makeId` all already exist and are tested — this phase consumes them, it does not reimplement them.
- **The recurring toggle is NOT in this flow.** The user decided recurring items are discovered by `detectRecurring`, which already works from two months of history, rather than flagged by hand. The flow is five steps. `store.recurring` stays unwritten; Phase 6 decides its fate.
- **Only the amount is typed.** Type, category, item name, and date are chosen. A free-text name field appears only behind an explicit "other" choice.
- **`entry.date` must be validated before it reaches the store.** This is a carried finding: `upsertEntry` normalises the amount but not the date, and `recurring.ts` compares raw date strings, so a malformed date silently misorders. Task 1 closes it.
- **`apps/desktop` must keep compiling.** `npx tsc --noEmit -p apps/desktop/tsconfig.json` exits 0.
- **`testEnvironment: node` cannot render React.** Every `.tsx` file is verified by typecheck only. Anything that needs a test lives in a `.ts` module. This shapes the whole task order.
- **RTL is per-component, never `I18nManager`.** Use `rowDirection`, `textAlign`, `writingDirection` from `src/components/direction.ts`.
- **Every visible string comes from the i18n tables.** `ar.ts` is typed against `en.ts`, so a missing Arabic key is a compile error. Category names come from the taxonomy, month names from `monthLabel` — neither goes in the tables.
- **No new runtime dependencies.** The repo carries 43 pre-existing transitive vulnerabilities.
- **No non-injectable clock.** Anything needing today takes it as a parameter.
- **Coverage gate 90/90/90/80** over `src/state/**/*.ts`, `src/i18n/**/*.ts`, `src/charts/**/*.ts`, `src/components/**/*.ts` — Task 2 adds `src/entry/**/*.ts`.
- **Target 300 lines per file.** `App.tsx` is 313 and should not grow.
- Commit after every task. Prefixes: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/shared/src/store.ts` | Modify: validate `entry.date` in `upsertEntry` |
| `apps/mobile/jest.config.js` | Modify: collect coverage from `src/entry/` |
| `apps/mobile/src/entry/entryDraft.ts` | Create: the flow state machine (pure) |
| `apps/mobile/src/entry/dayOptions.ts` | Create: the date shortcuts and day grid (pure) |
| `apps/mobile/src/entry/AddEntrySheet.tsx` | Create: the flow container |
| `apps/mobile/src/entry/steps/*.tsx` | Create: one component per step |
| `apps/mobile/src/entry/Chip.tsx` | Create: the shared tappable chip |
| `apps/mobile/src/i18n/en.ts`, `ar.ts` | Modify: the flow's strings |
| `apps/mobile/src/screens/IncomeScreen.tsx` | Modify: open the sheet instead of a typed form |
| `apps/mobile/src/screens/ExpenseScreen.tsx` | Modify: same, and drop its category picker |

---

## Task 1: Validate `entry.date` at the store boundary

**Files:**
- Modify: `react-native/packages/shared/src/store.ts`
- Modify: `react-native/packages/shared/src/store.test.ts`

**Interfaces:**
- Consumes: `isValidMonthKey`, `monthKey` from `./month`
- Produces: no new exports — `upsertEntry` gains validation

This is the one permitted change to the shared package, and it must be **additive in spirit**: `upsertEntry` keeps its signature and its existing behaviour for valid input.

Why it matters: `upsertEntry` normalises the amount (`Math.max(0, parseAmount(...))`) but accepts any string as `date`. `recurring.ts` then compares those strings directly to decide which entry is most recent, so `"not-a-date"` silently misorders a template. The entry screen about to be built is the first thing that constructs dates from user input, so the guard belongs here, now.

- [ ] **Step 1: Write the failing test**

Add to `react-native/packages/shared/src/store.test.ts`:

```ts
// upsertEntry normalises the amount but accepted any string as a date.
// recurring.ts compares those strings directly to pick the most recent entry,
// so a malformed date silently misorders a template -- and the month an entry
// is filed under would disagree with the date printed on it.
describe('date validation', () => {
  it('accepts a full YYYY-MM-DD date', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ date: '2026-08-14' }));
    expect(getMonth(s, '2026-08').expenses[0].date).toBe('2026-08-14');
  });

  // Month-only dates do NOT come from migration -- migrate.ts converts those
  // to YYYY-MM-01. They must be accepted because the model permits them and
  // recurring.test.ts relies on one to exercise its dayOfMonth: null case.
  it('accepts a month-only date, which the model permits', () => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ date: '2026-08' }));
    expect(getMonth(s, '2026-08').expenses[0].date).toBe('2026-08');
  });

  it.each([
    ['empty', ''],
    ['a word', 'not-a-date'],
    ['a slashed date', '2026/08/14'],
    ['month 13', '2026-13-01'],
    ['month 00', '2026-00-01'],
    ['a two-digit year', '26-08-14'],
    ['an ISO timestamp', '2026-08-14T00:00:00Z'],
    ['a trailing space', '2026-08-14 '],
  ])('repairs %s by falling back to the month it is filed under', (_label, date) => {
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ date }));
    // The entry is kept -- discarding a user's money because a date was odd
    // would be worse -- but the date is made consistent with its month.
    expect(getMonth(s, '2026-08').expenses).toHaveLength(1);
    expect(getMonth(s, '2026-08').expenses[0].date).toBe('2026-08-01');
  });

  it('repairs a date that disagrees with the month it is filed under', () => {
    // Filing a January date under August would make recurring.ts rank it
    // against the wrong month.
    const s = upsertEntry(emptyStore(), '2026-08', 'expense', entry({ date: '2026-01-05' }));
    expect(getMonth(s, '2026-08').expenses[0].date).toBe('2026-08-01');
  });

  it('leaves a day that is out of range for the month alone', () => {
    // 2026-02-30 does not exist, but the day is not what files an entry --
    // validating calendar days is the caller's job, and rewriting it here
    // would silently move someone's entry.
    const s = upsertEntry(emptyStore(), '2026-02', 'expense', entry({ date: '2026-02-30' }));
    expect(getMonth(s, '2026-02').expenses[0].date).toBe('2026-02-30');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared -- store
```

Expected: the repair cases FAIL, showing the malformed date passed straight through.

- [ ] **Step 3: Implement the guard**

In `store.ts`, add above `upsertEntry`:

```ts
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Make an entry's date consistent with the month it is filed under.
 *
 * The amount was already normalised here; the date was not, and recurring.ts
 * compares date strings directly to decide which entry is most recent -- so a
 * malformed date silently misorders a template, and a date from another month
 * ranks against the wrong one.
 *
 * A bad date is repaired rather than rejected: discarding an entry because its
 * date looked odd would lose real money over a formatting problem. The day of
 * month is deliberately NOT range-checked -- the day does not decide filing,
 * and rewriting it would silently move someone's entry.
 */
function coherentDate(date: string, key: MonthKey): string {
  const trimmed = typeof date === 'string' ? date : '';
  if (FULL_DATE.test(trimmed) && trimmed.slice(0, 7) === key) return trimmed;
  if (trimmed === key && isValidMonthKey(trimmed)) return trimmed;
  return `${key}-01`;
}
```

Then in `upsertEntry`, change the `normalized` line to:

```ts
  const normalized: Entry = {
    ...entry,
    amount: Math.max(0, parseAmount(entry.amount)),
    date: coherentDate(entry.date, key),
  };
```

Import `isValidMonthKey` alongside the existing `compareKeys` import from `./month`.

- [ ] **Step 4: Run the suite, confirm it passes**

```bash
npm test -w @monthly-budget/shared
```

Expected: all pass. Report the ACTUAL count — do not reconcile against any number in this plan.

- [ ] **Step 5: Confirm nothing downstream regressed**

```bash
npm run test:coverage -w @monthly-budget/shared
npm test -w @monthly-budget/mobile
npx tsc --noEmit -p apps/desktop/tsconfig.json
```

Expected: shared still 100% on all four metrics; the mobile suite unchanged; desktop exits 0.

**If any existing test now fails, stop and report it rather than adjusting the test.**

I checked the suite before writing this: no existing test passes a date whose
month disagrees with its key, so the repair path should not fire anywhere. One
test does pass a month-only date — `recurring.test.ts` uses `date: '2026-07'`
under key `'2026-07'` to exercise its `dayOfMonth: null` case — which is exactly
why `coherentDate` accepts that form. If that test breaks, the guard is
rejecting a shape the model permits.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/store.ts react-native/packages/shared/src/store.test.ts
git commit -m "fix(core): make an entry's date consistent with its month

upsertEntry normalised the amount but accepted any string as a date.
recurring.ts compares those strings directly to decide which entry is most
recent, so a malformed date silently misordered a template -- and a date
from another month ranked against the wrong one.

A bad date is repaired to the first of the month it is filed under, not
rejected: discarding an entry because its date looked odd would lose real
money over a formatting problem. Month-only dates, which migrated data
contains, still pass through untouched.

The day of month is deliberately not range-checked. The day does not decide
which month an entry belongs to, and rewriting it here would silently move
someone's entry.

Closes a finding carried since the core was built, ahead of the entry screen
that is the first thing to build dates from user input.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `entryDraft.ts` — the flow as a state machine

**Files:**
- Modify: `react-native/apps/mobile/jest.config.js`
- Create: `react-native/apps/mobile/src/entry/entryDraft.ts`
- Create: `react-native/apps/mobile/src/entry/entryDraft.test.ts`

**Interfaces:**
- Consumes: `categoriesFor`, `OTHER_CATEGORY_ID`, `nameSuggestions`, `amountSuggestions`, `parseAmount`, `makeId`, and the types from `@monthly-budget/shared`
- Produces:
  - `type EntryStep = 'kind' | 'category' | 'name' | 'amount' | 'date'`
  - `interface EntryDraft { step; kind; category; name; nameIsCustom; amountText; day }`
  - `emptyDraft(): EntryDraft`
  - `draftReducer(draft, action): EntryDraft`
  - `stepOptions(draft, store): { categories; names; amounts }`
  - `canCommit(draft): boolean`
  - `toEntry(draft, monthKey, idFactory?): Entry | null`

Everything about the flow that can be wrong lives here: which step follows which, what each step offers, when the entry is complete, and what it turns into. The components in Task 4 render a step and forward taps.

- [ ] **Step 1: Widen coverage collection**

In `react-native/apps/mobile/jest.config.js`, add `'src/entry/**/*.ts',` to `collectCoverageFrom`, before the `'!src/**/*.test.ts'` line.

- [ ] **Step 2: Write the failing test**

Create `react-native/apps/mobile/src/entry/entryDraft.test.ts`:

```ts
import {
  emptyDraft,
  draftReducer,
  stepOptions,
  canCommit,
  toEntry,
} from './entryDraft';
import { emptyStore, upsertEntry, OTHER_CATEGORY_ID } from '@monthly-budget/shared';

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

  it('offers the expense taxonomy for an expense', () => {
    const d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'expense' });
    const ids = stepOptions(d, s).categories.map((c) => c.id);
    expect(ids).toContain('housing');
    expect(ids).not.toContain('salary');
    expect(ids[ids.length - 1]).toBe(OTHER_CATEGORY_ID);
  });

  it('offers the income taxonomy for an income', () => {
    const d = draftReducer(emptyDraft(), { type: 'pickKind', kind: 'income' });
    const ids = stepOptions(d, s).categories.map((c) => c.id);
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
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
npm test -w @monthly-budget/mobile -- entryDraft
```

Expected: FAIL with `Cannot find module './entryDraft'`.

- [ ] **Step 4: Write the implementation**

Create `react-native/apps/mobile/src/entry/entryDraft.ts`:

```ts
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
      return { ...draft, category: action.category, step: 'name' };

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
  const amount = amountValue(draft.amountText);
  if (amount === null) return null;
  return {
    id: idFactory(),
    name: draft.name,
    category: draft.category,
    amount,
    date: `${monthKey}-${String(draft.day).padStart(2, '0')}`,
  };
}
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
npm test -w @monthly-budget/mobile -- entryDraft
```

Expected: all pass. Report the ACTUAL count.

- [ ] **Step 6: Check coverage**

```bash
npm run test:coverage -w @monthly-budget/mobile
```

Report `entryDraft.ts`'s row and name any uncovered line. Aim for 100% — this is a pure state machine, so an uncovered branch means an unreachable or untested transition.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/jest.config.js react-native/apps/mobile/src/entry/
git commit -m "feat(mobile): model the entry flow as a testable state machine

The screen cannot be tested -- testEnvironment: node does not render React --
so every decision the flow makes lives here instead: which step follows which,
what each step can offer, when the entry is complete, and what it becomes.

Five steps, not six. The recurring toggle the spec sketched is gone: recurring
items are discovered from two months of history by detectRecurring, which is
already built and tested, so a manual flag would have duplicated it and added a
step to every single entry.

Only the amount is typed. Names come from what was used before in the same
category, and a text field appears only behind an explicit 'other' choice.

An out-of-range day is ignored rather than clamped -- silently moving an entry
to a date nobody picked is worse than making them tap again.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `dayOptions.ts` — the date shortcuts

**Files:**
- Create: `react-native/apps/mobile/src/entry/dayOptions.ts`
- Create: `react-native/apps/mobile/src/entry/dayOptions.test.ts`

**Interfaces:**
- Consumes: `currentMonthKey`, `type MonthKey` from `@monthly-budget/shared`
- Produces:
  - `daysInMonth(monthKey): number`
  - `dayShortcuts(monthKey, today?): { key: ShortcutKey; day: number }[]`
  - `type ShortcutKey = 'today' | 'yesterday' | 'firstOfMonth' | 'lastOfMonth'`

The point of this module is that "today" only makes sense while you are looking at the current month. Someone filling in last March should be offered the first and last of March, not a today that is not in it.

- [ ] **Step 1: Write the failing test**

Create `react-native/apps/mobile/src/entry/dayOptions.test.ts`:

```ts
import { daysInMonth, dayShortcuts } from './dayOptions';

const AUG_26 = new Date(2026, 7, 26);
const AUG_1 = new Date(2026, 7, 1);

describe('daysInMonth', () => {
  it('knows the length of a 31-day month', () => {
    expect(daysInMonth('2026-08')).toBe(31);
  });

  it('knows the length of a 30-day month', () => {
    expect(daysInMonth('2026-04')).toBe(30);
  });

  it('knows February in a common year', () => {
    expect(daysInMonth('2026-02')).toBe(28);
  });

  it('knows February in a leap year', () => {
    expect(daysInMonth('2024-02')).toBe(29);
  });

  it('knows February in a century year that is not a leap year', () => {
    expect(daysInMonth('1900-02')).toBe(28);
  });

  it('knows February in a century year that is a leap year', () => {
    expect(daysInMonth('2000-02')).toBe(29);
  });

  it('falls back to 31 for a malformed key rather than throwing', () => {
    // 31 never excludes a real day, so the grid stays usable.
    expect(daysInMonth('nonsense')).toBe(31);
  });
});

describe('dayShortcuts in the current month', () => {
  it('offers today', () => {
    const keys = dayShortcuts('2026-08', AUG_26).map((s) => s.key);
    expect(keys).toContain('today');
  });

  it('points today at the real day', () => {
    const today = dayShortcuts('2026-08', AUG_26).find((s) => s.key === 'today');
    expect(today!.day).toBe(26);
  });

  it('offers yesterday', () => {
    const y = dayShortcuts('2026-08', AUG_26).find((s) => s.key === 'yesterday');
    expect(y!.day).toBe(25);
  });

  it('omits yesterday on the first of the month, since it is in another month', () => {
    const keys = dayShortcuts('2026-08', AUG_1).map((s) => s.key);
    expect(keys).not.toContain('yesterday');
    expect(keys).toContain('today');
  });

  it('offers the first and last of the month', () => {
    const s = dayShortcuts('2026-08', AUG_26);
    expect(s.find((x) => x.key === 'firstOfMonth')!.day).toBe(1);
    expect(s.find((x) => x.key === 'lastOfMonth')!.day).toBe(31);
  });

  it('never offers the same day twice', () => {
    for (const today of [AUG_1, new Date(2026, 7, 31), AUG_26]) {
      const days = dayShortcuts('2026-08', today).map((s) => s.day);
      expect(new Set(days).size).toBe(days.length);
    }
  });
});

describe('dayShortcuts in another month', () => {
  it('does not offer today, which is not in the month being filled in', () => {
    const keys = dayShortcuts('2026-03', AUG_26).map((s) => s.key);
    expect(keys).not.toContain('today');
    expect(keys).not.toContain('yesterday');
  });

  it('still offers the first and last of that month', () => {
    const s = dayShortcuts('2026-03', AUG_26);
    expect(s.find((x) => x.key === 'firstOfMonth')!.day).toBe(1);
    expect(s.find((x) => x.key === 'lastOfMonth')!.day).toBe(31);
  });

  it('gets the last day right for a short month', () => {
    expect(dayShortcuts('2026-02', AUG_26).find((x) => x.key === 'lastOfMonth')!.day).toBe(28);
  });

  it('never offers a day beyond the length of the month', () => {
    for (const key of ['2026-02', '2026-04', '2024-02']) {
      const max = daysInMonth(key);
      for (const s of dayShortcuts(key, AUG_26)) {
        expect(s.day).toBeLessThanOrEqual(max);
        expect(s.day).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npm test -w @monthly-budget/mobile -- dayOptions
```

Expected: FAIL with `Cannot find module './dayOptions'`.

- [ ] **Step 3: Write the implementation**

Create `react-native/apps/mobile/src/entry/dayOptions.ts`:

```ts
import { currentMonthKey, type MonthKey } from '@monthly-budget/shared';

export type ShortcutKey = 'today' | 'yesterday' | 'firstOfMonth' | 'lastOfMonth';

export interface DayShortcut {
  key: ShortcutKey;
  day: number;
}

/**
 * How many days the month holds.
 *
 * Day 0 of the next month is the last day of this one, which handles leap years
 * without a rule about centuries. A malformed key falls back to 31: too many
 * days leaves an unreachable cell, too few would hide a real one.
 */
export function daysInMonth(monthKey: MonthKey): number {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return 31;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return 31;
  return new Date(Number(m[1]), month, 0).getDate();
}

/**
 * The date shortcuts worth offering for a given month.
 *
 * "Today" is only offered while the current month is on screen -- someone
 * filling in last March should not be handed a day that is not in March.
 * Duplicates are dropped, so the first of the month does not appear twice when
 * today happens to be the first.
 */
export function dayShortcuts(monthKey: MonthKey, today: Date = new Date()): DayShortcut[] {
  const last = daysInMonth(monthKey);
  const out: DayShortcut[] = [];
  const seen = new Set<number>();

  const add = (key: ShortcutKey, day: number) => {
    if (day < 1 || day > last || seen.has(day)) return;
    seen.add(day);
    out.push({ key, day });
  };

  if (monthKey === currentMonthKey(today)) {
    add('today', today.getDate());
    // Yesterday belongs to the previous month on the 1st, so it is not offered.
    add('yesterday', today.getDate() - 1);
  }
  add('firstOfMonth', 1);
  add('lastOfMonth', last);

  return out;
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npm test -w @monthly-budget/mobile -- dayOptions
```

Expected: all pass. Report the ACTUAL count.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/entry/dayOptions.ts react-native/apps/mobile/src/entry/dayOptions.test.ts
git commit -m "feat(mobile): offer date shortcuts that fit the month on screen

Today is only offered while the current month is displayed. Someone filling
in last March should not be handed a day that is not in March -- and the old
form defaulted every entry to the 1st, which is how a month of entries ends
up all sharing one date.

Yesterday is dropped on the 1st, since it belongs to the previous month.
Duplicates are dropped too, so the first of the month does not appear twice
when today happens to be the first.

Month length comes from day 0 of the following month, which gets leap years
right without a rule about centuries -- 1900 and 2000 are both covered.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The sheet and its step components

**Files:**
- Create: `react-native/apps/mobile/src/entry/Chip.tsx`
- Create: `react-native/apps/mobile/src/entry/AddEntrySheet.tsx`
- Create: `react-native/apps/mobile/src/entry/steps/KindStep.tsx`, `CategoryStep.tsx`, `NameStep.tsx`, `AmountStep.tsx`, `DateStep.tsx`
- Modify: `react-native/apps/mobile/src/i18n/en.ts`, `ar.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–3, `useBudget()`, `t`, the direction helpers, `formatMoney`, `categoriesFor`
- Produces: `<AddEntrySheet visible onClose />`, `<Chip>`

Thin components. Each step renders what `stepOptions` offers and dispatches an action. No step decides what comes next — that is the reducer's job.

- [ ] **Step 1: Add the strings**

Add to `en.ts` under an `entry.*` prefix, then the Arabic to `ar.ts`. You need at least: a title per step, the "other" chip label, a custom-name field placeholder, an amount placeholder, labels for the four day shortcuts, a "choose a day" heading, back, cancel, and save.

Category display names also need keys — one per taxonomy id, for both kinds. The taxonomy has 13 expense and 7 income categories, with `other` shared. Name them `category.housing`, `category.food`, and so on.

`ar.ts` is typed against `en.ts`, so add English first and let the compiler list what Arabic is missing.

- [ ] **Step 2: Write `Chip.tsx`**

A tappable pill: props `label`, `icon?`, `selected?`, `onPress`, `accessibilityLabel?`. Selected state must be visible without relying on colour alone — add a border weight change, not just a fill.

- [ ] **Step 3: Write the five step components**

Each takes the draft, the options, the locale, and a `dispatch`. Guidance:

- **KindStep** — two large buttons, income and expense. Nothing else.
- **CategoryStep** — a wrapped grid of `<Chip>`, one per `options.categories`, each showing the taxonomy icon and the translated name.
- **NameStep** — a chip per `options.names`, plus an "other" chip dispatching `chooseCustomName`. Render the `TextInput` only when `draft.nameIsCustom`. When there are no suggestions, go straight to the text field so the user is not shown an empty step.
- **AmountStep** — a `TextInput` with `keyboardType="decimal-pad"`, plus a chip per `options.amounts` formatted with `formatMoney`. This is the one typed field.
- **DateStep** — a chip per `dayShortcuts`, then a grid of `daysInMonth` day numbers. Highlight `draft.day`.

- [ ] **Step 4: Write `AddEntrySheet.tsx`**

A `Modal` holding: a header with the step title and a back control, the current step, and a footer with cancel and — when `canCommit(draft)` — save.

Save calls `upsert(draft.kind, toEntry(draft, monthKey)!)`, then `reset`, then `onClose`. Read `monthKey` from `useBudget()`, never today, so an entry lands in the month being viewed.

Apply `rowDirection(locale)` to chip rows and `writingDirection(locale)` to text.

- [ ] **Step 5: Verify**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm run typecheck -w @monthly-budget/mobile
npm test -w @monthly-budget/mobile
npx tsc --noEmit -p apps/desktop/tsconfig.json
wc -l apps/mobile/src/entry/*.tsx apps/mobile/src/entry/steps/*.tsx
grep -rn "I18nManager" apps/mobile/src/entry/ || echo "clean"
```

Expected: typechecks exit 0; the suite unchanged; no component over 150 lines.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/entry/ react-native/apps/mobile/src/i18n/
git commit -m "feat(mobile): build the entry sheet on top of the flow machine

Five thin components, one per step. Each renders what stepOptions offers and
dispatches an action; none decides what comes next, because that is the
reducer's job and the reducer is the part under test.

Category names are translated by taxonomy id, so the stored data keeps the
stable slug and only the display changes with the language.

The date comes from the month on screen rather than today, which is what lets
someone go back and fill in a past month.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Replace the typed forms

**Files:**
- Modify: `react-native/apps/mobile/src/screens/IncomeScreen.tsx`
- Modify: `react-native/apps/mobile/src/screens/ExpenseScreen.tsx`

**Interfaces:**
- Consumes: `<AddEntrySheet>`

- [ ] **Step 1: Record what is being replaced**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
wc -l apps/mobile/src/screens/IncomeScreen.tsx apps/mobile/src/screens/ExpenseScreen.tsx
grep -n "newIncome\|newExpense\|showCategoryPicker" apps/mobile/src/screens/*.tsx | wc -l
```

- [ ] **Step 2: Replace the income form**

Delete the add-income form, its `newIncome` state and its `addIncome` handler. Put an "add income" button in their place that opens `<AddEntrySheet>`. Keep the income list exactly as it is.

- [ ] **Step 3: Replace the expense form**

The same for expenses — and delete the category picker modal and its `showCategoryPicker` state, since the sheet's category step replaces it. Leave nothing orphaned: no unused import, no style key referenced from nowhere, no handler with no caller.

- [ ] **Step 4: Verify**

```bash
npm run typecheck -w @monthly-budget/mobile
npm test -w @monthly-budget/mobile
npm test -w @monthly-budget/shared
npx tsc --noEmit -p apps/desktop/tsconfig.json
wc -l apps/mobile/src/screens/*.tsx apps/mobile/src/App.tsx
grep -rn "newIncome\|newExpense\|showCategoryPicker" apps/mobile/src/ || echo "old form state fully gone"
grep -rn "keyboardType" apps/mobile/src/ | grep -v "entry/"
```

The last grep should return nothing: after this task the **only** keyboard in the app is the amount field inside the sheet. Report anything it finds.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/screens/
git commit -m "feat(mobile): replace the typed forms with the entry sheet

The old forms asked for a name, a category, an amount and a day, all typed,
with a category picker modal bolted alongside. Adding rent meant four
keyboard fields; now it is four taps and one number.

The expense screen's category picker goes with them -- the sheet's category
step does the same job inside the flow instead of beside it.

The amount field in the sheet is now the only keyboard in the app.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of Done for Phase 4

- [ ] Adding an entry takes four taps and one typed number
- [ ] The only keyboard in the app is the amount field, plus the custom-name field behind "other"
- [ ] Names are suggested from the same category in past months; amounts from the same item
- [ ] Date shortcuts fit the month on screen — no "today" while viewing another month
- [ ] An entry lands in the month being viewed, not today's
- [ ] `upsertEntry` repairs an incoherent date rather than storing it
- [ ] Every string comes from the i18n tables; a missing Arabic key fails the build
- [ ] `entryDraft.ts` and `dayOptions.ts` meet the coverage gate
- [ ] Both suites pass; `apps/desktop` still typechecks
- [ ] No component over 150 lines; `App.tsx` no larger than it was

## What is NOT in this plan

- **Phase 5** — the comparison tab and grouped bar chart. Carried finding: a sign-crossing net delta gives a real but counter-intuitive percent, so that view must render `absolute` and the `favorable` flag when `previous` is negative, never the raw percent.
- **Phase 6** — recurring items. `store.recurring` is still unwritten; that phase decides whether it earns its place or is removed in favour of `detectRecurring` alone.
- Editing an existing entry through the sheet. Today's behaviour is delete and re-add; changing that is its own piece of work.
- Rendering tests for any `.tsx` file, which need a device harness rather than `testEnvironment: node`.
