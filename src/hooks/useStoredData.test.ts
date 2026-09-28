import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { onSaveFailed, reportSaveFailed, SaveFailedError } from '../utils/save-errors';

const server = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  saves: [] as { key: string; value: unknown }[],
  patches: [] as { key: string; patch: unknown }[],
  addOn: false,
  /** Loads wait for this while set (a slow network). */
  gate: null as Promise<void> | null,
  loads: 0,
  readFails: false,
  failWrites: 0,
  failPatches: 0,
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
    if (server.readFails) {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
    if (server.data.has(key)) localStorage.setItem(key, JSON.stringify(server.data.get(key)));
    return server.data.has(key) ? server.data.get(key) : fallback;
  },
  saveData: async (key: string, value: unknown) => {
    if (server.failWrites > 0) {
      server.failWrites--;
      const err = new SaveFailedError(`a change to ${key}`);
      reportSaveFailed(err);
      throw err;
    }
    server.saves.push({ key, value });
    server.data.set(key, value);
    localStorage.setItem(key, JSON.stringify(value));
  },
  loadServerData: async (key: string) => {
    if (server.readFails) return { ok: false };
    const data = server.data.has(key) ? server.data.get(key) : null;
    if (data === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(data));
    return { ok: true, data };
  },
  saveDataPatch: async (key: string, patch: object, full: unknown) => {
    if (server.failPatches > 0) {
      server.failPatches--;
      const err = new SaveFailedError(`a change to ${key}`);
      reportSaveFailed(err);
      throw err;
    }
    server.patches.push({ key, patch });
    server.data.set(key, { ...(server.data.get(key) as object), ...patch });
    localStorage.setItem(key, JSON.stringify(full));
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
  server.readFails = false;
  server.failWrites = 0;
  server.failPatches = 0;
  watchers.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
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

describe('useStoredData, rejected add-on writes', () => {
  it('reports a failed server read rather than saving an untrusted local copy', async () => {
    server.addOn = true;
    server.data.set('tasks', ['saved']);
    const { result } = renderHook(() => useStoredData<string[]>('tasks', []));
    await waitFor(() => expect(result.current[0]).toEqual(['saved']));
    const failures: SaveFailedError[] = [];
    const stop = onSaveFailed((err) => failures.push(err));

    try {
      server.readFails = true;
      act(() => { result.current[1]((prev) => [...prev, 'not saved']); });
      expect(result.current[0]).toEqual(['saved', 'not saved']);
      await waitFor(() => expect(result.current[0]).toEqual(['saved']));

      expect(server.saves).toEqual([]);
      expect(server.data.get('tasks')).toEqual(['saved']);
      expect(JSON.parse(localStorage.getItem('tasks')!)).toEqual(['saved']);
      expect(failures).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it('restores a newer server value after a rejected full write', async () => {
    server.addOn = true;
    server.data.set('tasks', ['saved']);
    const { result } = renderHook(() => useStoredData<string[]>('tasks', []));
    await waitFor(() => expect(result.current[0]).toEqual(['saved']));
    server.data.set('tasks', ['saved', 'from another display']);
    server.failWrites = 1;
    const failures: SaveFailedError[] = [];
    const stop = onSaveFailed((err) => failures.push(err));

    try {
      act(() => { result.current[1]((prev) => [...prev, 'rejected']); });
      expect(result.current[0]).toEqual(['saved', 'rejected']);
      await waitFor(() => expect(result.current[0]).toEqual(['saved', 'from another display']));

      expect(server.saves).toEqual([]);
      expect(JSON.parse(localStorage.getItem('tasks')!)).toEqual(['saved', 'from another display']);
      expect(failures).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it('rolls back a rejected write and reapplies a later edit to the server copy', async () => {
    server.addOn = true;
    server.data.set('tasks', ['saved']);
    const { result } = renderHook(() => useStoredData<string[]>('tasks', []));
    await waitFor(() => expect(result.current[0]).toEqual(['saved']));
    server.failWrites = 1;
    const failures: SaveFailedError[] = [];
    const stop = onSaveFailed((err) => failures.push(err));

    try {
      act(() => {
        result.current[1]((prev) => [...prev, 'rejected']);
        result.current[1]((prev) => [...prev, 'accepted']);
      });
      await waitFor(() => expect(result.current[0]).toEqual(['saved', 'accepted']));

      expect(server.data.get('tasks')).toEqual(['saved', 'accepted']);
      expect(JSON.parse(localStorage.getItem('tasks')!)).toEqual(['saved', 'accepted']);
      expect(failures).toHaveLength(1);
    } finally {
      stop();
    }
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
    server.addOn = true;
    localStorage.setItem('beacon-settings', JSON.stringify({ defaultGroceryList: 'Stale', timeFormat: '12h' }));
    server.data.set('beacon-settings', { defaultGroceryList: 'Stale', timeFormat: '12h' });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings.defaultGroceryList).toBe('Stale'));
    // Another device changes the time format before this one refreshes.
    server.data.set('beacon-settings', { defaultGroceryList: 'Stale', timeFormat: '24h' });
    act(() => { result.current.updateSettings({ defaultGroceryList: 'Smiths' }); });
    await waitFor(() => expect(server.patches).toEqual([{ key: 'beacon-settings', patch: { defaultGroceryList: 'Smiths' } }]));
    expect(server.data.get('beacon-settings')).toEqual({ defaultGroceryList: 'Smiths', timeFormat: '24h' });
    expect(server.saves).toEqual([]);
  });

  it('rejects a null chores sync map visibly, without changing or saving any settings', async () => {
    server.addOn = true;
    server.data.set('beacon-settings', {
      choresSyncEnabled: false,
      choresSyncListByMember: { m1: 'todo.family' },
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings.choresSyncListByMember).toEqual({ m1: 'todo.family' }));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});

    act(() => {
      result.current.importSettings('{"choresSyncEnabled":true,"choresSyncListByMember":null}');
    });

    expect(alert).toHaveBeenCalledOnce();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('"choresSyncListByMember"'));
    expect(result.current.settings.choresSyncEnabled).toBe(false);
    expect(result.current.settings.choresSyncListByMember).toEqual({ m1: 'todo.family' });
    expect(server.saves).toEqual([]);
    expect(server.patches).toEqual([]);
    expect(server.data.get('beacon-settings')).toEqual({
      choresSyncEnabled: false,
      choresSyncListByMember: { m1: 'todo.family' },
    });
  });

  it.each([
    ['invalid array contents', { groceryListIds: ['todo.valid', null] }, 'groceryListIds'],
    ['invalid map contents', { calendarColors: { 'calendar.family': '#aabbcc', broken: 42 } }, 'calendarColors'],
    ['out-of-range numbers', { photoInterval: 0.001 }, 'photoInterval'],
    ['unknown fields', { unknownSetting: 'never stored' }, 'unknownSetting'],
  ])('rejects %s instead of partly importing them', async (_, imported, field) => {
    server.addOn = true;
    const { result } = renderHook(() => useSettings());
    const before = result.current.settings;
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});

    act(() => { result.current.importSettings(JSON.stringify({ defaultView: 'calendar', ...imported })); });

    expect(alert).toHaveBeenCalledWith(expect.stringContaining(`"${field}"`));
    expect(result.current.settings).toEqual(before);
    expect(server.saves).toEqual([]);
  });

  it('imports valid partial settings and fills their missing fields', async () => {
    server.addOn = true;
    const { result } = renderHook(() => useSettings());
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    act(() => {
      result.current.importSettings(JSON.stringify({
        defaultView: 'calendar',
        choresSyncEnabled: true,
        choresSyncListByMember: { m1: 'todo.family' },
        permanentlyHiddenCalendars: ['calendar.family'],
        photoInterval: 20,
      }));
    });

    expect(result.current.settings.defaultView).toBe('calendar');
    expect(result.current.settings.choresSyncListByMember).toEqual({ m1: 'todo.family' });
    expect(result.current.settings.permanentlyHiddenCalendars).toEqual(['calendar.family']);
    expect(result.current.settings.photoInterval).toBe(20);
    expect(result.current.settings.timeFormat).toBe(result.current.defaults.timeFormat);
    await waitFor(() => expect(server.saves).toHaveLength(1));
    expect(server.saves[0].value).toEqual(result.current.settings);
    expect(alert).not.toHaveBeenCalled();
  });

  it('reports invalid JSON/shape but still normalizes malformed legacy settings on read', async () => {
    server.data.set('beacon-settings', { choresSyncEnabled: true, choresSyncListByMember: null });
    localStorage.setItem('beacon-settings', JSON.stringify({ choresSyncEnabled: true, choresSyncListByMember: null }));
    const { result } = renderHook(() => useSettings());
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    expect(result.current.settings.choresSyncListByMember).toEqual({});
    await waitFor(() => expect(result.current.settings.choresSyncEnabled).toBe(true));
    act(() => {
      result.current.importSettings('null');
      result.current.importSettings('[]');
      result.current.importSettings('{invalid json');
    });
    expect(result.current.settings.choresSyncListByMember).toEqual({});
    expect(server.saves).toEqual([]);
    expect(alert).toHaveBeenCalledTimes(3);
    expect(alert).toHaveBeenNthCalledWith(3, expect.stringContaining("isn't valid JSON"));
  });

  it('sanitizes an invalid settings patch before persisting it', async () => {
    server.addOn = true;
    server.data.set('beacon-settings', { choresSyncListByMember: { m1: 'todo.family' } });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings.choresSyncListByMember).toEqual({ m1: 'todo.family' }));

    act(() => {
      result.current.updateSettings({ choresSyncListByMember: null } as unknown as Parameters<typeof result.current.updateSettings>[0]);
    });
    expect(result.current.settings.choresSyncListByMember).toEqual({});
    await waitFor(() => expect(server.patches).toEqual([
      { key: 'beacon-settings', patch: { choresSyncListByMember: {} } },
    ]));
  });

  it('restores the server settings when a partial update is rejected', async () => {
    server.addOn = true;
    server.data.set('beacon-settings', { choresSyncEnabled: false, timeFormat: '24h' });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings.timeFormat).toBe('24h'));
    server.failPatches = 1;
    const failures: SaveFailedError[] = [];
    const stop = onSaveFailed((err) => failures.push(err));

    try {
      act(() => { result.current.updateSettings({ choresSyncEnabled: true }); });
      expect(result.current.settings.choresSyncEnabled).toBe(true);
      await waitFor(() => expect(result.current.settings.choresSyncEnabled).toBe(false));

      expect(server.data.get('beacon-settings')).toEqual({ choresSyncEnabled: false, timeFormat: '24h' });
      expect(JSON.parse(localStorage.getItem('beacon-settings')!)).toEqual({ choresSyncEnabled: false, timeFormat: '24h' });
      expect(failures).toHaveLength(1);
    } finally {
      stop();
    }
  });
});
