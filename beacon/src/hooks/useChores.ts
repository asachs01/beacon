import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import { FamilyStore } from '../api/family';
import { getChoreResetTime, subscribeChoreResetTime } from '../api/chore-reset-time';
import { Chore, ChoreCompletion, Streak, MemberEarnings, UNCREDITED_MEMBER_ID } from '../types/family';

export function useChores() {
  const resetTime = useSyncExternalStore(subscribeChoreResetTime, getChoreResetTime, getChoreResetTime);
  const store = useMemo(() => new FamilyStore(), []);
  // Initialize with localStorage data immediately
  const [chores, setChores] = useState<Chore[]>(() => store.getChoresSync());
  const [completionsToday, setCompletionsToday] = useState<ChoreCompletion[]>([]);
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [c, ct, s] = await Promise.all([
      store.getChores(),
      store.getCompletionsToday(resetTime),
      store.getStreaks(),
    ]);
    setChores(c);
    setCompletionsToday(ct);
    setStreaks(s);
  }, [store, resetTime]);

  useEffect(() => {
    let cancelled = false;
    refresh().finally(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const addChore = useCallback(
    async (chore: Omit<Chore, 'id'>) => {
      await store.addChore(chore);
      await refresh();
    },
    [store, refresh]
  );

  const updateChore = useCallback(
    async (id: string, data: Partial<Omit<Chore, 'id'>>) => {
      await store.updateChore(id, data);
      await refresh();
    },
    [store, refresh]
  );

  const removeChore = useCallback(
    async (id: string) => {
      await store.removeChore(id);
      await refresh();
    },
    [store, refresh]
  );

  const completeChore = useCallback(
    async (choreId: string, memberId: string, by?: 'guest') => {
      await store.completeChore(choreId, memberId, undefined, resetTime, by);
      await refresh();
    },
    [store, refresh, resetTime]
  );

  const uncompleteChore = useCallback(
    async (choreId: string, memberId: string) => {
      await store.uncompleteChore(choreId, memberId, resetTime);
      await refresh();
    },
    [store, refresh, resetTime]
  );

  const isChoreCompletedToday = useCallback(
    (choreId: string, memberId: string): boolean => {
      return completionsToday.some(
        (c) => c.chore_id === choreId && c.member_id === memberId
      );
    },
    [completionsToday]
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
        completionsToday.some(
          (comp) => comp.chore_id === c.id && comp.member_id === memberId
        )
      ).length;
      return { completed, total: memberChores.length };
    },
    [chores, completionsToday]
  );

  const getEarningsForPeriod = useCallback(
    async (startDate: string, endDate: string): Promise<MemberEarnings[]> => {
      const completions = await store.getCompletionsForPeriod(startDate, endDate);
      const choreMap = new Map(chores.map((c) => [c.id, c]));
      const earningsMap = new Map<string, MemberEarnings>();

      for (const comp of completions) {
        if (comp.member_id === UNCREDITED_MEMBER_ID) continue;
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
    completionsToday,
    streaks,
    loaded,
    addChore,
    updateChore,
    removeChore,
    completeChore,
    uncompleteChore,
    isChoreCompletedToday,
    getStreakForMember,
    getChoresForMember,
    getMemberProgress,
    getEarningsForPeriod,
    refresh,
  };
}
