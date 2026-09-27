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

  // Before 1.52.9 two displays ticking at once could store a chore twice,
  // and earnings counted every record.
  it('pays each round of a chore once, even if it was stored twice', async () => {
    const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0).toISOString();
    db.collections.set('beacon_chores', [
      { id: 'd', name: 'Dishes', assigned_to: ['kai'], frequency: 'daily', value_cents: 100 } as { id: string },
      { id: 'w', name: 'Mow', assigned_to: ['kai'], frequency: 'weekly', value_cents: 500 } as { id: string },
    ]);
    db.collections.set('beacon_completions', [
      { id: 'r1', chore_id: 'd', member_id: 'kai', completed_at: at(21, 9) },
      { id: 'r2', chore_id: 'd', member_id: 'kai', completed_at: at(21, 9) }, // the same tick twice
      { id: 'r3', chore_id: 'd', member_id: 'kai', completed_at: at(22, 9) }, // the next day
      { id: 'r4', chore_id: 'w', member_id: 'kai', completed_at: at(21, 18) },
      { id: 'r5', chore_id: 'w', member_id: 'kai', completed_at: at(23, 18) }, // same week
    ] as { id: string }[]);
    const { result } = renderHook(() => useChores());
    await waitFor(() => expect(result.current.chores).toHaveLength(2));

    const earnings = await result.current.getEarningsForPeriod('2026-09-01', '2026-09-30');

    expect(earnings).toEqual([{ member_id: 'kai', total_cents: 700, chore_count: 3 }]);
  });
});

describe('useChores streaks', () => {
  // A streak's record keeps its count until the next chore restarts it at 1,
  // so one that ended days ago still showed as going (🔥5, "hot" at 7).
  it('shows a streak as over once a whole day went by with nothing done', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 8, 28, 9, 0));
      db.collections.set('beacon_streaks', [
        { id: 'kai', member_id: 'kai', current: 5, longest: 5, last_completed: new Date(2026, 8, 24, 18, 0).toISOString() },
        { id: 'sam', member_id: 'sam', current: 3, longest: 4, last_completed: new Date(2026, 8, 27, 18, 0).toISOString() },
      ] as { id: string }[]);
      const { result } = renderHook(() => useChores());
      await waitFor(() => expect(result.current.streaks).toHaveLength(2));

      expect(result.current.getStreakForMember('kai')).toMatchObject({ current: 0, longest: 5 });
      expect(result.current.getStreakForMember('sam')).toMatchObject({ current: 3, longest: 4 }); // done yesterday: still going
    } finally {
      vi.useRealTimers();
    }
  });
});
