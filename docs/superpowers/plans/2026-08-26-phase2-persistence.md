# Phase 2 Implementation Plan — Persistence, Migration, i18n

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile app persist a month-keyed store safely — data saved on every change, restored on restart, and never lost — and give it a translation layer.

**Architecture:** A dependency-injected storage module wraps AsyncStorage behind a tiny `KVStore` interface so it is testable without mocking native modules. A single `BudgetProvider` owns all state and is the only writer. Four competing hooks and two rival storage keys in the existing app are deleted. A hand-rolled typed i18n layer avoids adding a dependency.

**Tech Stack:** TypeScript 5.4 (strict), React 18.2, React Native 0.74.7, Jest 29 + ts-jest, `@react-native-async-storage/async-storage` 2.2.

## Global Constraints

- **The eight persistence guarantees (P1–P8) from the spec are binding.** Each needs a test that fails on regression:
  - **P1** One storage key, one source of truth. The rival keys `@MonthlyBudget:current_budget` and `budget_data` are removed.
  - **P2** Init guard: no write may occur before the first read completes.
  - **P3** Autosave on every change. No manual save button for persistence.
  - **P4** Atomic write: the store is serialised and written whole, in one operation.
  - **P5** Tolerant read: corrupt JSON yields an explicit error state, never a silent empty screen, and **the corrupt payload is preserved, never deleted**.
  - **P6** Backup before migration: the verbatim v0 payload is persisted **before** the new store is written.
  - **P7** Explicit errors: a write failure throws and reaches the user. **No `catch` that only logs** in the user-data path.
  - **P8** Opens on the current month; all stored months remain reachable.
- **`@monthly-budget/shared` is DONE and must not be modified.** 198 tests, 100% coverage on all four metrics. Import from it; if you believe it is wrong, report rather than edit.
- **`apps/desktop` must keep compiling.** `npx tsc --noEmit -p apps/desktop/tsconfig.json` exits 0. CI enforces this.
- **No new runtime dependencies.** The repo already carries 43 transitive vulnerabilities; i18n and formatting are hand-rolled deliberately.
- **No non-injectable clock or randomness** in testable logic. Pass `today`/`now` in.
- **Category ids and `MonthKey`s are stored in data and never translated.** Only display strings come from i18n.
- **Target 120 lines per module**, one concern each.
- Commit after every task. Prefixes: `chore:`, `feat:`, `test:`, `fix:`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/mobile/jest.config.js` | Create: ts-jest config for the app |
| `apps/mobile/package.json` | Modify: test scripts + jest devDependencies |
| `apps/mobile/tsconfig.json` | Modify: exclude tests from build |
| `apps/mobile/src/state/kv.ts` | Create: the `KVStore` interface + the AsyncStorage adapter |
| `apps/mobile/src/state/keys.ts` | Create: every storage key in one place |
| `apps/mobile/src/state/storage.ts` | Create: load/save with P1, P4–P7 |
| `apps/mobile/src/state/BudgetProvider.tsx` | Create: single owner of state; P2, P3, P8 |
| `apps/mobile/src/i18n/en.ts` | Create: English strings (the key source of truth) |
| `apps/mobile/src/i18n/ar.ts` | Create: Arabic strings, typed against English |
| `apps/mobile/src/i18n/index.ts` | Create: `t`, `isRTL`, `LocaleProvider` |
| `apps/mobile/src/App.tsx` | Modify: delete the four hooks, read from the provider |
| `apps/mobile/src/ReactNativeAdapter.ts` | Modify: drop its private storage key and methods |

---

## Task 1: Test harness for the mobile app

**Files:**
- Modify: `react-native/apps/mobile/package.json`
- Create: `react-native/apps/mobile/jest.config.js`
- Modify: `react-native/apps/mobile/tsconfig.json`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test -w @monthly-budget/mobile` runs Jest over `src/**/*.test.ts(x)`. Every later task depends on it.

- [ ] **Step 1: Add scripts and devDependencies**

In `react-native/apps/mobile/package.json`, leave `dependencies` untouched and replace the `scripts` and `devDependencies` blocks with:

```json
  "scripts": {
    "android": "react-native run-android",
    "ios": "react-native run-ios",
    "start": "react-native start",
    "clean": "rimraf node_modules",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/jest": "^29.5.13",
    "@types/react": "18.2.37",
    "@types/react-native": "0.73.0",
    "jest": "^29.7.0",
    "rimraf": "^6.0.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.4.0"
  }
```

- [ ] **Step 2: Create the Jest config**

Create `react-native/apps/mobile/jest.config.js`:

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // ts before js, so a stray compiled artifact can never shadow source.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  collectCoverageFrom: [
    'src/state/**/*.ts',
    'src/i18n/**/*.ts',
    '!src/**/*.test.ts',
  ],
  coverageThreshold: {
    global: { lines: 90, statements: 90, functions: 90, branches: 80 },
  },
};
```

Coverage is collected from `state/` and `i18n/` only. `App.tsx` is a React Native screen tree that cannot render under `testEnvironment: node`; testing it needs a device harness, which is out of scope.

- [ ] **Step 3: Exclude tests from the build**

In `react-native/apps/mobile/tsconfig.json`, add `"types": ["jest"]` to `compilerOptions` and an `exclude` array. Keep every existing setting:

```json
  "exclude": ["node_modules", "src/**/*.test.ts", "src/**/*.test.tsx"]
```

- [ ] **Step 4: Install**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm install --workspaces --include-workspace-root
```

Expected: no `ERR!`.

- [ ] **Step 5: Prove the harness runs**

Create `react-native/apps/mobile/src/state/smoke.test.ts`:

```ts
describe('mobile jest harness', () => {
  it('runs TypeScript tests', () => {
    expect([1, 2, 3].reduce((a, b) => a + b, 0)).toBe(6);
  });
});
```

Run:

```bash
npm test -w @monthly-budget/mobile
```

Expected: `Tests: 1 passed, 1 total`.

- [ ] **Step 6: Delete the smoke test**

```bash
rm apps/mobile/src/state/smoke.test.ts
```

- [ ] **Step 7: Verify nothing else broke**

```bash
npx tsc --noEmit -p apps/desktop/tsconfig.json
npm test -w @monthly-budget/shared
```

Expected: exit 0, and `Tests: 198 passed`.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/package.json \
        react-native/apps/mobile/jest.config.js \
        react-native/apps/mobile/tsconfig.json \
        react-native/package-lock.json
git commit -m "chore(mobile): add a jest harness for the app's state and i18n layers

The mobile app had no tests at all. Phase 2 adds a persistence layer that
must not lose user data, so it needs one. Coverage is collected from
state/ and i18n/ only -- App.tsx is a React Native screen tree that cannot
render under testEnvironment: node.

moduleFileExtensions puts ts ahead of js so a stray compiled artifact can
never shadow source, the same guard the shared package uses.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `keys.ts` and `kv.ts` — storage keys and the injectable backend

**Files:**
- Create: `react-native/apps/mobile/src/state/keys.ts`
- Create: `react-native/apps/mobile/src/state/kv.ts`
- Create: `react-native/apps/mobile/src/state/kv.test.ts`

**Interfaces:**
- Consumes: `@react-native-async-storage/async-storage`
- Produces:
  - `STORE_KEY`, `BACKUP_KEY`, `CORRUPT_KEY`, `LEGACY_KEYS` from `./keys`
  - `interface KVStore { getItem(k): Promise<string | null>; setItem(k, v): Promise<void>; removeItem(k): Promise<void> }`
  - `asyncStorageKV: KVStore`
  - `class MemoryKV implements KVStore` — test double, also usable to reproduce failures

- [ ] **Step 1: Write the failing test**

Create `react-native/apps/mobile/src/state/kv.test.ts`:

```ts
import { MemoryKV } from './kv';
import { STORE_KEY, BACKUP_KEY, CORRUPT_KEY, LEGACY_KEYS } from './keys';

describe('storage keys', () => {
  it('are all distinct', () => {
    const all = [STORE_KEY, BACKUP_KEY, CORRUPT_KEY, ...LEGACY_KEYS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('name both rival keys the old app used, so they can be cleaned up', () => {
    expect(LEGACY_KEYS).toContain('@MonthlyBudget:current_budget');
    expect(LEGACY_KEYS).toContain('budget_data');
  });

  it('versions the store key, so a future format change cannot collide', () => {
    expect(STORE_KEY).toMatch(/v1$/);
  });
});

describe('MemoryKV', () => {
  it('round-trips a value', async () => {
    const kv = new MemoryKV();
    await kv.setItem('a', 'hello');
    expect(await kv.getItem('a')).toBe('hello');
  });

  it('returns null for a missing key', async () => {
    expect(await new MemoryKV().getItem('nope')).toBeNull();
  });

  it('removes a key', async () => {
    const kv = new MemoryKV();
    await kv.setItem('a', '1');
    await kv.removeItem('a');
    expect(await kv.getItem('a')).toBeNull();
  });

  it('seeds from an initial map', async () => {
    const kv = new MemoryKV({ a: '1' });
    expect(await kv.getItem('a')).toBe('1');
  });

  it('can be told to fail writes, so failure paths are testable', async () => {
    const kv = new MemoryKV();
    kv.failWrites = 'disk full';
    await expect(kv.setItem('a', '1')).rejects.toThrow('disk full');
  });

  it('can be told to fail reads', async () => {
    const kv = new MemoryKV();
    kv.failReads = 'read error';
    await expect(kv.getItem('a')).rejects.toThrow('read error');
  });

  it('records writes in order, so atomicity and ordering can be asserted', async () => {
    const kv = new MemoryKV();
    await kv.setItem('a', '1');
    await kv.setItem('b', '2');
    expect(kv.writeLog).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm test -w @monthly-budget/mobile -- kv
```

Expected: FAIL, `Cannot find module './kv'`.

- [ ] **Step 3: Write `keys.ts`**

Create `react-native/apps/mobile/src/state/keys.ts`:

```ts
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
```

- [ ] **Step 4: Write `kv.ts`**

Create `react-native/apps/mobile/src/state/kv.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The narrow slice of AsyncStorage this app needs.
 *
 * Injecting this interface rather than importing AsyncStorage directly is what
 * makes the persistence layer testable without mocking a native module -- and
 * lets the tests reproduce write failures, which is how P7 gets verified.
 */
export interface KVStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const asyncStorageKV: KVStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/** In-memory KVStore for tests. Can be told to fail, and logs writes in order. */
export class MemoryKV implements KVStore {
  private data: Record<string, string>;
  /** Set to a message to make every write reject with it. */
  failWrites: string | null = null;
  /** Set to a message to make every read reject with it. */
  failReads: string | null = null;
  /** Every successful write, in order, as [key, value]. */
  readonly writeLog: Array<[string, string]> = [];

  constructor(initial: Record<string, string> = {}) {
    this.data = { ...initial };
  }

  async getItem(key: string): Promise<string | null> {
    if (this.failReads) throw new Error(this.failReads);
    return key in this.data ? this.data[key] : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failWrites) throw new Error(this.failWrites);
    this.data[key] = value;
    this.writeLog.push([key, value]);
  }

  async removeItem(key: string): Promise<void> {
    if (this.failWrites) throw new Error(this.failWrites);
    delete this.data[key];
  }
}
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
npm test -w @monthly-budget/mobile -- kv
```

Expected: all pass. Report the ACTUAL count -- do not reconcile it against any number in this plan.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/state/keys.ts \
        react-native/apps/mobile/src/state/kv.ts \
        react-native/apps/mobile/src/state/kv.test.ts
git commit -m "feat(mobile): add injectable KV storage and one place for keys

The old app wrote the same document under two keys from four competing
effects, so whichever resolved last won and the other silently lost. keys.ts
makes one key the source of truth and names the rivals only so migration can
read them once and clean them up.

kv.ts injects a narrow KVStore interface rather than importing AsyncStorage
directly, which makes the persistence layer testable without mocking a native
module -- and lets tests reproduce write failures, which is how the
explicit-error guarantee gets verified rather than assumed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `storage.ts` — load, migrate, save

**Files:**
- Create: `react-native/apps/mobile/src/state/storage.ts`
- Create: `react-native/apps/mobile/src/state/storage.test.ts`

**Interfaces:**
- Consumes: `KVStore` from `./kv`; the keys from `./keys`; `emptyStore`, `migrateV0toV1`, `needsMigration`, `monthsWithData`, `type BudgetStore` from `@monthly-budget/shared`
- Produces:
  - `type LoadStatus = 'loaded' | 'migrated' | 'empty' | 'corrupt'`
  - `interface LoadResult { status: LoadStatus; store: BudgetStore; entriesMoved?: number; error?: string }`
  - `loadStore(kv: KVStore, opts?: { today?: Date }): Promise<LoadResult>`
  - `saveStore(kv: KVStore, store: BudgetStore): Promise<void>` — **throws on failure**

This module carries P1 and P4–P7.

- [ ] **Step 1: Write the failing test**

Create `react-native/apps/mobile/src/state/storage.test.ts`:

```ts
import { loadStore, saveStore } from './storage';
import { MemoryKV } from './kv';
import { STORE_KEY, BACKUP_KEY, CORRUPT_KEY, LEGACY_KEYS } from './keys';
import { emptyStore, upsertEntry, monthsWithData, totalsForMonth } from '@monthly-budget/shared';

const TODAY = new Date(2026, 7, 26);

function v1Fixture() {
  let s = emptyStore({ currency: 'SAR', locale: 'ar' });
  s = upsertEntry(s, '2026-08', 'expense', {
    id: 'a', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01',
  });
  return s;
}

/** The shape the old app persisted: one document, a month LABEL, string amounts. */
const V0 = {
  meta: { year: 2026, month: 8, saved_at: '2026-08-26T10:00:00Z' },
  incomes: [{ name: 'Salary', amount: '6,000.00', date: '2026-07-25' }],
  expenses: [{ name: 'Rent', category: 'Housing', amount: '1,500.00', date: '2026-08-01' }],
};

describe('loadStore — first run', () => {
  it('returns an empty usable store when nothing is stored', async () => {
    const r = await loadStore(new MemoryKV(), { today: TODAY });
    expect(r.status).toBe('empty');
    expect(r.store.version).toBe(1);
    expect(monthsWithData(r.store)).toEqual([]);
  });

  it('writes nothing during a first-run load', async () => {
    const kv = new MemoryKV();
    await loadStore(kv, { today: TODAY });
    expect(kv.writeLog).toEqual([]);
  });
});

describe('loadStore — normal load', () => {
  it('restores a previously saved store', async () => {
    const kv = new MemoryKV({ [STORE_KEY]: JSON.stringify(v1Fixture()) });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('loaded');
    expect(totalsForMonth(r.store, '2026-08').expenses).toBe(1500);
  });

  it('preserves currency and locale across a restart', async () => {
    const kv = new MemoryKV({ [STORE_KEY]: JSON.stringify(v1Fixture()) });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.store.currency).toBe('SAR');
    expect(r.store.locale).toBe('ar');
  });
});

describe('loadStore — migration (P6)', () => {
  it('migrates a v0 payload found under the adapter key', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('migrated');
    expect(r.entriesMoved).toBe(2);
    expect(monthsWithData(r.store)).toEqual(['2026-07', '2026-08']);
  });

  it('migrates a v0 payload found under the legacy key', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[1]]: JSON.stringify(V0) });
    expect((await loadStore(kv, { today: TODAY })).status).toBe('migrated');
  });

  it('does not lose formatted string amounts', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    const r = await loadStore(kv, { today: TODAY });
    expect(totalsForMonth(r.store, '2026-08').expenses).toBe(1500);
    expect(totalsForMonth(r.store, '2026-07').income).toBe(6000);
  });

  it('writes the backup BEFORE the migrated store', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    await loadStore(kv, { today: TODAY });
    const order = kv.writeLog.map(([k]) => k);
    expect(order.indexOf(BACKUP_KEY)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(BACKUP_KEY)).toBeLessThan(order.indexOf(STORE_KEY));
  });

  it('keeps the backup byte-identical to what was stored', async () => {
    const raw = JSON.stringify(V0);
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: raw });
    await loadStore(kv, { today: TODAY });
    expect(JSON.parse(await kv.getItem(BACKUP_KEY) as string)).toEqual(V0);
  });

  it('removes the legacy keys once migrated, so P1 holds afterwards', async () => {
    const kv = new MemoryKV({
      [LEGACY_KEYS[0]]: JSON.stringify(V0),
      [LEGACY_KEYS[1]]: JSON.stringify(V0),
    });
    await loadStore(kv, { today: TODAY });
    expect(await kv.getItem(LEGACY_KEYS[0])).toBeNull();
    expect(await kv.getItem(LEGACY_KEYS[1])).toBeNull();
  });

  it('does not migrate twice on the next launch', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    await loadStore(kv, { today: TODAY });
    const second = await loadStore(kv, { today: TODAY });
    expect(second.status).toBe('loaded');
  });

  it('prefers an existing v1 store over a stale legacy payload', async () => {
    const kv = new MemoryKV({
      [STORE_KEY]: JSON.stringify(v1Fixture()),
      [LEGACY_KEYS[0]]: JSON.stringify(V0),
    });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('loaded');
    expect(monthsWithData(r.store)).toEqual(['2026-08']);
  });
});

describe('loadStore — corrupt data (P5)', () => {
  it('reports corruption explicitly instead of showing an empty screen', async () => {
    const kv = new MemoryKV({ [STORE_KEY]: '{not json' });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(r.error).toBeTruthy();
  });

  it('still returns a usable store so the app can start', async () => {
    const kv = new MemoryKV({ [STORE_KEY]: '{not json' });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.store.version).toBe(1);
    expect(() => monthsWithData(r.store)).not.toThrow();
  });

  it('PRESERVES the corrupt payload rather than deleting it', async () => {
    const kv = new MemoryKV({ [STORE_KEY]: '{not json' });
    await loadStore(kv, { today: TODAY });
    expect(await kv.getItem(CORRUPT_KEY)).toBe('{not json');
  });

  it('survives a v1-tagged but structurally broken store', async () => {
    const kv = new MemoryKV({ [STORE_KEY]: JSON.stringify({ version: 1 }) });
    const r = await loadStore(kv, { today: TODAY });
    expect(() => monthsWithData(r.store)).not.toThrow();
  });

  it('reports a read failure rather than pretending the store is empty', async () => {
    const kv = new MemoryKV();
    kv.failReads = 'device read error';
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(r.error).toContain('device read error');
  });
});

describe('saveStore', () => {
  it('writes the whole store in ONE operation (P4)', async () => {
    const kv = new MemoryKV();
    await saveStore(kv, v1Fixture());
    expect(kv.writeLog).toHaveLength(1);
    expect(kv.writeLog[0][0]).toBe(STORE_KEY);
  });

  it('round-trips through loadStore', async () => {
    const kv = new MemoryKV();
    await saveStore(kv, v1Fixture());
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('loaded');
    expect(totalsForMonth(r.store, '2026-08').expenses).toBe(1500);
  });

  it('THROWS on write failure rather than swallowing it (P7)', async () => {
    const kv = new MemoryKV();
    kv.failWrites = 'disk full';
    await expect(saveStore(kv, v1Fixture())).rejects.toThrow('disk full');
  });

  it('never writes to a legacy key (P1)', async () => {
    const kv = new MemoryKV();
    await saveStore(kv, v1Fixture());
    for (const legacy of LEGACY_KEYS) {
      expect(kv.writeLog.map(([k]) => k)).not.toContain(legacy);
    }
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npm test -w @monthly-budget/mobile -- storage
```

Expected: FAIL, `Cannot find module './storage'`.

- [ ] **Step 3: Write the implementation**

Create `react-native/apps/mobile/src/state/storage.ts`:

```ts
import {
  emptyStore,
  migrateV0toV1,
  monthsWithData,
  type BudgetStore,
} from '@monthly-budget/shared';
import type { KVStore } from './kv';
import { BACKUP_KEY, CORRUPT_KEY, LEGACY_KEYS, STORE_KEY } from './keys';

export type LoadStatus = 'loaded' | 'migrated' | 'empty' | 'corrupt';

export interface LoadResult {
  status: LoadStatus;
  /** Always usable, even when status is 'corrupt'. The app must be able to start. */
  store: BudgetStore;
  entriesMoved?: number;
  error?: string;
}

/** A store is only trustworthy if the shared helpers can actually read it. */
function isUsable(candidate: unknown): candidate is BudgetStore {
  try {
    monthsWithData(candidate as BudgetStore);
    return true;
  } catch {
    return false;
  }
}

async function readLegacy(kv: KVStore): Promise<{ key: string; raw: string } | null> {
  for (const key of LEGACY_KEYS) {
    const raw = await kv.getItem(key);
    if (raw) return { key, raw };
  }
  return null;
}

/**
 * Load the store, migrating a v0 payload if that is what is there.
 *
 * Never throws and always returns a usable store: a device that cannot be read
 * must still open the app rather than crashing on launch. Corrupt data is moved
 * aside, never deleted, so it can be recovered.
 */
export async function loadStore(
  kv: KVStore,
  opts?: { today?: Date },
): Promise<LoadResult> {
  const fresh = () => emptyStore();

  let raw: string | null;
  try {
    raw = await kv.getItem(STORE_KEY);
  } catch (e) {
    return { status: 'corrupt', store: fresh(), error: String(e) };
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // migrateV0toV1 validates the v1 shape and degrades safely if broken.
      const { store } = migrateV0toV1(parsed, { today: opts?.today });
      if (isUsable(store)) return { status: 'loaded', store };
      throw new Error('stored value is not a usable budget store');
    } catch (e) {
      // P5: preserve, never delete. A failure to preserve must not mask the
      // original problem, so it is reported alongside it.
      let error = String(e);
      try {
        await kv.setItem(CORRUPT_KEY, raw);
      } catch (preserveError) {
        error = `${error} (and the corrupt payload could not be preserved: ${preserveError})`;
      }
      return { status: 'corrupt', store: fresh(), error };
    }
  }

  let legacy: { key: string; raw: string } | null;
  try {
    legacy = await readLegacy(kv);
  } catch (e) {
    return { status: 'corrupt', store: fresh(), error: String(e) };
  }

  if (!legacy) return { status: 'empty', store: fresh() };

  try {
    const { store, backup, entriesMoved } = migrateV0toV1(JSON.parse(legacy.raw), {
      today: opts?.today,
    });
    // P6: the backup lands BEFORE the new store. If the write of the store
    // fails, the untouched originals plus the backup are still on the device.
    await kv.setItem(BACKUP_KEY, backup);
    await kv.setItem(STORE_KEY, JSON.stringify(store));
    // Only now is it safe to drop the rivals, so P1 holds from here on.
    for (const key of LEGACY_KEYS) await kv.removeItem(key);
    return { status: 'migrated', store, entriesMoved };
  } catch (e) {
    let error = String(e);
    try {
      await kv.setItem(CORRUPT_KEY, legacy.raw);
    } catch (preserveError) {
      error = `${error} (and the corrupt payload could not be preserved: ${preserveError})`;
    }
    return { status: 'corrupt', store: fresh(), error };
  }
}

/**
 * Persist the store.
 *
 * P4: one serialisation, one write. P7: throws on failure so the caller can
 * tell the user. Never swallow this -- a silent save failure is how people
 * lose a month of records without knowing.
 */
export async function saveStore(kv: KVStore, store: BudgetStore): Promise<void> {
  await kv.setItem(STORE_KEY, JSON.stringify(store));
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npm test -w @monthly-budget/mobile -- storage
```

Expected: all pass. Report the ACTUAL count -- do not reconcile it against any number in this plan.

- [ ] **Step 5: Check coverage**

```bash
npm run test:coverage -w @monthly-budget/mobile
```

Report `storage.ts`'s row. If a branch is uncovered, name it and decide whether it is a genuine gap.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/state/storage.ts \
        react-native/apps/mobile/src/state/storage.test.ts
git commit -m "feat(mobile): load, migrate and save the month store safely

Carries four of the persistence guarantees. The backup is written BEFORE
the migrated store, so a failure between the two leaves the originals and
the backup both intact. Corrupt data is moved aside rather than deleted,
and reported explicitly instead of appearing as an empty screen. saveStore
throws on failure -- a silent save failure is how someone loses a month of
records without knowing.

Legacy keys are removed only after the new store is safely written, so the
one-source-of-truth guarantee holds from that point on.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `i18n` — typed translation layer

**Files:**
- Create: `react-native/apps/mobile/src/i18n/en.ts`
- Create: `react-native/apps/mobile/src/i18n/ar.ts`
- Create: `react-native/apps/mobile/src/i18n/index.ts`
- Create: `react-native/apps/mobile/src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `monthLabel`, `formatMoney`, `type Locale` from `@monthly-budget/shared`
- Produces:
  - `type StringKey` (the keys of `en`)
  - `t(key: StringKey, locale: Locale, params?: Record<string, string | number>): string`
  - `isRTL(locale: Locale): boolean`
  - `dirOf(locale: Locale): 'rtl' | 'ltr'`

Arabic is typed as `Record<StringKey, string>`, so **a missing Arabic string is a compile error**, not a silent English fallback at runtime.

- [ ] **Step 1: Write the failing test**

Create `react-native/apps/mobile/src/i18n/i18n.test.ts`:

```ts
import { t, isRTL, dirOf } from './index';
import { en } from './en';
import { ar } from './ar';

describe('translation completeness', () => {
  it('has an Arabic string for every English key', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings in either language', () => {
    for (const v of Object.values({ ...en })) expect(v.length).toBeGreaterThan(0);
    for (const v of Object.values({ ...ar })) expect(v.length).toBeGreaterThan(0);
  });

  it('does not leave any Arabic value identical to its English one', () => {
    // Catches a placeholder that was copied and never translated.
    const untranslated = Object.keys(en).filter(
      (k) => ar[k as keyof typeof ar] === en[k as keyof typeof en],
    );
    expect(untranslated).toEqual([]);
  });
});

describe('t', () => {
  it('returns the string for the requested locale', () => {
    expect(t('app.title', 'en')).toBe(en['app.title']);
    expect(t('app.title', 'ar')).toBe(ar['app.title']);
  });

  it('substitutes named parameters', () => {
    expect(t('month.entriesCount', 'en', { count: 3 })).toContain('3');
    expect(t('month.entriesCount', 'ar', { count: 3 })).toContain('3');
  });

  it('leaves an unmatched placeholder visible rather than silently blanking it', () => {
    // A blank is invisible in the UI; a visible token gets reported as a bug.
    expect(t('month.entriesCount', 'en', {})).toContain('{count}');
  });
});

describe('direction', () => {
  it('marks Arabic as RTL and English as LTR', () => {
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('en')).toBe(false);
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npm test -w @monthly-budget/mobile -- i18n
```

Expected: FAIL, `Cannot find module './index'` or `./en`.

- [ ] **Step 3: Write `en.ts`**

Create `react-native/apps/mobile/src/i18n/en.ts`:

```ts
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
```

- [ ] **Step 4: Write `ar.ts`**

Create `react-native/apps/mobile/src/i18n/ar.ts`:

```ts
import type { en } from './en';

/**
 * Typed against the English object, so omitting a key fails the build.
 * Category and month names do NOT live here -- categories are stable ids
 * resolved by the shared taxonomy, and month names come from monthLabel().
 */
export const ar: Record<keyof typeof en, string> = {
  'app.title': 'الميزانية الشهرية',

  'month.current': 'الشهر الحالي',
  'month.previous': 'الشهر السابق',
  'month.next': 'الشهر التالي',
  'month.empty': 'لا توجد أي حركات مسجّلة لهذا الشهر بعد',
  'month.entriesCount': '{count} حركة',

  'totals.income': 'الدخل',
  'totals.expenses': 'المصروفات',
  'totals.net': 'الصافي',
  'totals.margin': 'هامش الربح',

  'kind.income': 'دخل',
  'kind.expense': 'مصروف',

  'status.loading': 'جارٍ تحميل ميزانيتك…',
  'status.saveFailed': 'تعذّر الحفظ. تعديلاتك ما زالت ظاهرة — حاول مرة أخرى.',
  'status.loadCorrupt': 'تعذّرت قراءة بياناتك المحفوظة. تم الاحتفاظ بها ولم تُحذف.',
  'status.migrated': 'تم تنظيم بياناتك في أشهر.',

  'action.retry': 'إعادة المحاولة',
  'action.dismiss': 'إغلاق',
};
```

- [ ] **Step 5: Write `index.ts`**

Create `react-native/apps/mobile/src/i18n/index.ts`:

```ts
import type { Locale } from '@monthly-budget/shared';
import { en } from './en';
import { ar } from './ar';

export type StringKey = keyof typeof en;

const TABLES: Record<Locale, Record<StringKey, string>> = { en, ar };

/**
 * Look up a display string.
 *
 * An unmatched placeholder is left visible as `{name}` rather than replaced
 * with a blank: a blank is invisible in the UI and ships unnoticed, whereas a
 * visible token gets reported.
 */
export function t(
  key: StringKey,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const raw = TABLES[locale][key];
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function isRTL(locale: Locale): boolean {
  return locale === 'ar';
}

export function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

export { en, ar };
```

- [ ] **Step 6: Run it, confirm it passes**

```bash
npm test -w @monthly-budget/mobile -- i18n
```

Expected: all pass. Report the ACTUAL count -- do not reconcile it against any number in this plan.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/i18n/
git commit -m "feat(mobile): add a typed Arabic/English translation layer

Arabic is typed against the English object, so omitting a key is a compile
error rather than a silent English fallback that ships. A test also fails if
an Arabic value is byte-identical to its English one, which catches a
placeholder that was copied and never translated.

An unmatched placeholder renders as a visible {token} rather than a blank --
a blank is invisible in the UI and ships unnoticed.

Hand-rolled rather than adding an i18n dependency: the tree already carries
43 transitive vulnerabilities and this needs ~30 lines.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `BudgetProvider` — the single owner of state

**Files:**
- Create: `react-native/apps/mobile/src/state/BudgetProvider.tsx`
- Create: `react-native/apps/mobile/src/state/budgetReducer.ts`
- Create: `react-native/apps/mobile/src/state/budgetReducer.test.ts`

**Interfaces:**
- Consumes: `loadStore`, `saveStore` from `./storage`; `asyncStorageKV`, `KVStore` from `./kv`; `currentMonthKey`, `prevKey`, `nextKey`, `isFutureKey`, `upsertEntry`, `removeEntry`, `type BudgetStore`, `type Entry`, `type EntryKind`, `type MonthKey` from `@monthly-budget/shared`
- Produces:
  - `budgetReducer(state, action): BudgetState` and `initialBudgetState(today)` from `./budgetReducer`
  - `BudgetProvider`, `useBudget()` from `./BudgetProvider`

The reducer is a separate, pure module so P2, P3 and P8 are testable without rendering React. `BudgetProvider` is the thin React wrapper.

- [ ] **Step 1: Write the failing reducer test**

Create `react-native/apps/mobile/src/state/budgetReducer.test.ts`:

```ts
import { budgetReducer, initialBudgetState, canPersist } from './budgetReducer';
import { emptyStore, upsertEntry, monthsWithData } from '@monthly-budget/shared';

const TODAY = new Date(2026, 7, 26);
const init = () => initialBudgetState(TODAY);

describe('initial state (P2, P8)', () => {
  it('starts in loading, not ready', () => {
    expect(init().status).toBe('loading');
  });

  it('opens on the current month', () => {
    expect(init().monthKey).toBe('2026-08');
  });

  it('refuses to persist before loading finishes (P2)', () => {
    expect(canPersist(init())).toBe(false);
  });
});

describe('loaded', () => {
  const loaded = () =>
    budgetReducer(init(), { type: 'loaded', store: emptyStore(), notice: null });

  it('becomes ready', () => {
    expect(loaded().status).toBe('ready');
  });

  it('may persist once ready (P3)', () => {
    expect(canPersist(loaded())).toBe(true);
  });

  it('stays on the current month', () => {
    expect(loaded().monthKey).toBe('2026-08');
  });
});

describe('month navigation (P8)', () => {
  const ready = () => budgetReducer(init(), { type: 'loaded', store: emptyStore(), notice: null });

  it('steps back a month', () => {
    expect(budgetReducer(ready(), { type: 'goPrev' }).monthKey).toBe('2026-07');
  });

  it('crosses a year boundary backwards', () => {
    let s = ready();
    for (let i = 0; i < 8; i++) s = budgetReducer(s, { type: 'goPrev' });
    expect(s.monthKey).toBe('2025-12');
  });

  it('refuses to move into the future', () => {
    expect(budgetReducer(ready(), { type: 'goNext' }).monthKey).toBe('2026-08');
  });

  it('returns to the current month', () => {
    let s = budgetReducer(ready(), { type: 'goPrev' });
    s = budgetReducer(s, { type: 'goCurrent' });
    expect(s.monthKey).toBe('2026-08');
  });

  it('does not touch the store while navigating', () => {
    const before = ready();
    const after = budgetReducer(before, { type: 'goPrev' });
    expect(after.store).toBe(before.store);
  });
});

describe('entry actions', () => {
  const ready = () => budgetReducer(init(), { type: 'loaded', store: emptyStore(), notice: null });
  const entry = { id: 'a', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' };

  it('adds an entry to the displayed month', () => {
    const s = budgetReducer(ready(), { type: 'upsert', kind: 'expense', entry });
    expect(monthsWithData(s.store)).toEqual(['2026-08']);
  });

  it('adds to the DISPLAYED month, not always the current one', () => {
    let s = budgetReducer(ready(), { type: 'goPrev' });
    s = budgetReducer(s, { type: 'upsert', kind: 'expense', entry: { ...entry, date: '2026-07-01' } });
    expect(monthsWithData(s.store)).toEqual(['2026-07']);
  });

  it('removes an entry by id', () => {
    let s = budgetReducer(ready(), { type: 'upsert', kind: 'expense', entry });
    s = budgetReducer(s, { type: 'remove', kind: 'expense', id: 'a' });
    expect(monthsWithData(s.store)).toEqual([]);
  });

  it('IGNORES an entry action while still loading (P2)', () => {
    const s = budgetReducer(init(), { type: 'upsert', kind: 'expense', entry });
    expect(s.status).toBe('loading');
    expect(monthsWithData(s.store)).toEqual([]);
  });
});

describe('error handling (P7)', () => {
  const ready = () => budgetReducer(init(), { type: 'loaded', store: emptyStore(), notice: null });

  it('surfaces a save failure without discarding the user’s data', () => {
    let s = budgetReducer(ready(), {
      type: 'upsert',
      kind: 'expense',
      entry: { id: 'a', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' },
    });
    const withData = s.store;
    s = budgetReducer(s, { type: 'saveFailed', error: 'disk full' });
    expect(s.error).toContain('disk full');
    expect(s.store).toBe(withData);
  });

  it('clears the error on dismiss', () => {
    let s = budgetReducer(ready(), { type: 'saveFailed', error: 'disk full' });
    s = budgetReducer(s, { type: 'dismissError' });
    expect(s.error).toBeNull();
  });

  it('carries a load notice so migration can be reported', () => {
    const s = budgetReducer(init(), {
      type: 'loaded',
      store: emptyStore(),
      notice: 'migrated',
    });
    expect(s.notice).toBe('migrated');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npm test -w @monthly-budget/mobile -- budgetReducer
```

Expected: FAIL, `Cannot find module './budgetReducer'`.

- [ ] **Step 3: Write the reducer**

Create `react-native/apps/mobile/src/state/budgetReducer.ts`:

```ts
import {
  currentMonthKey,
  isFutureKey,
  nextKey,
  prevKey,
  removeEntry,
  upsertEntry,
  type BudgetStore,
  type Entry,
  type EntryKind,
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
  | { type: 'remove'; kind: EntryKind; id: string }
  | { type: 'saveFailed'; error: string }
  | { type: 'dismissError' }
  | { type: 'dismissNotice' };

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

    case 'remove':
      if (!canPersist(state)) return state;
      return {
        ...state,
        store: removeEntry(state.store, state.monthKey, action.kind, action.id),
      };

    case 'saveFailed':
      // The store is deliberately left alone: the user's work stays on screen
      // so they can retry, rather than vanishing along with the error.
      return { ...state, error: action.error };

    case 'dismissError':
      return { ...state, error: null };

    case 'dismissNotice':
      return { ...state, notice: null };

    default:
      return state;
  }
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npm test -w @monthly-budget/mobile -- budgetReducer
```

Expected: all pass. Report the ACTUAL count -- do not reconcile it against any number in this plan.

- [ ] **Step 5: Write the React wrapper**

Create `react-native/apps/mobile/src/state/BudgetProvider.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  expensesByCategoryForMonth,
  getMonth,
  totalsForMonth,
  type Entry,
  type EntryKind,
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
  dismissError(): void;
  dismissNotice(): void;
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
      dismissError: () => dispatch({ type: 'dismissError' }),
      dismissNotice: () => dispatch({ type: 'dismissNotice' }),
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
```

- [ ] **Step 6: Verify it typechecks**

```bash
npm run typecheck -w @monthly-budget/mobile
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/state/budgetReducer.ts \
        react-native/apps/mobile/src/state/budgetReducer.test.ts \
        react-native/apps/mobile/src/state/BudgetProvider.tsx
git commit -m "feat(mobile): make one provider the sole owner of budget state

The state machine lives in a pure reducer so the guarantees are testable
without rendering React. canPersist() is the init guard in one place: the old
app saved from an effect that fired on mount with an empty initial state,
racing the load, which is how stored data could be overwritten with nothing.

Entry actions are ignored while loading for the same reason -- an edit
arriving early would be built on an empty store and then persisted over the
real data. A save failure deliberately leaves the store untouched so the
user's work stays on screen to retry.

Navigation refuses to enter a future month, and never touches the store.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Rewire `App.tsx` — delete the competing hooks

**Files:**
- Modify: `react-native/apps/mobile/src/App.tsx`
- Modify: `react-native/apps/mobile/src/ReactNativeAdapter.ts`

**Interfaces:**
- Consumes: `BudgetProvider`, `useBudget` from `./state/BudgetProvider`
- Produces: an app whose displayed figures belong to one month and whose data survives a restart

This is the task that actually removes F12 and F1 from the shipping app. **The UI layout is not redesigned** — that is Phases 3–5. Only the data plumbing changes.

- [ ] **Step 1: Record what must not change**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
grep -c "" apps/mobile/src/App.tsx
grep -nE "budget\.(incomes|expenses)|totals\(|expensesByCategory\(" apps/mobile/src/App.tsx
```

Record the output. There are 5 data read sites and 2 aggregate calls; every one must end up reading the displayed month.

- [ ] **Step 2: Delete the four competing hooks and both storage functions**

In `apps/mobile/src/App.tsx`, delete all of:
- the `useEffect` that calls `adapter.loadFromStorage()`
- the `useEffect` that calls `adapter.saveToStorage(budget)`
- the `useEffect` that calls `loadBudgetData()`
- the `useEffect` that calls `saveBudgetData()`
- the `saveBudgetData` function
- the `loadBudgetData` function
- the `import AsyncStorage from '@react-native-async-storage/async-storage'` line, now unused

Also delete the `useState<BudgetDoc>` that held `budget`.

- [ ] **Step 3: Read from the provider instead**

Replace the deleted state with a call to the hook, at the top of the component:

```tsx
  const {
    status, monthKey, month, totals: stats, byCategory: categoryStats,
    store, error, notice,
    goPrev, goNext, goCurrent, upsert, remove, dismissError, dismissNotice,
  } = useBudget();
```

Then update every read site found in Step 1:
- `budget.incomes` → `month.incomes`
- `budget.expenses` → `month.expenses`
- `totals(budget.incomes, budget.expenses)` → delete; `stats` above already holds it
- `expensesByCategory(budget.expenses)` → delete; `categoryStats` above already holds it
- `budget.meta.year` / `budget.meta.month` → derive from `monthKey` (it is `"YYYY-MM"`; use `monthKey.slice(0, 4)` and `monthKey.slice(5, 7)`, or `monthLabel(monthKey, store.locale)` where a label is wanted)
- any `setBudget(...)` that added an entry → `upsert(kind, entry)`; any that removed one → `remove(kind, id)`

Entries now require an `id` and a `date`. Use `makeId()` from `@monthly-budget/shared` for the id, and build the date from `monthKey` plus the chosen day.

- [ ] **Step 4: Wrap the app in the provider**

The exported component must render `BudgetProvider` around the existing screen tree. Rename the current default-exported component to `BudgetScreen` (do not otherwise change it), and add:

```tsx
export default function App() {
  return (
    <BudgetProvider>
      <BudgetScreen />
    </BudgetProvider>
  );
}
```

- [ ] **Step 5: Show loading, errors and notices**

Inside `BudgetScreen`, before the main tree:
- when `status === 'loading'`, render a simple centred `<Text>{t('status.loading', store.locale)}</Text>`
- when `error` is set, render a dismissible banner using `t('status.saveFailed', store.locale)` and the raw `error` text, with a button calling `dismissError()`
- when `notice === 'migrated'`, render a dismissible banner using `t('status.migrated', store.locale)` calling `dismissNotice()`
- when `notice === 'corrupt'`, use `t('status.loadCorrupt', store.locale)`

**This is the visible half of P7.** An error that only reaches `console.error` is invisible on a release build.

- [ ] **Step 6: Strip the adapter's private storage**

In `apps/mobile/src/ReactNativeAdapter.ts`, delete `STORAGE_KEY`, `loadFromStorage`, `saveToStorage`, and the `AsyncStorage.setItem` call inside `openJSON`. The adapter keeps only file open/save/export — persistence belongs to `storage.ts` now. Remove the now-unused `AsyncStorage` import.

- [ ] **Step 7: Verify**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager/react-native"
npm run typecheck -w @monthly-budget/mobile
npm test -w @monthly-budget/mobile
npm test -w @monthly-budget/shared
npx tsc --noEmit -p apps/desktop/tsconfig.json
grep -c "AsyncStorage" apps/mobile/src/App.tsx
grep -rn "budget_data\|current_budget" apps/mobile/src/ --include=*.tsx --include=*.ts | grep -v keys.ts
```

Expected: all typechecks and tests pass; `0` AsyncStorage references in `App.tsx`; no rival storage key referenced anywhere outside `keys.ts`.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/melwa/OneDrive/Documents/GitHub/Monthly-Budget-Manager"
git add react-native/apps/mobile/src/App.tsx react-native/apps/mobile/src/ReactNativeAdapter.ts
git commit -m "fix(mobile): one owner for budget state, scoped to the shown month

Deletes the four competing effects and the two rival storage keys. The app
previously loaded from both keys on mount and saved to both on every change,
so whichever call resolved last won -- and an unguarded save could fire with
the empty initial state before the load returned, overwriting real data.

Figures on screen now belong to the displayed month instead of summing every
entry ever loaded, and save failures reach the user as a banner instead of
console.error, which is invisible on a release build.

The UI layout is untouched; only the data plumbing changed. Screens are
rebuilt in later phases.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of Done for Phase 2

- [ ] One storage key; no reference to `budget_data` or `@MonthlyBudget:current_budget` outside `keys.ts`
- [ ] All eight guarantees P1–P8 have a test that fails on regression
- [ ] `npm test -w @monthly-budget/mobile` passes with 90%+ coverage on `state/` and `i18n/`
- [ ] `npm test -w @monthly-budget/shared` still passes at 198 tests, unmodified
- [ ] `npx tsc --noEmit -p apps/desktop/tsconfig.json` exits 0
- [ ] A v0 payload migrates with a backup written first, and does not migrate twice
- [ ] Corrupt data yields an explicit error and is preserved, not deleted
- [ ] A save failure surfaces in the UI, not only in `console.error`
- [ ] The app opens on the current month and every stored month is reachable

## What is NOT in this plan

- **Phase 3** — the month bar and month screen; charts reading the displayed month
- **Phase 4** — the multiple-choice add-entry screen
- **Phase 5** — the comparison tab and grouped bar chart
- **Phase 6** — recurring-items UI. Note the carried finding: `upsertEntry` does not validate `entry.date`, and `recurring.ts` compares raw date strings, so date validation must land with the entry screen.
- Rendering tests for `App.tsx`, which need a device harness rather than `testEnvironment: node`.
