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
