import {
  FamilyMember,
  Chore,
  ChoreCompletion,
  Streak,
  Routine,
  RoutineTaskCompletion,
} from '../types/family';
import {
  getCollection,
  getCollectionSync,
  addToCollection,
  updateInCollection,
  removeFromCollection,
} from './beacon-collection';
import { startOfDay, startOfToday, parseISO, subDays } from 'date-fns';
import { localDayKey } from './date-keys';
import { choreRoundKey, choreRoundStart, completesCurrentRound, weekStartsOnSetting } from './chore-rounds';

function choreCompletionId(choreId: string, memberId: string, roundKey: string): string {
  return `chore-${encodeURIComponent(choreId)}:${encodeURIComponent(memberId)}:${roundKey}`;
}

const STORAGE_KEYS = {
  members: 'beacon_family_members',
  chores: 'beacon_chores',
  completions: 'beacon_completions',
  streaks: 'beacon_streaks',
  routines: 'beacon_routines',
  routine_completions: 'beacon_routine_completions',
} as const;

/** Every collection family data is stored in. */
export const FAMILY_COLLECTIONS: string[] = Object.values(STORAGE_KEYS);

/**
 * Fired whenever family data changes, so every mounted useFamily /
 * useChores / useRoutines instance refreshes — each screen keeps its own
 * copy of the state (e.g. the dashboard's chores card and the Chores
 * screen). `source` identifies the instance that made the change, which
 * already refreshed itself and skips the event.
 */
export const FAMILY_DATA_CHANGED_EVENT = 'beacon:family-data-changed';

export function notifyFamilyDataChanged(source?: object): void {
  window.dispatchEvent(new CustomEvent(FAMILY_DATA_CHANGED_EVENT, { detail: source }));
}

/** Subscribe to family data changes made by anyone other than `self`. */
export function onFamilyDataChanged(self: object, handler: () => void): () => void {
  const listener = (e: Event) => {
    if ((e as CustomEvent).detail !== self) handler();
  };
  window.addEventListener(FAMILY_DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(FAMILY_DATA_CHANGED_EVENT, listener);
}

/**
 * Family data store.
 *
 * Members, chores, routines and completions are stored as atomic
 * collections (see beacon-collection.ts / server.js's
 * /beacon-collection/* API): every add/update/delete is performed BY
 * THE SERVER against its own on-disk copy, one at a time per collection.
 * This is what actually prevents two devices editing concurrently from
 * silently overwriting each other's changes — a client-side
 * fetch-the-whole-array-modify-save pattern can't guarantee that no
 * matter how reliably each individual write is delivered, since the
 * "modify" step might be starting from an already-stale copy.
 *
 * Streaks are naturally one-record-per-member, so they're stored the
 * same way with member_id doubling as the record's id.
 *
 * Sync reads (getMembersSync, getChoresSync, ...) still come from a
 * localStorage cache that's kept reasonably up to date by the async
 * calls, purely so the UI has something to show before the first fetch
 * completes.
 */
export class FamilyStore {
  // --- Members ---

  async getMembers(): Promise<FamilyMember[]> {
    return getCollection<FamilyMember>(STORAGE_KEYS.members);
  }

  getMembersSync(): FamilyMember[] {
    return getCollectionSync<FamilyMember>(STORAGE_KEYS.members);
  }

  async addMember(member: Omit<FamilyMember, 'id'>): Promise<FamilyMember> {
    return addToCollection<FamilyMember>(STORAGE_KEYS.members, member);
  }

  async updateMember(id: string, data: Partial<Omit<FamilyMember, 'id'>>): Promise<FamilyMember | null> {
    return updateInCollection<FamilyMember>(STORAGE_KEYS.members, id, data);
  }

  async removeMember(id: string): Promise<boolean> {
    return removeFromCollection(STORAGE_KEYS.members, id);
  }

  // --- Chores ---

  async getChores(): Promise<Chore[]> {
    return getCollection<Chore>(STORAGE_KEYS.chores);
  }

  getChoresSync(): Chore[] {
    return getCollectionSync<Chore>(STORAGE_KEYS.chores);
  }

  async addChore(chore: Omit<Chore, 'id'>): Promise<Chore> {
    return addToCollection<Chore>(STORAGE_KEYS.chores, chore);
  }

  async updateChore(id: string, data: Partial<Omit<Chore, 'id'>>): Promise<Chore | null> {
    return updateInCollection<Chore>(STORAGE_KEYS.chores, id, data);
  }

  async removeChore(id: string): Promise<boolean> {
    return removeFromCollection(STORAGE_KEYS.chores, id);
  }

  // --- Completions ---

  /**
   * Chore completions; with `since`, only those from then on, plus any for
   * one-off chores (see getCollection).
   */
  async getCompletions(since?: Date, onceChoreIds?: string[]): Promise<ChoreCompletion[]> {
    return getCollection<ChoreCompletion>(STORAGE_KEYS.completions, { since, onceChoreIds });
  }

  getCompletionsSync(): ChoreCompletion[] {
    return getCollectionSync<ChoreCompletion>(STORAGE_KEYS.completions);
  }

  /**
   * Completions that count for each chore's current round (see
   * chore-rounds.ts): today's for daily chores, this week's for weekly
   * ones, any for one-offs. Pass `chores` when already loaded.
   */
  async getCurrentCompletions(chores?: Chore[]): Promise<ChoreCompletion[]> {
    const all = chores ?? await this.getChores();
    const weekStartsOn = weekStartsOnSetting();
    const now = new Date();
    const byId = new Map(all.map((c) => [c.id, c]));
    // The earliest round start of a daily or weekly chore is the week's;
    // one-offs are asked for by id, whenever they were done.
    const onceIds = all.filter((c) => c.frequency === 'once').map((c) => c.id);
    const completions = await this.getCompletions(choreRoundStart('weekly', weekStartsOn, now), onceIds);
    return completions.filter((c) => {
      const chore = byId.get(c.chore_id);
      return !!chore && completesCurrentRound(c, chore, weekStartsOn, now);
    });
  }

  async getCompletionsForPeriod(startDate: string, endDate: string): Promise<ChoreCompletion[]> {
    const completions = await this.getCompletions(startOfDay(parseISO(startDate)));
    return completions.filter((c) => {
      const date = localDayKey(c.completed_at);
      return date >= startDate && date <= endDate;
    });
  }

  async completeChore(choreId: string, memberId: string, verifiedBy?: string): Promise<ChoreCompletion> {
    const chores = await this.getChores();
    const current = await this.getCurrentCompletions(chores);
    const existing = current.find((c) => c.chore_id === choreId && c.member_id === memberId);
    if (existing) return existing;

    // Two displays can both pass the check above before either save lands.
    // A stable id lets the server's serialized add (and the local fallback)
    // collapse those requests to one completion for this chore round.
    const chore = chores.find((c) => c.id === choreId);
    const roundKey = choreRoundKey(chore?.frequency, weekStartsOnSetting());

    const completion = await addToCollection<ChoreCompletion>(STORAGE_KEYS.completions, {
      id: choreCompletionId(choreId, memberId, roundKey),
      chore_id: choreId,
      member_id: memberId,
      completed_at: new Date().toISOString(),
      verified_by: verifiedBy,
    });

    // Update streaks
    await this.updateStreakForMember(memberId);

    return completion;
  }

  async uncompleteChore(choreId: string, memberId: string): Promise<boolean> {
    const current = await this.getCurrentCompletions();
    const match = current.find((c) => c.chore_id === choreId && c.member_id === memberId);
    if (!match?.id) return false;
    return removeFromCollection(STORAGE_KEYS.completions, match.id);
  }

  // --- Streaks ---
  // One record per member; member_id doubles as the collection item's id.

  async getStreaks(): Promise<Streak[]> {
    return getCollection<Streak>(STORAGE_KEYS.streaks);
  }

  async getStreakForMember(memberId: string): Promise<Streak> {
    const streaks = await this.getStreaks();
    const existing = streaks.find((s) => s.member_id === memberId);
    return existing ?? { member_id: memberId, current: 0, longest: 0, last_completed: '' };
  }

  private async updateStreakForMember(memberId: string): Promise<void> {
    const streaks = await this.getStreaks();
    const today = localDayKey();
    // By the calendar: after a 23-hour daylight-saving day, now minus 24
    // hours is the day before yesterday just after midnight.
    const yesterday = localDayKey(subDays(new Date(), 1));

    const existing = streaks.find((s) => s.member_id === memberId);
    // No record yet means "never completed". The '' matters: a bare
    // localDayKey(undefined) falls back to its default of now, so a
    // member's first completion would look already counted today and
    // their streak record would never be created.
    const lastDate = localDayKey(existing?.last_completed ?? '');

    if (lastDate === today) {
      // Already counted today
      return;
    }

    const current = lastDate === yesterday ? (existing?.current ?? 0) + 1 : 1;
    const longest = Math.max(existing?.longest ?? 0, current);
    const patch: Streak = {
      member_id: memberId,
      current,
      longest,
      last_completed: new Date().toISOString(),
    };

    if (existing) {
      await updateInCollection<Streak & { id?: string }>(STORAGE_KEYS.streaks, memberId, patch);
    } else {
      await addToCollection<Streak & { id?: string }>(STORAGE_KEYS.streaks, { ...patch, id: memberId } as Streak & { id: string });
    }
  }

  // --- Routines ---

  async getRoutines(): Promise<Routine[]> {
    return getCollection<Routine>(STORAGE_KEYS.routines);
  }

  async getRoutinesForMember(memberId: string): Promise<Routine[]> {
    const routines = await this.getRoutines();
    return routines.filter((r) => r.member_id === memberId);
  }

  async updateRoutine(id: string, data: Partial<Omit<Routine, 'id'>>): Promise<Routine | null> {
    return updateInCollection<Routine>(STORAGE_KEYS.routines, id, data);
  }

  async addRoutine(routine: Omit<Routine, 'id'>): Promise<Routine> {
    return addToCollection<Routine>(STORAGE_KEYS.routines, routine);
  }

  async removeRoutine(id: string): Promise<boolean> {
    return removeFromCollection(STORAGE_KEYS.routines, id);
  }

  // --- Routine task completions ---

  async getRoutineTaskCompletions(since?: Date): Promise<RoutineTaskCompletion[]> {
    return getCollection<RoutineTaskCompletion>(STORAGE_KEYS.routine_completions, { since });
  }

  async getRoutineTaskCompletionsToday(): Promise<RoutineTaskCompletion[]> {
    const today = localDayKey();
    const completions = await this.getRoutineTaskCompletions(startOfToday());
    return completions.filter((c) => localDayKey(c.completed_at) === today);
  }

  async completeRoutineTask(routineId: string, taskId: string, memberId: string): Promise<void> {
    const today = localDayKey();
    const completions = await this.getRoutineTaskCompletions(startOfToday());
    const exists = completions.some(
      (c) =>
        c.routine_id === routineId &&
        c.task_id === taskId &&
        c.member_id === memberId &&
        localDayKey(c.completed_at) === today
    );
    if (exists) return;
    await addToCollection<RoutineTaskCompletion>(STORAGE_KEYS.routine_completions, {
      id: `routine-${encodeURIComponent(routineId)}:${encodeURIComponent(taskId)}:${encodeURIComponent(memberId)}:${today}`,
      routine_id: routineId,
      task_id: taskId,
      member_id: memberId,
      completed_at: new Date().toISOString(),
    });
  }

  async uncompleteRoutineTask(routineId: string, taskId: string, memberId: string): Promise<boolean> {
    const today = localDayKey();
    const completions = await this.getRoutineTaskCompletions(startOfToday());
    const match = completions.find(
      (c) =>
        c.routine_id === routineId &&
        c.task_id === taskId &&
        c.member_id === memberId &&
        localDayKey(c.completed_at) === today
    );
    if (!match?.id) return false;
    return removeFromCollection(STORAGE_KEYS.routine_completions, match.id);
  }
}
