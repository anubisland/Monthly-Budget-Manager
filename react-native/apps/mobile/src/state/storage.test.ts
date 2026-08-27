import { loadStore, saveStore, isUsable } from './storage';
import { MemoryKV } from './kv';
import { STORE_KEY, BACKUP_KEY, CORRUPT_KEY, LEGACY_KEYS } from './keys';
import { emptyStore, upsertEntry, monthsWithData, totalsForMonth, dismissSuggestion } from '@monthly-budget/shared';

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

  it('reports how many amounts the migration altered', async () => {
    const withRefund = {
      meta: { year: 2026, month: 8 },
      incomes: [],
      expenses: [{ name: 'Refund', category: 'Food', amount: -40, date: '2026-08-02' }],
    };
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(withRefund) });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('migrated');
    expect(r.amountsAltered).toBe(1);
  });

  it('reports amountsAltered: 0 when nothing needed clamping', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('migrated');
    expect(r.amountsAltered).toBe(0);
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

describe('loadStore — migration write failure does not destroy legacy data', () => {
  it('leaves the legacy payload readable when the write during migration fails', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    kv.failWrites = 'disk full';
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    // The legacy payload must still be there -- nothing was ever removed,
    // because removal only happens after a successful migration write.
    expect(await kv.getItem(LEGACY_KEYS[0])).toBe(JSON.stringify(V0));
  });
});

describe('loadStore — never throws for hostile input', () => {
  const cases: Array<[string, string]> = [
    ['unparseable text', '{not json'],
    ['the string "null"', 'null'],
    ['an empty array', '[]'],
    ['a bare number', '42'],
    ['a JSON object that is not a store', '{"foo":"bar"}'],
  ];

  it.each(cases)('does not throw for %s', async (_label, raw) => {
    const kv = new MemoryKV({ [STORE_KEY]: raw });
    await expect(loadStore(kv, { today: TODAY })).resolves.toBeDefined();
    const r = await loadStore(new MemoryKV({ [STORE_KEY]: raw }), { today: TODAY });
    expect(['loaded', 'corrupt', 'empty', 'migrated']).toContain(r.status);
    expect(() => monthsWithData(r.store)).not.toThrow();
  });

  it('does not throw when the read itself rejects', async () => {
    const kv = new MemoryKV();
    kv.failReads = 'device unavailable';
    await expect(loadStore(kv, { today: TODAY })).resolves.toBeDefined();
  });
});

describe('loadStore — FIX A: isUsable must validate shape, not just "did not throw"', () => {
  it('does not report a month with incomes but no expenses key as loaded', async () => {
    const raw = JSON.stringify({
      version: 1,
      currency: 'SAR',
      locale: 'ar',
      recurring: [],
      months: {
        '2026-08': {
          incomes: [{ id: 'a', name: 'x', category: 'salary', amount: 100, date: '2026-08-01' }],
        },
      },
    });
    const kv = new MemoryKV({ [STORE_KEY]: raw });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(() => totalsForMonth(r.store, '2026-08')).not.toThrow();
  });

  it('does not report a month with expenses but no incomes key as loaded', async () => {
    const raw = JSON.stringify({
      version: 1,
      currency: 'SAR',
      locale: 'ar',
      recurring: [],
      months: {
        '2026-08': {
          expenses: [{ id: 'a', name: 'x', category: 'housing', amount: 100, date: '2026-08-01' }],
        },
      },
    });
    const kv = new MemoryKV({ [STORE_KEY]: raw });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(() => totalsForMonth(r.store, '2026-08')).not.toThrow();
  });

  it('catches a month whose incomes is present but not an array', async () => {
    const raw = JSON.stringify({
      version: 1,
      currency: 'SAR',
      locale: 'ar',
      recurring: [],
      months: {
        '2026-08': { incomes: 'nope', expenses: [] },
      },
    });
    const kv = new MemoryKV({ [STORE_KEY]: raw });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
  });

  it('still loads a well-formed store with a genuinely empty month', async () => {
    const raw = JSON.stringify({
      version: 1,
      currency: 'SAR',
      locale: 'ar',
      recurring: [],
      months: {
        '2026-08': { incomes: [], expenses: [] },
      },
    });
    const kv = new MemoryKV({ [STORE_KEY]: raw });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('loaded');
  });

  it('catches a month value that is not an object at all', async () => {
    const raw = JSON.stringify({
      version: 1,
      currency: 'SAR',
      locale: 'ar',
      recurring: [],
      months: { '2026-08': 'not a month record' },
    });
    const kv = new MemoryKV({ [STORE_KEY]: raw });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
  });

  it('reaches corrupt for a v1-tagged store with a malformed per-month record', async () => {
    const raw = JSON.stringify({ version: 1, months: { '2026-08': {} }, recurring: [] });
    const kv = new MemoryKV({ [STORE_KEY]: raw });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(r.error).toContain('not a usable budget store');
  });
});

describe('loadStore — FIX B: a cleanup failure must not discard a completed migration', () => {
  it('reports migrated (not corrupt) when only removeItem fails, and keeps the correct months', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    const originalRemove = kv.removeItem.bind(kv);
    kv.removeItem = async () => {
      throw new Error('remove failed');
    };
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('migrated');
    expect(monthsWithData(r.store)).toEqual(['2026-07', '2026-08']);
    // restore so later assertions in this test (if any) use real behaviour
    kv.removeItem = originalRemove;
  });

  it('does not re-migrate on the next launch after a cleanup failure', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    kv.removeItem = async () => {
      throw new Error('remove failed');
    };
    await loadStore(kv, { today: TODAY });
    kv.removeItem = MemoryKV.prototype.removeItem.bind(kv);
    const second = await loadStore(kv, { today: TODAY });
    expect(second.status).toBe('loaded');
    expect(totalsForMonth(second.store, '2026-08').expenses).toBe(1500);
  });

  it('still reports corrupt when the STORE_KEY write itself fails, and legacy data stays readable', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    kv.failWrites = 'disk full';
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(await kv.getItem(LEGACY_KEYS[0])).toBe(JSON.stringify(V0));
  });
});

describe('loadStore — FIX C: corrupt payload AND preserve-write both fail', () => {
  it('composes an error mentioning both failures and still returns a usable store', async () => {
    const kv = new MemoryKV({ [STORE_KEY]: '{not json' });
    kv.failWrites = 'disk full';
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(r.error).toContain('disk full');
    expect(() => monthsWithData(r.store)).not.toThrow();
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

// The remaining guards need a KVStore that fails SELECTIVELY. MemoryKV's
// failReads/failWrites are global, so the very first getItem short-circuits
// and these paths were previously written off as unreachable. They are not.
function selective(
  inner: MemoryKV,
  fail: (op: 'get' | 'set' | 'remove', key: string) => string | null,
) {
  return {
    getItem: async (k: string) => {
      const m = fail('get', k);
      if (m) throw new Error(m);
      return inner.getItem(k);
    },
    setItem: async (k: string, v: string) => {
      const m = fail('set', k);
      if (m) throw new Error(m);
      return inner.setItem(k, v);
    },
    removeItem: async (k: string) => {
      const m = fail('remove', k);
      if (m) throw new Error(m);
      return inner.removeItem(k);
    },
  };
}

describe('selective backend failures', () => {
  it('reports a legacy-key read failure instead of pretending storage is empty', async () => {
    // STORE_KEY reads fine and is absent; the legacy read then fails.
    const kv = selective(new MemoryKV(), (op, k) =>
      op === 'get' && k === LEGACY_KEYS[0] ? 'legacy read error' : null,
    );
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(r.error).toContain('legacy read error');
    expect(() => monthsWithData(r.store)).not.toThrow();
  });

  it('composes both errors when preserving a corrupt payload also fails', async () => {
    const inner = new MemoryKV({ [STORE_KEY]: '{not json' });
    const kv = selective(inner, (op, k) =>
      op === 'set' && k === CORRUPT_KEY ? 'disk full' : null,
    );
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(r.error).toMatch(/could not be preserved/);
    expect(r.error).toContain('disk full');
    expect(() => monthsWithData(r.store)).not.toThrow();
  });
});

describe('month-shape validation rejects every broken form', () => {
  const wrap = (m: unknown) =>
    JSON.stringify({ version: 1, currency: 'SAR', locale: 'ar', recurring: [], months: { '2026-08': m } });

  it.each([
    ['a string', 'nope'],
    ['null', null],
    ['an array', []],
    ['a number', 7],
    ['incomes not an array', { incomes: 'x', expenses: [] }],
    ['expenses not an array', { incomes: [], expenses: 'x' }],
    ['incomes missing', { expenses: [] }],
    ['expenses missing', { incomes: [] }],
  ])('rejects a month that is %s', async (_label, month) => {
    const r = await loadStore(new MemoryKV({ [STORE_KEY]: wrap(month) }), { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(() => totalsForMonth(r.store, '2026-08')).not.toThrow();
  });

  it('still accepts a genuinely empty month', async () => {
    const r = await loadStore(new MemoryKV({ [STORE_KEY]: wrap({ incomes: [], expenses: [] }) }), { today: TODAY });
    expect(r.status).toBe('loaded');
  });
});

// isUsable is a standalone guard. loadStore can only reach its per-month check,
// because migrateV0toV1 validates version/months/recurring before it is called
// -- so the outer guards are exercised here directly rather than left as dead
// branches in a module that decides whether user data is readable.
describe('isUsable as a standalone guard', () => {
  const ok = { version: 1, currency: 'SAR', locale: 'ar', recurring: [], months: {} };

  it('accepts a well-formed store', () => {
    expect(isUsable(ok)).toBe(true);
    expect(isUsable({ ...ok, months: { '2026-08': { incomes: [], expenses: [] } } })).toBe(true);
  });

  it.each([
    ['a string', 'nope'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an array', []],
  ])('rejects %s', (_l, v) => {
    expect(isUsable(v)).toBe(false);
  });

  it('rejects a wrong or missing version', () => {
    expect(isUsable({ ...ok, version: 2 })).toBe(false);
    expect(isUsable({ ...ok, version: undefined })).toBe(false);
  });

  it('rejects a months value that is not a plain object', () => {
    expect(isUsable({ ...ok, months: null })).toBe(false);
    expect(isUsable({ ...ok, months: [] })).toBe(false);
    expect(isUsable({ ...ok, months: 'x' })).toBe(false);
  });

  it('rejects a recurring value that is not an array', () => {
    expect(isUsable({ ...ok, recurring: null })).toBe(false);
    expect(isUsable({ ...ok, recurring: {} })).toBe(false);
  });
});

// Validating the array CONTAINERS but not their ELEMENTS reproduces the very
// bug the month-shape check exists to stop, one level deeper. A null element
// crashes on the next totals call; a non-finite amount is worse -- it sums as
// zero, so a real expense silently vanishes from the total with no error.
describe('entry-level validation', () => {
  const wrap = (m: unknown) =>
    JSON.stringify({ version: 1, currency: 'SAR', locale: 'ar', recurring: [], months: { '2026-08': m } });
  const good = { id: 'a', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' };

  it.each([
    ['a null element', [null]],
    ['an undefined element', [undefined]],
    ['a string element', ['nope']],
    ['a nested array', [[]]],
    ['a non-numeric amount', [{ ...good, amount: 'abc' }]],
    ['a NaN amount', [{ ...good, amount: Number.NaN }]],
    ['an Infinity amount', [{ ...good, amount: Number.POSITIVE_INFINITY }]],
    ['a missing amount', [{ id: 'a', name: 'R', category: 'housing', date: '2026-08-01' }]],
    ['a missing date', [{ id: 'a', name: 'R', category: 'housing', amount: 1 }]],
    ['a missing id', [{ name: 'R', category: 'housing', amount: 1, date: '2026-08-01' }]],
  ])('rejects a month whose expenses contain %s', async (_label, expenses) => {
    const r = await loadStore(new MemoryKV({ [STORE_KEY]: wrap({ incomes: [], expenses }) }), { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(() => totalsForMonth(r.store, '2026-08')).not.toThrow();
  });

  it('applies the same check to incomes', async () => {
    const r = await loadStore(new MemoryKV({ [STORE_KEY]: wrap({ incomes: [null], expenses: [] }) }), { today: TODAY });
    expect(r.status).toBe('corrupt');
  });

  it('still accepts well-formed entries', async () => {
    const r = await loadStore(new MemoryKV({ [STORE_KEY]: wrap({ incomes: [], expenses: [good] }) }), { today: TODAY });
    expect(r.status).toBe('loaded');
    expect(totalsForMonth(r.store, '2026-08').expenses).toBe(1500);
  });

  it('accepts an amount of exactly zero, which is legitimate', async () => {
    const r = await loadStore(new MemoryKV({ [STORE_KEY]: wrap({ incomes: [], expenses: [{ ...good, amount: 0 }] }) }), { today: TODAY });
    expect(r.status).toBe('loaded');
  });
});

describe('isUsable asserts no more than it verifies', () => {
  const ok = { version: 1, currency: 'SAR', locale: 'ar', recurring: [], months: {} };

  it('rejects a non-string currency', () => {
    expect(isUsable({ ...ok, currency: 123 })).toBe(false);
    expect(isUsable({ ...ok, currency: undefined })).toBe(false);
  });

  it('rejects a locale outside the declared union', () => {
    expect(isUsable({ ...ok, locale: 'fr' })).toBe(false);
    expect(isUsable({ ...ok, locale: undefined })).toBe(false);
  });
});

describe('cleanup failure leaves a diagnostic trail', () => {
  it('reports a warning without downgrading the migrated status', async () => {
    const inner = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    const kv = selective(inner, (op) => (op === 'remove' ? 'remove failed' : null));
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('migrated');
    expect(r.warning).toContain('legacy cleanup failed');
    expect(r.warning).toContain('remove failed');
    expect(r.error).toBeUndefined();
  });

  it('sets no warning when cleanup succeeds', async () => {
    const kv = new MemoryKV({ [LEGACY_KEYS[0]]: JSON.stringify(V0) });
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('migrated');
    expect(r.warning).toBeUndefined();
  });
});

// A payload this version does not understand must never be mistaken for an
// empty budget. migrateV0toV1 returns an empty store for anything it cannot
// recognise, and an empty store passes isUsable trivially -- so validating only
// its OUTPUT let a future-format store load as blank, unflagged and
// unpreserved, after which the first autosave destroyed the original.
describe('unrecognised payloads are never mistaken for an empty budget', () => {
  const futureStore = JSON.stringify({
    version: 2, currency: 'SAR', locale: 'ar', recurring: [],
    months: { '2026-08': { incomes: [], expenses: [{ id: 'a', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' }] } },
  });

  it('routes a future-version store to corrupt, not loaded', async () => {
    const r = await loadStore(new MemoryKV({ [STORE_KEY]: futureStore }), { today: TODAY });
    expect(r.status).toBe('corrupt');
  });

  it('preserves it rather than letting the next save destroy it', async () => {
    const kv = new MemoryKV({ [STORE_KEY]: futureStore });
    await loadStore(kv, { today: TODAY });
    expect(await kv.getItem(CORRUPT_KEY)).toBe(futureStore);
  });

  it.each([
    ['arbitrary JSON', '{"foo":"bar"}'],
    ['a bare array', '[]'],
    ['a bare number', '42'],
    ['a JSON null', 'null'],
    ['version 0', '{"version":0,"months":{},"recurring":[]}'],
  ])('routes %s to corrupt', async (_label, payload) => {
    const r = await loadStore(new MemoryKV({ [STORE_KEY]: payload }), { today: TODAY });
    expect(r.status).toBe('corrupt');
  });

  it('still loads a genuine v1 store', async () => {
    const kv = new MemoryKV({ [STORE_KEY]: JSON.stringify(v1Fixture()) });
    expect((await loadStore(kv, { today: TODAY })).status).toBe('loaded');
  });
});

// Finding 4: the pre-existing failure test used MemoryKV.failWrites, which is
// global, so the BACKUP_KEY write threw first and the STORE_KEY write was never
// reached. The scenario the P6 ordering exists for -- backup lands, store write
// fails -- had no coverage at all.
describe('backup survives when only the store write fails', () => {
  it('keeps the legacy originals and the backup readable', async () => {
    const raw = JSON.stringify(V0);
    const inner = new MemoryKV({ [LEGACY_KEYS[0]]: raw });
    const kv = selective(inner, (op, k) => (op === 'set' && k === STORE_KEY ? 'disk full' : null));
    const r = await loadStore(kv, { today: TODAY });
    expect(r.status).toBe('corrupt');
    expect(await inner.getItem(BACKUP_KEY)).toBe(raw);   // backup landed first
    expect(await inner.getItem(LEGACY_KEYS[0])).toBe(raw); // originals untouched
  });

  it('recovers on the next launch once writes work again', async () => {
    const raw = JSON.stringify(V0);
    const inner = new MemoryKV({ [LEGACY_KEYS[0]]: raw });
    let failing = true;
    const kv = selective(inner, (op, k) => (failing && op === 'set' && k === STORE_KEY ? 'disk full' : null));
    await loadStore(kv, { today: TODAY });
    failing = false;
    const second = await loadStore(kv, { today: TODAY });
    expect(second.status).toBe('migrated');
    expect(monthsWithData(second.store)).toEqual(['2026-07', '2026-08']);
  });
});

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
