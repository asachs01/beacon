import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const server = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  saves: [] as { key: string; value: unknown }[],
  patches: [] as { key: string; patch: unknown }[],
  addOn: false,
  /** Loads wait for this while set (a slow network). */
  gate: null as Promise<void> | null,
  loads: 0,
}));

/** Stand-in for data-changes.ts: changedElsewhere(key) is the poller spotting a change. */
const watchers = vi.hoisted(() => new Map<string, Set<() => void>>());
vi.mock('../api/data-changes', () => ({
  onDataChanged: (key: string, listener: () => void) => {
    if (!watchers.has(key)) watchers.set(key, new Set());
    watchers.get(key)!.add(listener);
    return () => watchers.get(key)?.delete(listener);
  },
}));
const changedElsewhere = (key: string) => watchers.get(key)?.forEach((listener) => listener());

vi.mock('../utils/ha-env', () => ({ isAddOn: () => server.addOn }));

vi.mock('../api/beacon-store', () => ({
  loadDataSync: (key: string, fallback: unknown) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  },
  loadData: async (key: string, fallback: unknown) => {
    server.loads++;
    const gate = server.gate;
    if (gate) await gate;
    return server.data.has(key) ? server.data.get(key) : fallback;
  },
  saveData: async (key: string, value: unknown) => {
    server.saves.push({ key, value });
    server.data.set(key, value);
  },
  loadServerData: async (key: string) => ({ ok: true, data: server.data.has(key) ? server.data.get(key) : null }),
  saveDataNow: async (key: string, value: unknown) => {
    server.saves.push({ key, value });
    server.data.set(key, value);
    return true;
  },
  saveDataPatch: async (key: string, patch: object) => {
    server.patches.push({ key, patch });
    server.data.set(key, { ...(server.data.get(key) as object), ...patch });
  },
}));

import { useStoredData, resetStoredData } from './useStoredData';
import { useSettings } from './useSettings';

beforeEach(() => {
  resetStoredData();
  server.addOn = false;
  server.data.clear();
  server.saves = [];
  server.patches = [];
  server.gate = null;
  server.loads = 0;
  watchers.clear();
});

describe('useStoredData', () => {
  it('never writes a stale local copy back to the server on load', async () => {
    localStorage.setItem('k', JSON.stringify(['stale']));
    server.data.set('k', ['newer from another device']);
    const { result } = renderHook(() => useStoredData<string[]>('k', []));
    expect(result.current[0]).toEqual(['stale']);
    await waitFor(() => expect(result.current[0]).toEqual(['newer from another device']));
    expect(server.saves).toEqual([]);
    expect(server.data.get('k')).toEqual(['newer from another device']);
  });

  it('saves changes made through update', async () => {
    server.data.set('k', ['a']);
    const { result } = renderHook(() => useStoredData<string[]>('k', []));
    await waitFor(() => expect(result.current[0]).toEqual(['a']));
    act(() => { result.current[1]((prev) => [...prev, 'b']); });
    expect(result.current[0]).toEqual(['a', 'b']);
    expect(server.saves).toEqual([{ key: 'k', value: ['a', 'b'] }]);
  });
});

describe('useStoredData, two copies and two displays', () => {
  // The Tasks screen and the dashboard each kept their own copy and saved
  // the whole of it: a task added on one was lost at the next change on the
  // other.
  it('keeps every copy on this display up to date', async () => {
    server.data.set('tasks', ['a']);
    const tasksScreen = renderHook(() => useStoredData<string[]>('tasks', []));
    const dashboard = renderHook(() => useStoredData<string[]>('tasks', []));
    await waitFor(() => expect(dashboard.result.current[0]).toEqual(['a']));

    act(() => { tasksScreen.result.current[1]((prev) => [...prev, 'milk']); });
    expect(dashboard.result.current[0]).toEqual(['a', 'milk']);
    act(() => { dashboard.result.current[1]((prev) => prev.filter((t) => t !== 'a')); });
    expect(server.saves.at(-1)?.value).toEqual(['milk']);
  });

  it("makes a change on the server's latest copy, keeping another display's", async () => {
    server.addOn = true;
    server.data.set('tasks', ['a']);
    const { result } = renderHook(() => useStoredData<string[]>('tasks', []));
    await waitFor(() => expect(result.current[0]).toEqual(['a']));

    server.data.set('tasks', ['a', 'from another display']);
    act(() => { result.current[1]((prev) => [...prev, 'b']); });
    await waitFor(() => expect(server.data.get('tasks')).toEqual(['a', 'from another display', 'b']));
    expect(result.current[0]).toEqual(['a', 'from another display', 'b']);
  });
});

describe('useStoredData, changes made elsewhere', () => {
  // Settings, lists and the built-in calendar were loaded again only when
  // the page was shown again, which a wall display never is.
  it('shows a change made on another display', async () => {
    server.data.set('tasks', ['a']);
    const { result } = renderHook(() => useStoredData<string[]>('tasks', []));
    await waitFor(() => expect(result.current[0]).toEqual(['a']));

    server.data.set('tasks', ['a', 'from another display']);
    act(() => changedElsewhere('tasks'));

    await waitFor(() => expect(result.current[0]).toEqual(['a', 'from another display']));
    expect(server.saves).toEqual([]);
  });

  it("doesn't let a reload that started before this display's change undo it", async () => {
    server.data.set('settings', { theme: 'dark' });
    const { result } = renderHook(() => useStoredData<Record<string, string>>('settings', {}));
    await waitFor(() => expect(result.current[0]).toEqual({ theme: 'dark' }));

    let finishLoading!: () => void;
    server.gate = new Promise<void>((resolve) => { finishLoading = resolve; });
    act(() => changedElsewhere('settings'));
    // Saved by the caller (like updateSettings); the server has the old value until it lands.
    act(() => { result.current[1]((prev) => ({ ...prev, clock: '24h' }), false); });
    await act(async () => { finishLoading(); await server.gate; });

    expect(result.current[0]).toEqual({ theme: 'dark', clock: '24h' });
  });

  it('shares one load among the hooks showing a key', async () => {
    server.data.set('tasks', ['a']);
    const tasksScreen = renderHook(() => useStoredData<string[]>('tasks', []));
    const dashboard = renderHook(() => useStoredData<string[]>('tasks', []));
    await waitFor(() => expect(dashboard.result.current[0]).toEqual(['a']));
    const loadsOnOpening = server.loads;

    server.data.set('tasks', ['a', 'b']);
    act(() => changedElsewhere('tasks'));

    await waitFor(() => expect(tasksScreen.result.current[0]).toEqual(['a', 'b']));
    expect(server.loads - loadsOnOpening).toBe(1);
  });
});

describe('useSettings', () => {
  it('sends only the changed fields, keeping settings changed on another device', async () => {
    localStorage.setItem('beacon-settings', JSON.stringify({ defaultGroceryList: 'Stale', timeFormat: '12h' }));
    const { result } = renderHook(() => useSettings());
    // Another device changes the time format before this one refreshes.
    server.data.set('beacon-settings', { defaultGroceryList: 'Stale', timeFormat: '24h' });
    act(() => { result.current.updateSettings({ defaultGroceryList: 'Smiths' }); });
    expect(server.patches).toEqual([{ key: 'beacon-settings', patch: { defaultGroceryList: 'Smiths' } }]);
    expect(server.data.get('beacon-settings')).toEqual({ defaultGroceryList: 'Smiths', timeFormat: '24h' });
    expect(server.saves).toEqual([]);
  });
});
