import { useState, useCallback, useMemo, useEffect } from 'react';
import { FamilyStore } from '../api/family';
import { Chore, ChoreCompletion, Streak, MemberEarnings, Payout } from '../types/family';

const PAYOUT_LAST_CHECK_KEY = 'beacon_payout_last_check';

export function useChores(payoutSchedule?: 'weekly' | 'monthly') {
  const store = useMemo(() => new FamilyStore(), []);
  // Initialize with localStorage data immediately
  const [chores, setChores] = useState<Chore[]>(() => store.getChoresSync());
  const [completionsToday, setCompletionsToday] = useState<ChoreCompletion[]>([]);
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>(() => store.getPayoutsSync());
  const [balances, setBalances] = useState<Record<string, number>>({});

  const refreshBalances = useCallback(async () => {
    const members = store.getMembersSync();
    const kids = members.filter((m) => m.role === 'child');
    const bal: Record<string, number> = {};
    for (const kid of kids) {
      bal[kid.id] = await store.getBalance(kid.id);
    }
    setBalances(bal);
  }, [store]);

  const refresh = useCallback(async () => {
    const [c, ct, s, p] = await Promise.all([
      store.getChores(),
      store.getCompletionsToday(),
      store.getStreaks(),
      store.getPayouts(),
    ]);
    setChores(c);
    setCompletionsToday(ct);
    setStreaks(s);
    setPayouts(p);
    await refreshBalances();
  }, [store, refreshBalances]);

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

  const processPayout = useCallback(
    async (memberId: string, parentId: string, choreId?: string) => {
      const balance = await store.getBalance(memberId);
      if (balance <= 0) return;
      await store.addPayout({
        member_id: memberId,
        amount_cents: balance,
        paid_by: parentId,
        paid_at: new Date().toISOString(),
        chore_id: choreId,
      });
      await refresh();
    },
    [store, refresh]
  );

  const completeChore = useCallback(
    async (choreId: string, memberId: string) => {
      await store.completeChore(choreId, memberId);

      // If this is a payout chore, process the payout
      const chore = chores.find((c) => c.id === choreId);
      if (chore?.payout_for) {
        await processPayout(chore.payout_for, memberId, choreId);
      }

      await refresh();
    },
    [store, refresh, chores, processPayout]
  );

  const uncompleteChore = useCallback(
    async (choreId: string, memberId: string) => {
      await store.uncompleteChore(choreId, memberId);
      await refresh();
    },
    [store, refresh]
  );

  const generatePayoutChores = useCallback(async () => {
    const members = store.getMembersSync();
    const kids = members.filter((m) => m.role === 'child');
    const parents = members.filter((m) => m.role === 'parent');
    if (parents.length === 0) return;

    const parentIds = parents.map((p) => p.id);
    const currentChores = await store.getChores();

    for (const kid of kids) {
      const balance = await store.getBalance(kid.id);
      if (balance <= 0) continue;

      // Check if a payout chore already exists for this kid that hasn't been completed
      const existingPayout = currentChores.find(
        (c) => c.payout_for === kid.id
      );
      if (existingPayout) continue;

      const dollars = (balance / 100).toFixed(2);
      await store.addChore({
        name: `\u{1F4B0} Pay ${kid.name} $${dollars}`,
        assigned_to: parentIds,
        frequency: 'once',
        value_cents: 0,
        icon: '\u{1F4B0}',
        payout_for: kid.id,
      });
    }

    await refresh();
  }, [store, refresh]);

  // Payout schedule check on mount
  useEffect(() => {
    if (!payoutSchedule) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const lastCheck = localStorage.getItem(PAYOUT_LAST_CHECK_KEY);
    if (lastCheck === todayStr) return; // Already checked today

    let shouldGenerate = false;

    if (payoutSchedule === 'weekly') {
      // Generate on Sunday (day 0)
      shouldGenerate = now.getDay() === 0;
    } else if (payoutSchedule === 'monthly') {
      // Generate on the 1st
      shouldGenerate = now.getDate() === 1;
    }

    if (shouldGenerate) {
      localStorage.setItem(PAYOUT_LAST_CHECK_KEY, todayStr);
      generatePayoutChores();
    }
  }, [payoutSchedule, generatePayoutChores]);

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
    payouts,
    balances,
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
    processPayout,
    generatePayoutChores,
    refresh,
  };
}
