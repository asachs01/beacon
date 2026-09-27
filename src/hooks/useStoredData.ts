import { useCallback, useEffect, useRef, useState } from 'react';
import { loadData, loadDataSync, loadServerData, saveData, saveDataNow } from '../api/beacon-store';
import { isAddOn } from '../utils/ha-env';
import { onDataChanged } from '../api/data-changes';

/**
 * This display's current value of each key, shared by every hook using it.
 * Each hook used to keep its own copy and save its whole copy: the Tasks
 * screen and the dashboard each had one, so a task added on one was
 * overwritten by the next change on the other.
 */
const shared = new Map<string, { value: unknown; listeners: Set<(value: unknown) => void> }>();
/** Server saves in progress per key, one after another. */
const saveQueues = new Map<string, Promise<void>>();
const queuedSaves = new Map<string, number>();
/** Reloads in progress per key, shared by every hook showing it. */
const reloads = new Map<string, Promise<void>>();
/** How many changes this display has made to each key, to spot one made during a reload. */
const changesMade = new Map<string, number>();

function entry(key: string, initial: () => unknown) {
  let e = shared.get(key);
  if (!e) {
    e = { value: initial(), listeners: new Set() };
    shared.set(key, e);
  }
  return e;
}

function publish(key: string, value: unknown) {
  const e = shared.get(key);
  if (!e) return;
  e.value = value;
  e.listeners.forEach((listener) => listener(value));
}

/** Test hook: forget every shared value. */
export function resetStoredData(): void {
  shared.clear();
  saveQueues.clear();
  queuedSaves.clear();
  reloads.clear();
  changesMade.clear();
}

/**
 * State backed by a /beacon-data key (server copy is the source of truth
 * in add-on mode; localStorage is the offline cache).
 *
 * Only changes made through `update` are saved. Values that were merely
 * loaded — the local cache on first render, or the server copy on mount /
 * when the app becomes visible again — are never written back. Saving on
 * every state change used to push a device's stale local cache to the
 * server the moment it opened, overwriting newer changes made elsewhere.
 *
 * In the add-on, a change is made again on the server's latest copy before
 * saving, so one made meanwhile on another display is kept rather than
 * overwritten by this display's older copy.
 */
export function useStoredData<T>(key: string, fallback: T, normalize: (value: T) => T = (v) => v) {
  const fallbackRef = useRef(fallback);
  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;

  const e = entry(key, () => normalize(loadDataSync(key, fallback)));
  const [value, setValue] = useState<T>(e.value as T);

  useEffect(() => {
    const current = entry(key, () => normalizeRef.current(loadDataSync(key, fallbackRef.current)));
    const listener = (v: unknown) => setValue(v as T);
    current.listeners.add(listener);
    setValue(current.value as T);
    return () => {
      current.listeners.delete(listener);
    };
  }, [key]);

  /**
   * Re-fetch from the server, without saving. Hooks showing the same key
   * share one fetch. What it brings isn't shown if this display changed the
   * value meanwhile (it would undo that until the save lands; the save shows
   * the server's result itself), or if it's what's already showing.
   */
  const refresh = useCallback(() => {
    let reload = reloads.get(key);
    if (!reload) {
      const changesBefore = changesMade.get(key) ?? 0;
      reload = loadData(key, fallbackRef.current)
        .then((loaded) => {
          if ((changesMade.get(key) ?? 0) !== changesBefore || queuedSaves.get(key)) return;
          const next = normalizeRef.current(loaded);
          const current = shared.get(key)?.value;
          if (current === undefined || JSON.stringify(current) !== JSON.stringify(next)) publish(key, next);
        })
        .finally(() => reloads.delete(key));
      reloads.set(key, reload);
    }
    return reload;
  }, [key]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    // Changed on another display (see data-changes.ts).
    const stopWatching = onDataChanged(key, () => void refresh());
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stopWatching();
    };
  }, [refresh, key]);

  /**
   * Apply a change and save the result. Pass `save: false` when the caller
   * persists the change itself (e.g. as a partial update).
   */
  const update = useCallback((updater: (prev: T) => T, save = true): T => {
    const current = entry(key, () => normalizeRef.current(loadDataSync(key, fallbackRef.current)));
    const next = updater(current.value as T);
    changesMade.set(key, (changesMade.get(key) ?? 0) + 1);
    publish(key, next);
    if (!save) return next;
    if (!isAddOn()) {
      void saveData(key, next);
      return next;
    }

    queuedSaves.set(key, (queuedSaves.get(key) ?? 0) + 1);
    const run = async () => {
      try {
        const server = await loadServerData<T>(key);
        if (!server.ok) {
          void saveData(key, entry(key, () => next).value);
          return;
        }
        const merged = updater(normalizeRef.current(server.data ?? fallbackRef.current));
        // Show it unless a later change is still waiting (it'll show then).
        if (queuedSaves.get(key) === 1) publish(key, merged);
        if (!(await saveDataNow(key, merged))) void saveData(key, merged);
      } finally {
        queuedSaves.set(key, (queuedSaves.get(key) ?? 1) - 1);
      }
    };
    saveQueues.set(key, (saveQueues.get(key) ?? Promise.resolve()).then(run, run));
    return next;
  }, [key]);

  return [value, update, refresh] as const;
}
