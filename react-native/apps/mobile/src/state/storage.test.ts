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
