import { useState, useCallback, useMemo, useEffect } from 'react';
import { FamilyStore } from '../api/family';
import { Routine, RoutineTaskCompletion } from '../types/family';

export function useRoutines(memberId?: string) {
  const store = useMemo(() => new FamilyStore(), []);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [completionsToday, setCompletionsToday] = useState<RoutineTaskCompletion[]>([]);

  const refresh = useCallback(async () => {
    const [r, ct] = await Promise.all([
      memberId ? store.getRoutinesForMember(memberId) : store.getRoutines(),
      store.getRoutineTaskCompletionsToday(),
    ]);
    setRoutines(r);
    setCompletionsToday(ct);
  }, [store, memberId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addRoutine = useCallback(
    async (routine: Omit<Routine, 'id'>) => {
      await store.addRoutine(routine);
      await refresh();
    },
    [store, refresh]
  );

  const updateRoutine = useCallback(
    async (id: string, data: Partial<Omit<Routine, 'id'>>) => {
      await store.updateRoutine(id, data);
      await refresh();
    },
    [store, refresh]
  );

  const removeRoutine = useCallback(
    async (id: string) => {
      await store.removeRoutine(id);
      await refresh();
    },
    [store, refresh]
  );

  const isTaskCompletedToday = useCallback(
    (routineId: string, taskId: string, forMemberId: string): boolean => {
      return completionsToday.some(
        (c) =>
          c.routine_id === routineId &&
          c.task_id === taskId &&
          c.member_id === forMemberId
      );
    },
    [completionsToday]
  );

  const toggleTask = useCallback(
    async (routine: Routine, taskId: string) => {
      if (isTaskCompletedToday(routine.id, taskId, routine.member_id)) {
        await store.uncompleteRoutineTask(routine.id, taskId, routine.member_id);
      } else {
        await store.completeRoutineTask(routine.id, taskId, routine.member_id);
      }
      await refresh();
    },
    [store, refresh, isTaskCompletedToday]
  );

  return {
    routines,
    completionsToday,
    addRoutine,
    updateRoutine,
    removeRoutine,
    toggleTask,
    isTaskCompletedToday,
    refresh,
  };
}
