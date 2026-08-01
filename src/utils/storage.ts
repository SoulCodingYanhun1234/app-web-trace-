export type StorageKind = 'local' | 'session';

const memoryStorage: Record<StorageKind, Map<string, string>> = {
  local: new Map<string, string>(),
  session: new Map<string, string>(),
};

function resolveStorage(kind: StorageKind): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probeKey = `__trace_storage_probe_${kind}__`;
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

export function safeStorageGet(kind: StorageKind, key: string): string | null {
  const storage = resolveStorage(kind);
  if (storage) {
    try {
      const value = storage.getItem(key);
      if (value !== null) memoryStorage[kind].set(key, value);
      return value;
    } catch {
      // Fall through to the in-memory compatibility store.
    }
  }
  return memoryStorage[kind].get(key) ?? null;
}

export function safeStorageSet(kind: StorageKind, key: string, value: string): void {
  memoryStorage[kind].set(key, String(value));
  const storage = resolveStorage(kind);
  if (!storage) return;
  try { storage.setItem(key, String(value)); } catch { /* memory fallback remains available */ }
}

export function safeStorageRemove(kind: StorageKind, key: string): void {
  memoryStorage[kind].delete(key);
  const storage = resolveStorage(kind);
  if (!storage) return;
  try { storage.removeItem(key); } catch { /* ignore unavailable storage */ }
}

export function safeStorageClear(kind: StorageKind): void {
  memoryStorage[kind].clear();
  const storage = resolveStorage(kind);
  if (!storage) return;
  try { storage.clear(); } catch { /* ignore unavailable storage */ }
}
