import { MemoryKV, asyncStorageKV } from './kv';
import { STORE_KEY, BACKUP_KEY, CORRUPT_KEY, LEGACY_KEYS } from './keys';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

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

describe('asyncStorageKV', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates getItem to AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('test');
    const result = await asyncStorageKV.getItem('key');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('key');
    expect(result).toBe('test');
  });

  it('delegates setItem to AsyncStorage', async () => {
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    await asyncStorageKV.setItem('key', 'value');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('key', 'value');
  });

  it('delegates removeItem to AsyncStorage', async () => {
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    await asyncStorageKV.removeItem('key');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('key');
  });
});
