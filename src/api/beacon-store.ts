/**
 * Unified read/write helper for Beacon data persistence.
 *
 * Server (/beacon-data/:key) is the source of truth when running as an
 * HA add-on. localStorage serves as an offline cache and as the primary
 * store during local development (no add-on server). A rejected server
 * write never becomes a successful local-only write.
 */

import { getIngressBasePath, isAddOn } from '../utils/ha-env';
import { SaveFailedError, reportSaveFailed } from '../utils/save-errors';

/**
 * Read from server first, fall back to localStorage if the read fails.
 * In non-add-on mode, reads from localStorage only.
 */
export async function loadData<T>(key: string, fallback: T): Promise<T> {
  if (isAddOn()) {
    try {
      const base = getIngressBasePath();
      const res = await fetch(`${base}/beacon-data/${key}`);
      if (res.ok) {
        const data = await res.json();
        if (data === null) {
          clearLocalCache(key);
          return fallback;
        }
        writeLocalCache(key, JSON.stringify(data));
        return data as T;
      }
    } catch {
      /* fall through to localStorage */
    }
  }
  // Fall back to localStorage
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * The server's copy only: `ok: false` if it couldn't be read (unlike
 * loadData, which then falls back to this device's copy). `data` is null
 * when nothing is stored yet. Caches what it reads, like loadData.
 */
export async function loadServerData<T>(key: string): Promise<{ ok: true; data: T | null } | { ok: false }> {
  try {
    const res = await fetch(`${getIngressBasePath()}/beacon-data/${key}`);
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as T | null;
    if (data === null) clearLocalCache(key);
    else writeLocalCache(key, JSON.stringify(data));
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

/**
 * Read from localStorage only (synchronous, for initial render).
 * Used to provide instant data before the async server fetch completes.
 */
export function loadDataSync<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * Wait for the server to acknowledge the write before caching it. A beacon
 * only confirms that it was queued, not that the server accepted it.
 * keepalive allows small in-flight requests to finish on page close.
 */
export async function saveData<T>(key: string, data: T): Promise<void> {
  const json = serialize(key, data);
  if (isAddOn()) {
    await putServer(key, json);
    writeLocalCache(key, json);
  } else {
    writeLocalData(key, json);
  }
}

/**
 * Save only the changed fields of an object-valued key. The server merges
 * `patch` into its stored copy, so fields changed meanwhile on another
 * device are kept rather than overwritten by this device's copy of the
 * rest. `full` is cached locally only after the server accepts the patch.
 */
export async function saveDataPatch<T>(key: string, patch: Partial<T>, full: T): Promise<void> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
    || !full || typeof full !== 'object' || Array.isArray(full)) {
    throw saveFailed(key);
  }
  const json = serialize(key, patch);
  const fullJson = serialize(key, full);
  if (isAddOn()) {
    await putServer(key, json, true);
    writeLocalCache(key, fullJson);
  } else {
    writeLocalData(key, fullJson);
  }
}

function saveFailed(key: string): SaveFailedError {
  const err = new SaveFailedError(`a change to ${key}`);
  reportSaveFailed(err);
  return err;
}

function serialize(key: string, data: unknown): string {
  try {
    const json = JSON.stringify(data);
    if (typeof json === 'string') return json;
  } catch {
    // The write cannot be sent or cached.
  }
  throw saveFailed(key);
}

async function putServer(key: string, json: string, merge = false): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${getIngressBasePath()}/beacon-data/${key}${merge ? '?merge' : ''}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: new Blob([json]).size < 60_000,
    });
  } catch {
    throw saveFailed(key);
  }
  if (!res.ok) throw saveFailed(key);
}

function writeLocalCache(key: string, json: string): void {
  try {
    localStorage.setItem(key, json);
  } catch {
    /* localStorage unavailable */
  }
}

function clearLocalCache(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable */
  }
}

function writeLocalData(key: string, json: string): void {
  try {
    localStorage.setItem(key, json);
  } catch {
    throw saveFailed(key);
  }
}
