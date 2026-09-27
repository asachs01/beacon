import { useState, useCallback, useMemo, useEffect } from 'react';
import { FamilyStore, notifyFamilyDataChanged, onFamilyDataChanged } from '../api/family';
import { saveThen } from '../utils/save-errors';
import { unlessUnchanged } from '../utils/same-data';
import { byDay, useClock } from './useClock';
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
    setRoutines((prev) => unlessUnchanged(prev, r));
    setCompletionsToday((prev) => unlessUnchanged(prev, ct));
  }, [store, memberId]);

  // Loads again when the day changes, so yesterday's ticks clear at midnight.
  const today = useClock(byDay);
  useEffect(() => {
    refresh();
    return onFamilyDataChanged(store, () => void refresh());
  }, [refresh, store, today]);

  const addRoutine = useCallback(
    async (routine: Omit<Routine, 'id'>) => {
      await saveThen(() => store.addRoutine(routine), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  const updateRoutine = useCallback(
    async (id: string, data: Partial<Omit<Routine, 'id'>>) => {
      await saveThen(() => store.updateRoutine(id, data), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  const removeRoutine = useCallback(
    async (id: string) => {
      await saveThen(() => store.removeRoutine(id), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
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
      const done = isTaskCompletedToday(routine.id, taskId, routine.member_id);
      await saveThen(
        () => done
          ? store.uncompleteRoutineTask(routine.id, taskId, routine.member_id)
          : store.completeRoutineTask(routine.id, taskId, routine.member_id),
        async () => {
          await refresh();
          notifyFamilyDataChanged(store);
        },
      );
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
