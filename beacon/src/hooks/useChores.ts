import { useState, useCallback, useMemo, useEffect } from 'react';
import { FamilyStore } from '../api/family';
import { Chore, ChoreCompletion, Streak, MemberEarnings } from '../types/family';

export function useChores() {
  const store = useMemo(() => new FamilyStore(), []);
  // Initialize with localStorage data immediately
  const [chores, setChores] = useState<Chore[]>(() => store.getChoresSync());
  const [completionsToday, setCompletionsToday] = useState<ChoreCompletion[]>([]);
  const [streaks, setStreaks] = useState<Streak[]>([]);

  const refresh = useCallback(async () => {
    const [c, ct, s] = await Promise.all([
      store.getChores(),
      store.getCompletionsToday(),
      store.getStreaks(),
    ]);
    setChores(c);
    setCompletionsToday(ct);
    setStreaks(s);
  }, [store]);

  useEffect(() => {
    refresh();
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
    async (choreId: string, memberId: string) => {
      await store.completeChore(choreId, memberId);
      await refresh();
    },
    [store, refresh]
  );

  const uncompleteChore = useCallback(
    async (choreId: string, memberId: string) => {
      await store.uncompleteChore(choreId, memberId);
      await refresh();
    },
    [store, refresh]
  );

  const isChoreCompletedToday = useCallback(
    (choreId: string, memberId: string): boolean => {
      return completionsToday.some(
        (c) => c.chore_id === choreId && c.member_id === memberId
      );
    },
    [completionsToday]
  );

  /** Count how many times a chore was completed by a member in the current frequency period. */
  const getCompletionCount = useCallback(
    (chore: Chore, memberId: string): number => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      if (chore.frequency === 'daily') {
        return completionsToday.filter(
          (c) => c.chore_id === chore.id && c.member_id === memberId
        ).length;
      }

      if (chore.frequency === 'weekly') {
        // Start of week (Sunday)
        const dayOfWeek = now.getDay();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dayOfWeek);
        const weekStartStr = weekStart.toISOString().slice(0, 10);
        // We only have completionsToday loaded; for weekly we need all completions
        // Use a simple approach: count from store sync
        const allCompletions = store.getCompletionsSync();
        return allCompletions.filter(
          (c) =>
            c.chore_id === chore.id &&
            c.member_id === memberId &&
            c.completed_at.slice(0, 10) >= weekStartStr &&
            c.completed_at.slice(0, 10) <= todayStr
        ).length;
      }

      return 0;
    },
    [completionsToday, store]
  );

  /** Check if a chore has reached its max completions for the current period. */
  const isChoreMaxedOut = useCallback(
    (chore: Chore, memberId: string): boolean => {
      if (!chore.max_completions) return false;
      return getCompletionCount(chore, memberId) >= chore.max_completions;
    },
    [getCompletionCount]
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
    addChore,
    updateChore,
    removeChore,
    completeChore,
    uncompleteChore,
    isChoreCompletedToday,
    getStreakForMember,
    getChoresForMember,
    getMemberProgress,
    getCompletionCount,
    isChoreMaxedOut,
    getEarningsForPeriod,
    refresh,
  };
}
