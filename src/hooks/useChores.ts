import { useState, useCallback, useMemo, useEffect } from 'react';
import { FamilyStore, notifyFamilyDataChanged, onFamilyDataChanged } from '../api/family';
import { saveThen } from '../utils/save-errors';
import { byDay, useClock } from './useClock';
import { Chore, ChoreCompletion, Streak, MemberEarnings } from '../types/family';

/**
 * `enabled: false` stops following changes (made here or by the Google Tasks
 * sync) until it's turned back on, which reloads at once.
 */
export function useChores(enabled = true) {
  const store = useMemo(() => new FamilyStore(), []);
  // Initialize with localStorage data immediately
  const [chores, setChores] = useState<Chore[]>(() => store.getChoresSync());
  /** Completions that count for each chore's current round (see chore-rounds.ts). */
  const [currentCompletions, setCurrentCompletions] = useState<ChoreCompletion[]>([]);
  const [streaks, setStreaks] = useState<Streak[]>([]);

  const refresh = useCallback(async () => {
    const [c, s] = await Promise.all([store.getChores(), store.getStreaks()]);
    const current = await store.getCurrentCompletions(c);
    setChores(c);
    setCurrentCompletions(current);
    setStreaks(s);
  }, [store]);

  // What counts as done is worked out as data loads, so it loads again when
  // the day changes; otherwise yesterday's ticks stayed up after midnight.
  const today = useClock(byDay);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    return onFamilyDataChanged(store, () => void refresh());
  }, [refresh, store, enabled, today]);

  const addChore = useCallback(
    async (chore: Omit<Chore, 'id'>) => {
      await saveThen(() => store.addChore(chore), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  const updateChore = useCallback(
    async (id: string, data: Partial<Omit<Chore, 'id'>>) => {
      await saveThen(() => store.updateChore(id, data), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  const removeChore = useCallback(
    async (id: string) => {
      await saveThen(() => store.removeChore(id), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  const completeChore = useCallback(
    async (choreId: string, memberId: string) => {
      await saveThen(() => store.completeChore(choreId, memberId), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  const uncompleteChore = useCallback(
    async (choreId: string, memberId: string) => {
      await saveThen(() => store.uncompleteChore(choreId, memberId), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  /** Done in its current round: today, this week, or ever (one-offs). */
  const isChoreDone = useCallback(
    (choreId: string, memberId: string): boolean => {
      return currentCompletions.some(
        (c) => c.chore_id === choreId && c.member_id === memberId
      );
    },
    [currentCompletions]
  );

  const getStreakForMember = useCallback(
    (memberId: string): Streak => {
      return (
        streaks.find((s) => s.member_id === memberId) ?? {
          member_id: memberId,
          current: 0,
          longest: 0,
          last_completed: '',
        }
      );
    },
    [streaks]
  );

  const getChoresForMember = useCallback(
    (memberId: string): Chore[] => {
      return chores.filter((c) => c.assigned_to.includes(memberId));
    },
    [chores]
  );

  const getMemberProgress = useCallback(
    (memberId: string): { completed: number; total: number } => {
      const memberChores = chores.filter((c) => c.assigned_to.includes(memberId));
      const completed = memberChores.filter((c) =>
        currentCompletions.some(
          (comp) => comp.chore_id === c.id && comp.member_id === memberId
        )
      ).length;
      return { completed, total: memberChores.length };
    },
    [chores, currentCompletions]
  );

  const getEarningsForPeriod = useCallback(
    async (startDate: string, endDate: string): Promise<MemberEarnings[]> => {
      const completions = await store.getCompletionsForPeriod(startDate, endDate);
      const choreMap = new Map(chores.map((c) => [c.id, c]));
      const earningsMap = new Map<string, MemberEarnings>();

      for (const comp of completions) {
        const chore = choreMap.get(comp.chore_id);
        if (!chore) continue;

        const existing = earningsMap.get(comp.member_id) ?? {
          member_id: comp.member_id,
          total_cents: 0,
          chore_count: 0,
        };
        existing.total_cents += chore.value_cents;
        existing.chore_count += 1;
        earningsMap.set(comp.member_id, existing);
      }

      return Array.from(earningsMap.values()).sort(
        (a, b) => b.total_cents - a.total_cents
      );
    },
    [chores, store]
  );

  return {
    chores,
    currentCompletions,
    streaks,
    addChore,
    updateChore,
    removeChore,
    completeChore,
    uncompleteChore,
    isChoreDone,
    getStreakForMember,
    getChoresForMember,
    getMemberProgress,
    getEarningsForPeriod,
    refresh,
  };
}
