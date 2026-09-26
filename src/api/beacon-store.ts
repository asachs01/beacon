/**
 * Unified read/write helper for Beacon data persistence.
 *
 * Server (/beacon-data/:key) is the source of truth when running as an
 * HA add-on.  localStorage serves as an offline cache and as the primary
 * store during local development (no add-on server).
 */

import { getIngressBasePath, isAddOn } from '../utils/ha-env';

/**
 * Read from server first, fall back to localStorage.
 * In non-add-on mode, reads from localStorage only.
 */
export async function loadData<T>(key: string, fallback: T): Promise<T> {
  if (isAddOn()) {
    try {
      const base = getIngressBasePath();
      const res = await fetch(`${base}/beacon-data/${key}`);
      if (res.ok) {
        const data = await res.json();
        if (data !== null) {
          // Cache to localStorage for offline/speed
          localStorage.setItem(key, JSON.stringify(data));
          return data as T;
        }
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
    if (data !== null) writeLocalCache(key, JSON.stringify(data));
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

/**
 * Save and wait for the server to store it (true) — for a save that must
 * land before the next one reads. keepalive lets it finish if the page
 * closes, like sendBeacon, for bodies up to its 64 KB limit.
 */
export async function saveDataNow<T>(key: string, data: T): Promise<boolean> {
  const json = JSON.stringify(data);
  writeLocalCache(key, json);
  try {
    const res = await fetch(`${getIngressBasePath()}/beacon-data/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: json.length < 60_000,
    });
    return res.ok;
  } catch {
    return false;
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
 * Write to localStorage AND server (best-effort, but using sendBeacon for
 * reliable delivery).
 *
 * A plain fetch() here can be silently cut off if the page/device goes
 * away (power off, app kill) before the request completes — since the
 * server copy is treated as the source of truth on next load (for
 * multi-device sync), a lost write here means the NEXT boot re-fetches a
 * stale server value and overwrites the correct local one, effectively
 * reverting the change. navigator.sendBeacon is built specifically for
 * "this page may disappear any moment, but deliver this anyway" — the
 * browser queues it at the OS/process level rather than tying it to the
 * page's lifetime, so it reliably survives a close/reload/power-off in a
 * way fetch does not.
 */
export async function saveData<T>(key: string, data: T): Promise<void> {
  const json = JSON.stringify(data);
  writeLocalCache(key, json);
  if (isAddOn()) sendToServer(`/beacon-data/${key}`, json);
}

/**
 * Save only the changed fields of an object-valued key. The server merges
 * `patch` into its stored copy, so fields changed meanwhile on another
 * device are kept rather than overwritten by this device's (possibly
 * stale) copy of the rest. `full` is this device's merged value, cached
 * locally for the next initial render.
 */
export async function saveDataPatch<T extends object>(key: string, patch: Partial<T>, full: T): Promise<void> {
  writeLocalCache(key, JSON.stringify(full));
  if (isAddOn()) sendToServer(`/beacon-data/${key}?merge`, JSON.stringify(patch));
}

function writeLocalCache(key: string, json: string): void {
  try {
    localStorage.setItem(key, json);
  } catch {
    /* localStorage unavailable */
  }
}

function sendToServer(path: string, json: string): void {
  const url = `${getIngressBasePath()}${path}`;
  const delivered = 'sendBeacon' in navigator
    ? navigator.sendBeacon(url, new Blob([json], { type: 'application/json' }))
    : false;
  if (!delivered) {
    // sendBeacon unsupported, or its queue was full (payload too large /
    // too many pending beacons) — fall back to a normal fetch.
    fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    }).catch(() => {
      /* server persistence is best-effort */
    });
  }
}
