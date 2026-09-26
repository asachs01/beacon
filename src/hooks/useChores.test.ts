import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({ collections: new Map<string, { id: string }[]>(), nextId: 0 }));

vi.mock('../api/beacon-collection', () => {
  const coll = (name: string) => {
    if (!db.collections.has(name)) db.collections.set(name, []);
    return db.collections.get(name)!;
  };
  return {
    getCollection: async (name: string) => coll(name).map((it) => ({ ...it })),
    getCollectionSync: (name: string) => coll(name).map((it) => ({ ...it })),
    addToCollection: async (name: string, item: object) => {
      const created = { ...item, id: `rec-${++db.nextId}` };
      coll(name).push(created);
      return { ...created };
    },
    updateInCollection: async () => null,
    removeFromCollection: async (name: string, id: string) => {
      const items = coll(name);
      const idx = items.findIndex((x) => x.id === id);
      if (idx >= 0) items.splice(idx, 1);
      return idx >= 0;
    },
  };
});

import { useChores } from './useChores';

describe('useChores', () => {
  it('keeps separate instances in sync (e.g. dashboard card and Chores screen)', async () => {
    db.collections.set('beacon_chores', [
      { id: 'c1', name: 'Vacuum', assigned_to: ['kai'], frequency: 'daily', value_cents: 0 } as { id: string },
    ]);
    const dashboard = renderHook(() => useChores());
    const choresScreen = renderHook(() => useChores());
    await waitFor(() => expect(dashboard.result.current.chores).toHaveLength(1));

    await act(async () => { await choresScreen.result.current.completeChore('c1', 'kai'); });

    await waitFor(() => expect(dashboard.result.current.isChoreDone('c1', 'kai')).toBe(true));
  });

  it('while paused (Kid Display up), ignores changes, then catches up when resumed', async () => {
    db.collections.set('beacon_chores', [
      { id: 'c2', name: 'Feed cat', assigned_to: ['kai'], frequency: 'daily', value_cents: 0 } as { id: string },
    ]);
    db.collections.set('beacon_completions', []);
    const app = renderHook(({ enabled }) => useChores(enabled), { initialProps: { enabled: false } });
    const kidDisplay = renderHook(() => useChores());
    await waitFor(() => expect(kidDisplay.result.current.chores).toHaveLength(1));

    await act(async () => { await kidDisplay.result.current.completeChore('c2', 'kai'); });
    expect(app.result.current.isChoreDone('c2', 'kai')).toBe(false);

    app.rerender({ enabled: true });
    await waitFor(() => expect(app.result.current.isChoreDone('c2', 'kai')).toBe(true));
  });

  // Only the Kid Display reloaded at midnight: the dashboard and Chores
  // screen kept showing yesterday's ticks on a display left on overnight.
  it("clears yesterday's ticks at midnight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 26, 23, 58));
    db.collections.set('beacon_chores', [
      { id: 'c2', name: 'Dishes', assigned_to: ['kai'], frequency: 'daily', value_cents: 0 } as { id: string },
    ]);
    db.collections.set('beacon_completions', []);
    const { result } = renderHook(() => useChores());
    await waitFor(() => expect(result.current.chores).toHaveLength(1));
    await act(async () => { await result.current.completeChore('c2', 'kai'); });
    expect(result.current.isChoreDone('c2', 'kai')).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(3 * 60 * 1000); }); // 00:01
    await waitFor(() => expect(result.current.isChoreDone('c2', 'kai')).toBe(false));
    vi.useRealTimers();
  });

  // Every chore counted as daily: weekly and one-off chores came undone
  // each night.
  describe('frequencies', () => {
    const doneAfter = async (frequency: string, laterDay: Date) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 8, 21, 10, 0)); // Monday 21 Sep
      const id = `f-${frequency}`;
      db.collections.set('beacon_chores', [{ id, name: frequency, assigned_to: ['kai'], frequency, value_cents: 0 } as { id: string }]);
      db.collections.set('beacon_completions', []);
      const { result, unmount } = renderHook(() => useChores());
      await waitFor(() => expect(result.current.chores).toHaveLength(1));
      await act(async () => { await result.current.completeChore(id, 'kai'); });
      await act(async () => { await result.current.completeChore(id, 'kai'); }); // no second completion
      expect(db.collections.get('beacon_completions')).toHaveLength(1);

      vi.setSystemTime(laterDay);
      await act(async () => { await result.current.refresh(); });
      const done = result.current.isChoreDone(id, 'kai');
      unmount();
      vi.useRealTimers();
      return done;
    };

    it('keeps a weekly chore done until the week ends', async () => {
      expect(await doneAfter('weekly', new Date(2026, 8, 26, 10, 0))).toBe(true); // Saturday
      expect(await doneAfter('weekly', new Date(2026, 8, 27, 10, 0))).toBe(false); // Sunday: a new week
    });

    it('keeps a one-off chore done', async () => {
      expect(await doneAfter('once', new Date(2026, 10, 30, 10, 0))).toBe(true);
    });

    it('clears a daily chore the next day', async () => {
      expect(await doneAfter('daily', new Date(2026, 8, 22, 10, 0))).toBe(false);
    });
  });
});
