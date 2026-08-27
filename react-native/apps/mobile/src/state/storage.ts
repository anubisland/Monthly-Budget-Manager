import {
  emptyStore,
  migrateV0toV1,
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
  /** Non-fatal diagnostic. Set when the migration succeeded but cleanup did not. */
  warning?: string;
}

/**
 * A single entry. Validating the array CONTAINERS but not their elements
 * reproduces the very bug this guard exists to stop, one level deeper: a
 * months map holding `incomes: [null]` passes a container-only check, loads as
 * 'loaded', and then throws on `r.amount` the first time totals are computed.
 * A non-finite amount is worse than a crash -- it silently sums as zero, so a
 * real expense vanishes from the total with no error anywhere.
 */
function isValidEntry(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return false;
  }
  const e = candidate as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    typeof e.category === 'string' &&
    typeof e.date === 'string' &&
    typeof e.amount === 'number' &&
    Number.isFinite(e.amount)
  );
}

function isMonthEntry(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return false;
  }
  const m = candidate as Record<string, unknown>;
  return (
    Array.isArray(m.incomes) &&
    m.incomes.every(isValidEntry) &&
    Array.isArray(m.expenses) &&
    m.expenses.every(isValidEntry)
  );
}

/**
 * A store is only trustworthy if its shape actually matches `BudgetStore`.
 *
 * Previously this ran `monthsWithData()` and trusted the result whenever it
 * didn't throw. That is too shallow: `monthsWithData` reads
 * `m.incomes.length > 0 || m.expenses.length > 0`, a short-circuiting OR, so
 * a month with a non-empty `incomes` and no `expenses` key at all never
 * touches `expenses` and slips through. The store then reports `'loaded'`
 * and the very next `totalsForMonth` call throws trying to `.reduce` over
 * the missing array -- a crash reported as a successful load. Validating
 * the shape explicitly, field by field, closes that gap.
 */
/**
 * Exported so it can be tested directly. Reaching every guard here through
 * loadStore is impossible -- migrateV0toV1 already validates version, months
 * and recurring, so only the per-month depth below can fail via that route.
 * The outer guards stay as defence in depth for any other caller.
 */
export function isUsable(candidate: unknown): candidate is BudgetStore {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const c = candidate as Record<string, unknown>;
  if (c.version !== 1) return false;
  if (typeof c.months !== 'object' || c.months === null || Array.isArray(c.months)) return false;
  if (!Array.isArray(c.recurring)) return false;
  // Declared as `candidate is BudgetStore`, so it must not assert more than it
  // verifies -- currency and locale are required fields of that type.
  if (typeof c.currency !== 'string') return false;
  if (c.locale !== 'ar' && c.locale !== 'en') return false;
  // `dismissed` postdates this field: every store already on a device
  // predates it, so its absence must still load. A present value must be a
  // map of arrays -- reject anything else rather than trusting it blindly.
  if (c.dismissed !== undefined) {
    if (typeof c.dismissed !== 'object' || c.dismissed === null || Array.isArray(c.dismissed)) {
      return false;
    }
    for (const v of Object.values(c.dismissed as Record<string, unknown>)) {
      if (!Array.isArray(v)) return false;
    }
  }
  return Object.values(c.months as Record<string, unknown>).every(isMonthEntry);
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
      const { store, migrated } = migrateV0toV1(parsed, { today: opts?.today });
      // Checking only the OUTPUT is not enough. migrateV0toV1 returns an empty
      // store for anything it does not recognise, and an empty store passes
      // isUsable trivially -- so a payload written by a FUTURE version of the
      // app (version: 2) would load as an empty budget with no error, and the
      // first autosave would then overwrite the real data. The raw payload has
      // to be vouched for as well: a genuine v1 store satisfies isUsable(parsed),
      // and a v0 document comes back with migrated === true. Anything else fell
      // through to emptyStore() and belongs on the corrupt path, where it is
      // preserved rather than silently replaced.
      if (isUsable(store) && (migrated || isUsable(parsed))) {
        return { status: 'loaded', store };
      }
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
    // NOTE: with the current test double (MemoryKV), this catch is
    // unreachable in practice -- `failReads` is a single global flag, so a
    // Exercised by the selective-failure test: a backend can fail this read
    // while the STORE_KEY read above succeeded -- one legacy key readable and
    // another not. Reporting that is better than treating an unreadable device
    // as an empty one, which would present a first-run experience to someone
    // who has data.
    legacy = await readLegacy(kv);
  } catch (e) {
    return { status: 'corrupt', store: fresh(), error: String(e) };
  }

  if (!legacy) return { status: 'empty', store: fresh() };

  let store: BudgetStore;
  let entriesMoved: number | undefined;
  try {
    const migrated = migrateV0toV1(JSON.parse(legacy.raw), { today: opts?.today });
    store = migrated.store;
    entriesMoved = migrated.entriesMoved;
    // P6: the backup lands BEFORE the new store. If the write of the store
    // fails, the untouched originals plus the backup are still on the device.
    await kv.setItem(BACKUP_KEY, migrated.backup);
    await kv.setItem(STORE_KEY, JSON.stringify(migrated.store));
  } catch (e) {
    let error = String(e);
    try {
      await kv.setItem(CORRUPT_KEY, legacy.raw);
    } catch (preserveError) {
      error = `${error} (and the corrupt payload could not be preserved: ${preserveError})`;
    }
    return { status: 'corrupt', store: fresh(), error };
  }

  // Cleanup is a separate concern from the durable write above: by this
  // point BACKUP_KEY and STORE_KEY both hold the migrated data, so the
  // migration has already succeeded. A failure removing the legacy keys
  // must not downgrade that outcome -- on the next launch STORE_KEY exists,
  // so the legacy keys are never read again and any stale copy left behind
  // is harmless.
  const cleanupErrors: string[] = [];
  for (const key of LEGACY_KEYS) {
    try {
      await kv.removeItem(key);
    } catch (e) {
      // Must not downgrade a migration that already landed durably -- but
      // discarding the text entirely would leave no trace that cleanup ever
      // failed, which is the silent-failure pattern this project forbids.
      cleanupErrors.push(`${key}: ${String(e)}`);
    }
  }
  return {
    status: 'migrated',
    store,
    entriesMoved,
    ...(cleanupErrors.length
      ? { warning: `legacy cleanup failed: ${cleanupErrors.join('; ')}` }
      : {}),
  };
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
