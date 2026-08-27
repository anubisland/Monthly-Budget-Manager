# Phase 6 Implementation Plan — Recurring Items

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a month opens, offer the items that recur — rent, salary, subscriptions — each acceptable with one tap, and remember a "not this month" so the app does not nag.

**Architecture:** `detectRecurring` and `suggestionsForMonth` already derive the templates from history and are tested at 100%. This phase adds the one thing that cannot be derived — which suggestions the user declined — plus the model that filters on it and the strip that shows the rest.

**Tech Stack:** TypeScript 5.4 (strict), React 18.2, React Native 0.74.7, Jest 29 + ts-jest.

## Global Constraints

- **Dismissal is per month, by the user's decision.** Declining rent in September means it is offered again in October. Skipping one month must not lose the suggestion forever.
- **`store.recurring` is NOT removed.** It is written by nothing and earns no keep, but `recurring: []` appears in roughly 25 test fixtures across `migrate.test.ts` and `storage.test.ts` plus validation in two modules — churning finished packages for a dead field with no user benefit is the worse trade. `dismissed` is added alongside it, additively. Say this plainly in the code comment; do not pretend the field is useful.
- **Changes to `@monthly-budget/shared` must be additive.** It is at 211 tests and 100% coverage on all four metrics, and `apps/desktop` depends on it. A new optional field and a widened return shape are additive; changing an existing signature is not.
- **A store saved before this phase must keep loading.** `dismissed` is absent from every existing store on every existing device. Absent must behave exactly as empty — never as corrupt.
- **`apps/desktop` must keep compiling.** `npx tsc --noEmit -p apps/desktop/tsconfig.json` exits 0.
- **`testEnvironment: node` cannot render React.** Every `.tsx` file is verified by typecheck only.
- **RTL is per-component, never `I18nManager`.**
- **Every visible string comes from the i18n tables.** `ar.ts` is typed against `en.ts`.
- **No new runtime dependencies.**
- **No non-injectable clock.**
- **Coverage gate 90/90/90/80.** `StyleSheet` files are excluded — they hold no logic and only a `.tsx` can import them.
- **Target 300 lines per file**, far less for a component.
- Commit after every task.

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/shared/src/model.ts` | Modify: add `dismissed` to `BudgetStore` |
| `packages/shared/src/store.ts` | Modify: `emptyStore` initialises it; add dismissal helpers |
| `packages/shared/src/recurring.ts` | Modify: `suggestionsForMonth` returns the template `id` |
| `packages/shared/src/migrate.ts` | Modify: tolerate an absent `dismissed` |
| `apps/mobile/src/state/storage.ts` | Modify: same tolerance in `isUsable` |
| `apps/mobile/src/state/budgetReducer.ts` | Modify: `dismissSuggestion` and `acceptSuggestion` |
| `apps/mobile/src/suggest/suggestionModel.ts` | Create: what to offer, after dismissals (pure) |
| `apps/mobile/src/suggest/SuggestionStrip.tsx` | Create: the strip |
| `apps/mobile/src/i18n/en.ts`, `ar.ts` | Modify: the strip's strings |
| `apps/mobile/src/screens/SummaryScreen.tsx` | Modify: show the strip |

---

## Task 1: The shared changes — an id to dismiss, and somewhere to record it

**Files:**
- Modify: `react-native/packages/shared/src/model.ts`
- Modify: `react-native/packages/shared/src/store.ts` and `store.test.ts`
- Modify: `react-native/packages/shared/src/recurring.ts` and `recurring.test.ts`
- Modify: `react-native/packages/shared/src/migrate.ts` and `migrate.test.ts`
- Modify: `react-native/packages/shared/src/index.ts` and `index.test.ts`

**Interfaces:**
- Produces:
  - `BudgetStore.dismissed?: Record<MonthKey, string[]>`
  - `dismissSuggestion(store, key, templateId): BudgetStore`
  - `restoreSuggestion(store, key, templateId): BudgetStore`
  - `isDismissed(store, key, templateId): boolean`
  - `suggestionsForMonth` gains `id` on each returned object

Two additive changes, both needed: dismissal has to be recorded somewhere, and it cannot be recorded without the template id the current return shape drops.

- [ ] **Step 1: Write the failing tests**

Add to `react-native/packages/shared/src/store.test.ts`:

```ts
// A dismissal is the one thing about a recurring item that cannot be derived.
// That an item is absent from a month is not evidence it was declined -- it is
// exactly the condition for suggesting it. So the decision has to be stored.
describe('dismissing a suggestion', () => {
  it('reports nothing dismissed in a fresh store', () => {
    const s = emptyStore();
    expect(isDismissed(s, '2026-08', 'expense:housing:rent')).toBe(false);
  });

  it('records a dismissal for one month', () => {
    const s = dismissSuggestion(emptyStore(), '2026-08', 'expense:housing:rent');
    expect(isDismissed(s, '2026-08', 'expense:housing:rent')).toBe(true);
  });

  it('does NOT dismiss it for another month', () => {
    // The user chose per-month dismissal: skipping September must not lose the
    // suggestion for October.
    const s = dismissSuggestion(emptyStore(), '2026-09', 'expense:housing:rent');
    expect(isDismissed(s, '2026-10', 'expense:housing:rent')).toBe(false);
  });

  it('does not dismiss a different template in the same month', () => {
    const s = dismissSuggestion(emptyStore(), '2026-08', 'expense:housing:rent');
    expect(isDismissed(s, '2026-08', 'income:salary:pay')).toBe(false);
  });

  it('is idempotent — dismissing twice records it once', () => {
    let s = dismissSuggestion(emptyStore(), '2026-08', 'x');
    s = dismissSuggestion(s, '2026-08', 'x');
    expect(s.dismissed!['2026-08']).toEqual(['x']);
  });

  it('accumulates several dismissals in one month', () => {
    let s = dismissSuggestion(emptyStore(), '2026-08', 'a');
    s = dismissSuggestion(s, '2026-08', 'b');
    expect(s.dismissed!['2026-08'].sort()).toEqual(['a', 'b']);
  });

  it('never mutates the input store', () => {
    const before = emptyStore();
    dismissSuggestion(before, '2026-08', 'x');
    expect(before.dismissed).toEqual({});
  });

  it('leaves the months untouched', () => {
    let s = upsertEntry(emptyStore(), '2026-08', 'expense', entry());
    const months = s.months;
    s = dismissSuggestion(s, '2026-08', 'x');
    expect(s.months).toEqual(months);
  });

  it('can be undone', () => {
    let s = dismissSuggestion(emptyStore(), '2026-08', 'x');
    s = restoreSuggestion(s, '2026-08', 'x');
    expect(isDismissed(s, '2026-08', 'x')).toBe(false);
  });

  it('restoring something never dismissed is a no-op returning the same store', () => {
    const s = emptyStore();
    expect(restoreSuggestion(s, '2026-08', 'nope')).toBe(s);
  });

  it('treats an absent dismissed field as nothing dismissed', () => {
    // Every store saved before this phase has no dismissed field at all.
    const legacy = { ...emptyStore() } as Record<string, unknown>;
    delete legacy.dismissed;
    expect(isDismissed(legacy as never, '2026-08', 'x')).toBe(false);
  });

  it('can dismiss against a store that has no dismissed field yet', () => {
    const legacy = { ...emptyStore() } as Record<string, unknown>;
    delete legacy.dismissed;
    const s = dismissSuggestion(legacy as never, '2026-08', 'x');
    expect(isDismissed(s, '2026-08', 'x')).toBe(true);
  });
});
```

Add to `react-native/packages/shared/src/recurring.test.ts`:

```ts
// Dismissal needs the template id, and the returned objects dropped it.
describe('suggestionsForMonth carries the template id', () => {
  it('returns an id on every suggestion', () => {
    for (const s of suggestionsForMonth(store(), '2026-09')) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
    }
  });

  it('uses the same id detectRecurring reports, so dismissal can match', () => {
    const templateIds = detectRecurring(store()).map((t) => t.id).sort();
    const suggestionIds = suggestionsForMonth(store(), '2026-09').map((s) => s.id).sort();
    expect(suggestionIds).toEqual(templateIds);
  });

  it('keeps ids stable across calls', () => {
    const a = suggestionsForMonth(store(), '2026-09').map((s) => s.id);
    const b = suggestionsForMonth(store(), '2026-09').map((s) => s.id);
    expect(a).toEqual(b);
  });
});
```

Add to `react-native/packages/shared/src/migrate.test.ts`:

```ts
describe('a v1 store without the dismissed field', () => {
  it('still loads, because every store saved before Phase 6 lacks it', () => {
    const r = migrateV0toV1({ version: 1, currency: 'USD', locale: 'en', months: {}, recurring: [] });
    expect(r.migrated).toBe(false);
    expect(() => monthsWithData(r.store)).not.toThrow();
  });

  it('is rejected when dismissed is present but not an object', () => {
    for (const bad of ['nope', 42, []]) {
      const r = migrateV0toV1({ version: 1, currency: 'USD', locale: 'en', months: {}, recurring: [], dismissed: bad });
      expect(monthsWithData(r.store)).toEqual([]);
    }
  });

  it('passes a well-formed dismissed field through', () => {
    const dismissed = { '2026-08': ['expense:housing:rent'] };
    const r = migrateV0toV1({ version: 1, currency: 'USD', locale: 'en', months: {}, recurring: [], dismissed });
    expect(r.store.dismissed).toEqual(dismissed);
  });
});
```

- [ ] **Step 2: Run them, confirm they fail**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/shared
```

Expected: the new tests fail on missing exports and a missing `id`.

- [ ] **Step 3: Add the field**

In `model.ts`, add to `BudgetStore`, after `recurring`:

```ts
  /**
   * Template ids the user declined, per month.
   *
   * The only thing about a recurring item that cannot be derived. That an item
   * is absent from a month is not evidence it was declined -- it is exactly the
   * condition for suggesting it -- so the decision has to be recorded.
   *
   * Optional because every store saved before this existed has no such field,
   * and absent must behave as empty rather than as corrupt.
   */
  dismissed?: Record<MonthKey, string[]>;
```

Leave `recurring` exactly as it is. Add a note above it:

```ts
  /**
   * Unused. Recurring items are derived by detectRecurring from history, so
   * nothing writes this. It is kept only because `recurring: []` appears in
   * around 25 test fixtures and two validators, and churning finished packages
   * to delete a harmless field is the worse trade. It has not earned its place.
   */
```

- [ ] **Step 4: Add the helpers to `store.ts`**

```ts
function dismissedFor(store: BudgetStore, key: MonthKey): string[] {
  return store.dismissed?.[key] ?? [];
}

export function isDismissed(store: BudgetStore, key: MonthKey, templateId: string): boolean {
  return dismissedFor(store, key).includes(templateId);
}

/** Record that a suggestion was declined for one month. Immutable. */
export function dismissSuggestion(
  store: BudgetStore,
  key: MonthKey,
  templateId: string,
): BudgetStore {
  if (isDismissed(store, key, templateId)) return store;
  return {
    ...store,
    dismissed: {
      ...(store.dismissed ?? {}),
      [key]: [...dismissedFor(store, key), templateId],
    },
  };
}

/** Undo a dismissal. Returns the same store when there was nothing to undo. */
export function restoreSuggestion(
  store: BudgetStore,
  key: MonthKey,
  templateId: string,
): BudgetStore {
  if (!isDismissed(store, key, templateId)) return store;
  const rest = dismissedFor(store, key).filter((id) => id !== templateId);
  return {
    ...store,
    dismissed: { ...(store.dismissed ?? {}), [key]: rest },
  };
}
```

Also add `dismissed: {}` to `emptyStore`'s returned object.

- [ ] **Step 5: Carry the id through `recurring.ts`**

In `suggestionsForMonth`, add `id: string;` to the declared return shape and `id: t.id,` to the mapped object. Change nothing else — the filtering already works and is tested.

- [ ] **Step 6: Tolerate the field in `migrate.ts`**

In the v1 validator, accept an absent `dismissed` and reject a present-but-wrong one:

```ts
  if (raw.dismissed !== undefined) {
    if (!isRecord(raw.dismissed)) return null;
    for (const v of Object.values(raw.dismissed)) {
      if (!Array.isArray(v)) return null;
    }
  }
```

Note that `isRecord` already rejects arrays, so `dismissed: []` is caught.

- [ ] **Step 7: Export the helpers**

Add `isDismissed`, `dismissSuggestion`, `restoreSuggestion` to the `./store` export block in `index.ts`, and assert they exist in `index.test.ts` alongside the others.

- [ ] **Step 8: Verify**

```bash
npm test -w @monthly-budget/shared
npm run test:coverage -w @monthly-budget/shared
npm test -w @monthly-budget/mobile
npx tsc --noEmit -p apps/desktop/tsconfig.json
```

Expected: shared rises by your new tests and stays at 100% on all four; the mobile suite is unchanged; desktop exits 0.

**If any existing shared test fails, stop and report it** — this task is meant to be additive, and a break means it is not.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/packages/shared/src/
git commit -m "feat(core): record which recurring suggestions were declined

A dismissal is the only thing about a recurring item that cannot be derived.
That an item is absent from a month is not evidence it was declined -- it is
exactly the condition for suggesting it -- so the decision has to be stored.

Per month, by the user's decision: declining rent in September offers it
again in October, so skipping one month does not lose the suggestion forever.

dismissed is optional because every store already on a device lacks it, and
absent must behave as empty rather than as corrupt. A present-but-malformed
value is still rejected.

suggestionsForMonth now carries the template id, which dismissal needs and
the return shape previously dropped.

store.recurring is left alone and documented as unused. It earns no keep, but
recurring: [] appears in around 25 fixtures and two validators, and churning
finished packages to delete a harmless field is the worse trade.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `suggestionModel.ts` — what to offer

**Files:**
- Modify: `react-native/apps/mobile/jest.config.js`
- Create: `react-native/apps/mobile/src/suggest/suggestionModel.ts`
- Create: `react-native/apps/mobile/src/suggest/suggestionModel.test.ts`

**Interfaces:**
- Consumes: `suggestionsForMonth`, `isDismissed`, `makeId`, and the types
- Produces:
  - `interface Suggestion { id; kind; name; category; amount; day }`
  - `openSuggestions(store, monthKey, opts?): Suggestion[]`
  - `suggestionToEntry(s, monthKey, idFactory?): Entry`

- [ ] **Step 1: Widen coverage collection**

Add `'src/suggest/**/*.ts',` to `collectCoverageFrom`, before the `'!src/**/styles.ts'` line.

- [ ] **Step 2: Write the failing test**

Create `react-native/apps/mobile/src/suggest/suggestionModel.test.ts`:

```ts
import { openSuggestions, suggestionToEntry } from './suggestionModel';
import { emptyStore, upsertEntry, dismissSuggestion, detectRecurring } from '@monthly-budget/shared';

const seq = () => { let n = 0; return () => `id${++n}`; };

/** Rent and salary in two months, so both are recurring. */
function history() {
  let s = emptyStore();
  for (const m of ['2026-06', '2026-07']) {
    s = upsertEntry(s, m, 'expense', { id: `r${m}`, name: 'Rent', category: 'housing', amount: 1500, date: `${m}-01` });
    s = upsertEntry(s, m, 'income', { id: `s${m}`, name: 'Salary', category: 'salary', amount: 6000, date: `${m}-25` });
  }
  return s;
}

describe('openSuggestions', () => {
  it('offers every recurring item for an empty month', () => {
    const names = openSuggestions(history(), '2026-08').map((s) => s.name).sort();
    expect(names).toEqual(['Rent', 'Salary']);
  });

  it('offers nothing when there is no history', () => {
    expect(openSuggestions(emptyStore(), '2026-08')).toEqual([]);
  });

  it('stops offering something already entered this month', () => {
    let s = history();
    s = upsertEntry(s, '2026-08', 'expense', { id: 'new', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' });
    expect(openSuggestions(s, '2026-08').map((x) => x.name)).toEqual(['Salary']);
  });

  it('stops offering something dismissed for this month', () => {
    const rent = detectRecurring(history()).find((t) => t.name === 'Rent')!;
    const s = dismissSuggestion(history(), '2026-08', rent.id);
    expect(openSuggestions(s, '2026-08').map((x) => x.name)).toEqual(['Salary']);
  });

  it('still offers it the FOLLOWING month, since dismissal is per month', () => {
    const rent = detectRecurring(history()).find((t) => t.name === 'Rent')!;
    const s = dismissSuggestion(history(), '2026-08', rent.id);
    expect(openSuggestions(s, '2026-09').map((x) => x.name).sort()).toEqual(['Rent', 'Salary']);
  });

  it('offers nothing when everything is dismissed', () => {
    let s = history();
    for (const t of detectRecurring(s)) s = dismissSuggestion(s, '2026-08', t.id);
    expect(openSuggestions(s, '2026-08')).toEqual([]);
  });

  it('carries the most recent amount', () => {
    let s = history();
    s = upsertEntry(s, '2026-07', 'expense', { id: 'r2', name: 'Rent', category: 'housing', amount: 1600, date: '2026-07-02' });
    const rent = openSuggestions(s, '2026-08').find((x) => x.name === 'Rent')!;
    expect(rent.amount).toBe(1600);
  });

  it('gives a day, falling back to the first when the template has none', () => {
    for (const s of openSuggestions(history(), '2026-08')) {
      expect(s.day).toBeGreaterThanOrEqual(1);
      expect(s.day).toBeLessThanOrEqual(31);
    }
  });

  it('caps how many it offers, so the strip cannot fill the screen', () => {
    let s = emptyStore();
    for (const m of ['2026-06', '2026-07']) {
      for (let i = 0; i < 12; i++) {
        s = upsertEntry(s, m, 'expense', { id: `e${m}${i}`, name: `Item${i}`, category: 'food', amount: 10 + i, date: `${m}-01` });
      }
    }
    expect(openSuggestions(s, '2026-08', { limit: 5 })).toHaveLength(5);
  });

  it('is stable across calls, so the strip does not reshuffle', () => {
    const a = openSuggestions(history(), '2026-08').map((s) => s.id);
    const b = openSuggestions(history(), '2026-08').map((s) => s.id);
    expect(a).toEqual(b);
  });
});

describe('suggestionToEntry', () => {
  it('builds an entry in the month it was offered for', () => {
    const s = openSuggestions(history(), '2026-08')[0];
    const e = suggestionToEntry(s, '2026-08', seq());
    expect(e.date.slice(0, 7)).toBe('2026-08');
    expect(e.name).toBe(s.name);
    expect(e.category).toBe(s.category);
    expect(e.amount).toBe(s.amount);
  });

  it('zero-pads the day', () => {
    const s = { ...openSuggestions(history(), '2026-08')[0], day: 3 };
    expect(suggestionToEntry(s, '2026-08', seq()).date).toBe('2026-08-03');
  });

  it('gives each accepted suggestion a distinct id', () => {
    const next = seq();
    const [a, b] = openSuggestions(history(), '2026-08');
    expect(suggestionToEntry(a, '2026-08', next).id)
      .not.toBe(suggestionToEntry(b, '2026-08', next).id);
  });

  it('round-trips: accepting a suggestion stops it being offered', () => {
    const s = history();
    const first = openSuggestions(s, '2026-08')[0];
    const after = upsertEntry(s, '2026-08', first.kind, suggestionToEntry(first, '2026-08', seq()));
    expect(openSuggestions(after, '2026-08').map((x) => x.id)).not.toContain(first.id);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
npm test -w @monthly-budget/mobile -- suggestionModel
```

Expected: FAIL with `Cannot find module './suggestionModel'`.

- [ ] **Step 4: Implement**

Create `react-native/apps/mobile/src/suggest/suggestionModel.ts`:

```ts
import {
  isDismissed,
  makeId,
  suggestionsForMonth,
  type BudgetStore,
  type Entry,
  type EntryKind,
  type MonthKey,
} from '@monthly-budget/shared';

export interface Suggestion {
  id: string;
  kind: EntryKind;
  name: string;
  category: string;
  amount: number;
  day: number;
}

/**
 * The recurring items worth offering for a month.
 *
 * `suggestionsForMonth` already drops anything already entered. This drops what
 * the user declined for this month, which is the part that cannot be derived
 * from the data itself.
 */
export function openSuggestions(
  store: BudgetStore,
  monthKey: MonthKey,
  opts?: { limit?: number },
): Suggestion[] {
  const limit = opts?.limit ?? 6;
  return suggestionsForMonth(store, monthKey)
    .filter((s) => !isDismissed(store, monthKey, s.id))
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      category: s.category,
      amount: s.amount,
      // A template without a known day falls back to the first: an entry has
      // to land on some day, and the first is the least surprising guess.
      day: s.dayOfMonth ?? 1,
    }))
    .slice(0, limit);
}

/** Turn an accepted suggestion into an entry in the month it was offered for. */
export function suggestionToEntry(
  suggestion: Suggestion,
  monthKey: MonthKey,
  idFactory: () => string = makeId,
): Entry {
  return {
    id: idFactory(),
    name: suggestion.name,
    category: suggestion.category,
    amount: suggestion.amount,
    date: `${monthKey}-${String(suggestion.day).padStart(2, '0')}`,
  };
}
```

- [ ] **Step 5: Run it, confirm it passes, and check coverage**

```bash
npm test -w @monthly-budget/mobile -- suggestionModel
npm run test:coverage -w @monthly-budget/mobile
```

Report the ACTUAL count and `suggestionModel.ts`'s row.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/jest.config.js react-native/apps/mobile/src/suggest/
git commit -m "feat(mobile): decide which recurring items to offer

suggestionsForMonth already drops anything entered this month. This drops
what the user declined for this month -- the part that cannot be derived,
since absence from a month is the condition for suggesting something, not
evidence it was refused.

Capped, so a long history cannot fill the screen with suggestions, and stable
across calls so the strip does not reshuffle under the user's finger.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The reducer actions

**Files:**
- Modify: `react-native/apps/mobile/src/state/budgetReducer.ts` and its test
- Modify: `react-native/apps/mobile/src/state/BudgetProvider.tsx`
- Modify: `react-native/apps/mobile/src/state/storage.ts` and its test

**Interfaces:**
- Produces: `acceptSuggestion` and `dismissSuggestion` actions, and the matching provider methods

- [ ] **Step 1: Write the failing test**

Add to `react-native/apps/mobile/src/state/budgetReducer.test.ts`:

```ts
describe('recurring suggestions', () => {
  const ready = () =>
    budgetReducer(initialBudgetState(TODAY), { type: 'loaded', store: emptyStore(), notice: null });
  const entry = { id: 'a', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' };

  it('accepting one adds the entry to the displayed month', () => {
    const s = budgetReducer(ready(), { type: 'acceptSuggestion', kind: 'expense', entry });
    expect(monthsWithData(s.store)).toEqual(['2026-08']);
  });

  it('dismissing one records it against the displayed month', () => {
    const s = budgetReducer(ready(), { type: 'dismissSuggestion', templateId: 'x' });
    expect(s.store.dismissed!['2026-08']).toEqual(['x']);
  });

  it('dismisses against the DISPLAYED month, not today', () => {
    let s = budgetReducer(ready(), { type: 'goPrev' });
    s = budgetReducer(s, { type: 'dismissSuggestion', templateId: 'x' });
    expect(s.store.dismissed!['2026-07']).toEqual(['x']);
    expect(s.store.dismissed!['2026-08']).toBeUndefined();
  });

  it('ignores both before the load completes', () => {
    const s = initialBudgetState(TODAY);
    expect(budgetReducer(s, { type: 'dismissSuggestion', templateId: 'x' })).toBe(s);
    expect(budgetReducer(s, { type: 'acceptSuggestion', kind: 'expense', entry })).toBe(s);
  });

  it('produces a new store object, so the autosave effect writes it', () => {
    const before = ready();
    const after = budgetReducer(before, { type: 'dismissSuggestion', templateId: 'x' });
    expect(after.store).not.toBe(before.store);
  });
});
```

Add to `react-native/apps/mobile/src/state/storage.test.ts`:

```ts
describe('the dismissed field survives a round trip', () => {
  it('is restored exactly as saved', async () => {
    const kv = new MemoryKV();
    let s = emptyStore({ currency: 'SAR', locale: 'ar' });
    s = dismissSuggestion(s, '2026-08', 'expense:housing:rent');
    await saveStore(kv, s);
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('loaded');
    expect(r.store.dismissed).toEqual({ '2026-08': ['expense:housing:rent'] });
  });

  it('a store saved before this field existed still loads', async () => {
    const legacy = { version: 1, currency: 'SAR', locale: 'ar', recurring: [], months: {} };
    const kv = new MemoryKV({ [STORE_KEY]: JSON.stringify(legacy) });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('loaded');
  });

  it('rejects a malformed dismissed field rather than loading it', async () => {
    for (const bad of ['nope', 42, [], { '2026-08': 'not-an-array' }]) {
      const raw = JSON.stringify({ version: 1, currency: 'SAR', locale: 'ar', recurring: [], months: {}, dismissed: bad });
      const r = await loadStore(new MemoryKV({ [STORE_KEY]: raw }), { today: TODAY });
      expect(r.status).toBe('corrupt');
    }
  });
});
```

- [ ] **Step 2: Run them, confirm they fail**

```bash
npm test -w @monthly-budget/mobile
```

- [ ] **Step 3: Add the actions**

Add to `BudgetAction`:

```ts
  | { type: 'acceptSuggestion'; kind: EntryKind; entry: Entry }
  | { type: 'dismissSuggestion'; templateId: string }
```

And the cases, both guarded like every other mutation:

```ts
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
```

Import `dismissSuggestion` from `@monthly-budget/shared`. Note the name collision with the action type — the import is the store helper, the action is the intent.

- [ ] **Step 4: Extend `isUsable` in `storage.ts`**

Reject a present-but-malformed `dismissed`, accept an absent one:

```ts
  if (c.dismissed !== undefined) {
    if (typeof c.dismissed !== 'object' || c.dismissed === null || Array.isArray(c.dismissed)) {
      return false;
    }
    for (const v of Object.values(c.dismissed as Record<string, unknown>)) {
      if (!Array.isArray(v)) return false;
    }
  }
```

- [ ] **Step 5: Add the provider methods**

Add `acceptSuggestion(kind, entry)` and `dismissSuggestion(templateId)` to the context value and its interface, dispatching the actions.

- [ ] **Step 6: Verify**

```bash
npm test -w @monthly-budget/mobile
npm run test:coverage -w @monthly-budget/mobile
npm test -w @monthly-budget/shared
npm run typecheck -w @monthly-budget/mobile
npx tsc --noEmit -p apps/desktop/tsconfig.json
```

Expected: both typechecks exit 0; shared unchanged; mobile up by your new tests; coverage at 100% on the changed modules.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/state/
git commit -m "feat(mobile): accept or decline a suggestion, and persist the decline

Both actions are guarded like every other mutation: applied before the load
completes they would be built on the empty initial store and then persisted
over real data, which is the race that destroyed data earlier in this project.

A dismissal is recorded against the DISPLAYED month, not today -- declining
rent while looking at September must not silence it for August.

isUsable rejects a malformed dismissed field but accepts an absent one, since
every store already on a device predates it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The strip

**Files:**
- Create: `react-native/apps/mobile/src/suggest/SuggestionStrip.tsx`
- Modify: `react-native/apps/mobile/src/i18n/en.ts`, `ar.ts`
- Modify: `react-native/apps/mobile/src/screens/SummaryScreen.tsx`

- [ ] **Step 1: Add the strings**

A heading for the strip, an accept label, a "not this month" label, and a line explaining what the strip is for. Add English first; the compiler will list the missing Arabic.

- [ ] **Step 2: Write `SuggestionStrip.tsx`**

Reads `store`, `monthKey`, `acceptSuggestion`, `dismissSuggestion` from `useBudget()`, then `openSuggestions(store, monthKey)`.

- **Renders nothing at all when there is nothing to offer.** An empty heading is worse than no heading.
- One row per suggestion: name, translated category, formatted amount, and two controls — accept and "not this month".
- Accept calls `acceptSuggestion(s.kind, suggestionToEntry(s, monthKey))`.
- Decline calls `dismissSuggestion(s.id)`.
- Both controls need an `accessibilityLabel` naming the item, since two rows of identical buttons are indistinguishable to a screen reader.
- Apply `rowDirection(locale)` and `writingDirection(locale)`.

- [ ] **Step 3: Show it on the summary screen**

Render `<SuggestionStrip />` near the top of `SummaryScreen`, above the stat tiles — it is about the month you are about to fill in, so it belongs before the figures rather than after them.

- [ ] **Step 4: Verify**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm run typecheck -w @monthly-budget/mobile
npm test -w @monthly-budget/mobile
npm test -w @monthly-budget/shared
npx tsc --noEmit -p apps/desktop/tsconfig.json
wc -l apps/mobile/src/suggest/*.tsx apps/mobile/src/screens/SummaryScreen.tsx
grep -c "openSuggestions" apps/mobile/src/suggest/SuggestionStrip.tsx
grep -oE '>[A-Z][a-zA-Z ]{4,40}<' apps/mobile/src/suggest/SuggestionStrip.tsx || echo "no hardcoded English"
grep -c "accessibilityLabel" apps/mobile/src/suggest/SuggestionStrip.tsx
```

Expected: both typechecks exit 0; suites unchanged; no hardcoded English; at least two `accessibilityLabel` uses.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/
git commit -m "feat(mobile): offer recurring items when a month opens

The last piece of the original plan. Without it a user starts every month from
a blank page and re-enters rent, salary and subscriptions by hand, which is
the main reason people abandon a budget app after the second month.

Each suggestion is one tap to accept. Declining is 'not this month' and is
remembered, so the strip stops nagging -- and the item returns next month,
because skipping one month is not the same as never wanting it again.

The strip renders nothing when there is nothing to offer. An empty heading is
worse than no heading.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of Done for Phase 6

- [ ] Opening a month offers the recurring items not yet entered
- [ ] One tap accepts a suggestion, with the most recent amount and usual day
- [ ] "Not this month" is remembered and stops the nagging
- [ ] A declined suggestion returns the following month
- [ ] A store saved before this phase loads unchanged; a malformed `dismissed` is rejected
- [ ] The strip renders nothing when there is nothing to offer
- [ ] Every string from the i18n tables; controls carry accessibility labels
- [ ] `suggestionModel.ts` at 100%; shared still 100% on all four
- [ ] Both suites pass; `apps/desktop` still typechecks

## What is NOT in this plan

- Editing a template's amount before accepting it. Accept-then-edit already works through the entry list.
- Pruning old dismissals. A dismissal for a month nobody revisits is a few bytes; a pruning rule is a guess about behaviour nobody has observed yet.
- A "never suggest this again" option. The user chose per-month dismissal; adding permanent dismissal is a separate decision with its own UI.
- Removing `store.recurring`. Documented as unused and deliberately left; see the Global Constraints.
- Rendering tests for any `.tsx` file, which need a device harness rather than `testEnvironment: node`.
