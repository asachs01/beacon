import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const server = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  saves: [] as { key: string; value: unknown }[],
  patches: [] as { key: string; patch: unknown }[],
  addOn: false,
}));

vi.mock('../utils/ha-env', () => ({ isAddOn: () => server.addOn }));

vi.mock('../api/beacon-store', () => ({
  loadDataSync: (key: string, fallback: unknown) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  },
  loadData: async (key: string, fallback: unknown) => (server.data.has(key) ? server.data.get(key) : fallback),
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

describe('useSettings', () => {
  it('sends only the changed fields, keeping settings changed on another device', async () => {
    localStorage.setItem('beacon-settings', JSON.stringify({ familyName: 'Stale', timeFormat: '12h' }));
    const { result } = renderHook(() => useSettings());
    // Another device changes the time format before this one refreshes.
    server.data.set('beacon-settings', { familyName: 'Stale', timeFormat: '24h' });
    act(() => { result.current.updateSettings({ familyName: 'Smiths' }); });
    expect(server.patches).toEqual([{ key: 'beacon-settings', patch: { familyName: 'Smiths' } }]);
    expect(server.data.get('beacon-settings')).toEqual({ familyName: 'Smiths', timeFormat: '24h' });
    expect(server.saves).toEqual([]);
  });
});
