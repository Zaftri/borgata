// Thin wrapper around idb-keyval (design 01 §6: "Storage: IndexedDB through a thin wrapper"). The store is
// constructed with a `StorageAdapter` so tests can inject an in-memory one and never touch real IndexedDB.

import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from "idb-keyval";

export type StorageAdapter = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
};

/** The real adapter, backed by IndexedDB. Nothing touches IndexedDB until a method is actually called. */
export function idbKeyvalAdapter(): StorageAdapter {
  return {
    get: <T,>(key: string) => idbGet<T>(key),
    set: (key, value) => idbSet(key, value),
    del: (key) => idbDel(key),
    keys: async () => (await idbKeys()).map(String),
  };
}

/** In-memory adapter for tests (and any environment without IndexedDB). */
export function memoryAdapter(): StorageAdapter {
  const map = new Map<string, unknown>();
  return {
    get: async <T,>(key: string) => map.get(key) as T | undefined,
    set: async (key, value) => {
      map.set(key, value);
    },
    del: async (key) => {
      map.delete(key);
    },
    keys: async () => [...map.keys()],
  };
}
