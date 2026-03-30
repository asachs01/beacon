/**
 * Unified read/write helper for Beacon data persistence.
 *
 * Server (/beacon-data/:key) is the source of truth when running as an
 * HA add-on.  localStorage serves as an offline cache and as the primary
 * store during local development (no add-on server).
 */

function isAddOn(): boolean {
  return !!window.__BEACON_CONFIG__;
}

function getIngressBasePath(): string {
  return window.location.pathname.replace(/\/$/, '');
}

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
 * Write to localStorage AND server (fire-and-forget).
 */
export async function saveData<T>(key: string, data: T): Promise<void> {
  const json = JSON.stringify(data);
  try {
    localStorage.setItem(key, json);
  } catch {
    /* localStorage unavailable */
  }
  if (isAddOn()) {
    const base = getIngressBasePath();
    fetch(`${base}/beacon-data/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    }).catch(() => {
      /* server persistence is best-effort */
    });
  }
}
