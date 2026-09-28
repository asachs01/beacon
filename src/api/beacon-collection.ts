/**
 * Client for the server-side atomic collection API (/beacon-collection/*).
 *
 * Unlike beacon-store.ts's whole-blob loadData/saveData, additions,
 * updates and deletes here are performed BY THE SERVER against its own
 * on-disk copy, serialized per collection — so two devices editing
 * concurrently can no longer silently clobber each other's changes the
 * way a client-side fetch-modify-save-the-whole-array pattern could.
 *
 * In standalone/dev mode (no add-on server), falls back to the same
 * read-modify-write pattern against localStorage directly — there's only
 * one "device" in that context, so the race this API exists to prevent
 * doesn't apply there.
 *
 * In add-on mode a write the server didn't take throws SaveFailedError
 * (and reports it, for App's notice). It used to be written to this
 * device's local cache instead and reported as saved — until the next
 * read replaced that cache with the server's copy, silently undoing it.
 */

import { getIngressBasePath, isAddOn } from '../utils/ha-env';
import { SaveFailedError, reportSaveFailed } from '../utils/save-errors';

function saveFailed(name: string): SaveFailedError {
  const err = new SaveFailedError(`a change to ${name}`);
  reportSaveFailed(err);
  return err;
}

interface HasId {
  id?: string;
}

function withoutMemberPin<T>(item: T): T {
  if (!item || typeof item !== 'object') return item;
  const safe = { ...item } as Record<string, unknown>;
  delete safe.pin;
  delete safe.pin_hash;
  return safe as T;
}

function readLocal<T>(name: string): T[] {
  try {
    const raw = localStorage.getItem(name);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (name === 'beacon_family_members' && parsed.some((item) =>
          item && typeof item === 'object' && ('pin' in item || 'pin_hash' in item))) {
          const safe = parsed.map(withoutMemberPin) as T[];
          writeLocal(name, safe);
          return safe;
        }
        return parsed as T[];
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeLocal<T>(name: string, items: T[]): void {
  try {
    const safe = name === 'beacon_family_members'
      ? items.map(withoutMemberPin)
      : items;
    localStorage.setItem(name, JSON.stringify(safe));
  } catch (err) {
    console.error(`Could not update local cache for ${name}:`, err);
    if (name === 'beacon_family_members') {
      try {
        localStorage.removeItem(name);
      } catch (removeErr) {
        console.error('Could not clear a legacy member PIN from the local cache:', removeErr);
      }
    }
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * How much completion history this device's copy keeps: more than the
 * widest `since` the app asks for (the leaderboard's month).
 */
const CACHED_HISTORY_DAYS = 62;

/**
 * Puts the server's answer for `since` onto this device's copy: items from
 * `since` on are replaced by the server's, and ones older than
 * CACHED_HISTORY_DAYS dropped. Without this the copy was never refreshed
 * once every read asked for `since`: offline it showed only this device's
 * own ticks, and it grew forever.
 */
function cacheRecent<T>(name: string, fresh: T[], since: Date): void {
  const keepFrom = Date.now() - CACHED_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const freshIds = new Set(fresh.map((it) => (it as { id?: unknown }).id));
  const older = readLocal<T>(name).filter((it) => {
    const at = Date.parse(String((it as { completed_at?: unknown }).completed_at));
    return at >= keepFrom && at < since.getTime() && !freshIds.has((it as { id?: unknown }).id);
  });
  writeLocal(name, [...older, ...fresh]);
}

/** Items with a `completed_at` at or after `since`, or for one of `choreIds` (one-off chores). */
function completedSince<T>(items: T[], since: Date, choreIds: string[] = []): T[] {
  return items.filter((it) => {
    const { completed_at: at, chore_id: choreId } = it as { completed_at?: unknown; chore_id?: unknown };
    return (typeof at === 'string' && Date.parse(at) >= since.getTime())
      || (typeof choreId === 'string' && choreIds.includes(choreId));
  });
}

/**
 * Fetch the collection. In add-on mode, reads from the server (the
 * authoritative copy); the result is cached to localStorage so
 * getCollectionSync() has something to show on the next initial render.
 *
 * `since` (for completion collections): only items completed then or
 * later — and, with `onceChoreIds`, any for one-off chores (they stay done;
 * the server finds them itself, the ids only serve this device's copy) —
 * filtered by the server so the whole history isn't downloaded
 * (see cacheRecent for this device's copy).
 */
export async function getCollection<T>(name: string, options: { since?: Date; onceChoreIds?: string[] } = {}): Promise<T[]> {
  const { since, onceChoreIds = [] } = options;
  if (isAddOn()) {
    let res: Response;
    try {
      const base = getIngressBasePath();
      const query = since
        ? `?since=${encodeURIComponent(since.toISOString())}${onceChoreIds.length ? '&once_chores' : ''}`
        : '';
      res = await fetch(`${base}/beacon-collection/${name}${query}`);
    } catch (err) {
      console.error(`Could not reach Family collection ${name}; using the local cache:`, err);
      const local = readLocal<T>(name);
      return since ? completedSince(local, since, onceChoreIds) : local;
    }
    if (!res.ok) throw new Error(`Family collection ${name} could not be read (HTTP ${res.status})`);
    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error(`Family collection ${name} was not a list`);
    if (since) cacheRecent(name, data as T[], since);
    else writeLocal(name, data);
    return data as T[];
  }
  const local = readLocal<T>(name);
  return since ? completedSince(local, since, onceChoreIds) : local;
}

/** Synchronous, localStorage-only read for instant initial render. */
export function getCollectionSync<T>(name: string): T[] {
  return readLocal<T>(name);
}

/**
 * Add one item. In add-on mode the server assigns the id and performs
 * the write; the local cache is updated to match afterward so sync reads
 * stay reasonably current.
 *
 * An item that already carries an id keeps it, both on the server and in
 * the local fallback: streaks are stored under their member_id and later
 * updated by it.
 */
export async function addToCollection<T extends HasId>(
  name: string,
  item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>,
): Promise<T> {
  if (isAddOn()) {
    try {
      const base = getIngressBasePath();
      const res = await fetch(`${base}/beacon-collection/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        const created = (await res.json()) as T;
        const cached = readLocal<T>(name);
        const existingIndex = cached.findIndex((it) => it.id === created.id);
        if (existingIndex === -1) cached.push(created);
        else cached[existingIndex] = { ...cached[existingIndex], ...created };
        writeLocal(name, cached);
        return created;
      }
    } catch {
      /* network error */
    }
    throw saveFailed(name);
  }
  const items = readLocal<T>(name);
  const created = { ...item, id: (item as HasId).id || generateId() } as T;
  const existingIndex = items.findIndex((it) => it.id === created.id);
  if (existingIndex === -1) items.push(created);
  else items[existingIndex] = { ...items[existingIndex], ...created };
  writeLocal(name, items);
  return created;
}

/** Merge-patch one item by id. Returns the updated item, or null if not found. */
export async function updateInCollection<T extends HasId>(
  name: string,
  id: string,
  patch: Partial<T>,
): Promise<T | null> {
  if (isAddOn()) {
    try {
      const base = getIngressBasePath();
      const res = await fetch(`${base}/beacon-collection/${name}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.status === 404) return null;
      if (res.ok) {
        const updated = (await res.json()) as T;
        const cached = readLocal<T>(name);
        const idx = cached.findIndex((it) => it.id === id);
        if (idx !== -1) cached[idx] = updated;
        else cached.push(updated);
        writeLocal(name, cached);
        return updated;
      }
    } catch {
      /* network error */
    }
    throw saveFailed(name);
  }
  const items = readLocal<T>(name);
  const idx = items.findIndex((it) => it.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, id } as T;
  writeLocal(name, items);
  return items[idx];
}

/** Remove one item by id. Returns whether an item was actually removed. */
export async function removeFromCollection(name: string, id: string): Promise<boolean> {
  if (isAddOn()) {
    try {
      const base = getIngressBasePath();
      const res = await fetch(`${base}/beacon-collection/${name}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const result = (await res.json()) as { ok?: boolean };
        if (result.ok) {
          const cached = readLocal<HasId>(name).filter((it) => it.id !== id);
          writeLocal(name, cached);
        }
        return !!result.ok;
      }
    } catch {
      /* network error */
    }
    throw saveFailed(name);
  }
  const items = readLocal<HasId>(name);
  const filtered = items.filter((it) => it.id !== id);
  const removed = filtered.length !== items.length;
  if (removed) writeLocal(name, filtered);
  return removed;
}
