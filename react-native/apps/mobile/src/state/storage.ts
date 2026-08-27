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
