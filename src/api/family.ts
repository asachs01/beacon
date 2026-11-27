import {
  FamilyMember,
  Chore,
  ChoreCompletion,
  Streak,
  Routine,
  RoutineTaskCompletion,
  UNCREDITED_MEMBER_ID,
  memberCreditedForCompletion,
} from '../types/family';
import { loadData, loadDataSync, saveData } from './beacon-store';
import { advanceStreak, choreDayKey, localDayKey } from './date-keys';
import { applyPrivilegeDecision, publishChoreEvents } from './chore-bridge';
import {
  eventsForChoreChange,
  memberProgress,
  privilegeDecision,
} from './chore-privileges';

const STORAGE_KEYS = {
  members: 'beacon_family_members',
  chores: 'beacon_chores',
  completions: 'beacon_completions',
  streaks: 'beacon_streaks',
  routines: 'beacon_routines',
  routine_completions: 'beacon_routine_completions',
} as const;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function choreToday(resetTime?: string | null): string {
  return choreDayKey(undefined, null, resetTime);
}

function completedOnChoreDay(completedAt: string, today: string, resetTime?: string | null): boolean {
  return choreDayKey(completedAt, null, resetTime) === today;
}

/**
 * Family data store.
 *
 * Server (/beacon-data/) is the source of truth in add-on mode.
 * localStorage is used as a sync cache and as the primary store
 * during local development.
 *
 * Read methods are async (they fetch from server first).
 * Write methods update localStorage immediately and push to server
 * in the background.
 */
export class FamilyStore {
  // --- Members ---

  async getMembers(): Promise<FamilyMember[]> {
    return loadData<FamilyMember[]>(STORAGE_KEYS.members, []);
  }

  getMembersSync(): FamilyMember[] {
    return loadDataSync<FamilyMember[]>(STORAGE_KEYS.members, []);
  }

  async addMember(member: Omit<FamilyMember, 'id'>): Promise<FamilyMember> {
    const members = await this.getMembers();
    const newMember: FamilyMember = { ...member, id: generateId() };
    members.push(newMember);
    await saveData(STORAGE_KEYS.members, members);
    return newMember;
  }

  async updateMember(id: string, data: Partial<Omit<FamilyMember, 'id'>>): Promise<FamilyMember | null> {
    const members = await this.getMembers();
    const index = members.findIndex((m) => m.id === id);
    if (index === -1) return null;
    members[index] = { ...members[index], ...data };
    await saveData(STORAGE_KEYS.members, members);
    return members[index];
  }

  async removeMember(id: string): Promise<boolean> {
    const members = await this.getMembers();
    const filtered = members.filter((m) => m.id !== id);
    if (filtered.length === members.length) return false;
    await saveData(STORAGE_KEYS.members, filtered);
    return true;
  }

  // --- Chores ---

  async getChores(): Promise<Chore[]> {
    return loadData<Chore[]>(STORAGE_KEYS.chores, []);
  }

  getChoresSync(): Chore[] {
    return loadDataSync<Chore[]>(STORAGE_KEYS.chores, []);
  }

  async addChore(chore: Omit<Chore, 'id'>): Promise<Chore> {
    const chores = await this.getChores();
    const newChore: Chore = { ...chore, id: generateId() };
    chores.push(newChore);
    await saveData(STORAGE_KEYS.chores, chores);
    return newChore;
  }

  async updateChore(id: string, data: Partial<Omit<Chore, 'id'>>): Promise<Chore | null> {
    const chores = await this.getChores();
    const index = chores.findIndex((c) => c.id === id);
    if (index === -1) return null;
    chores[index] = { ...chores[index], ...data };
    await saveData(STORAGE_KEYS.chores, chores);
    return chores[index];
  }

  async removeChore(id: string): Promise<boolean> {
    const chores = await this.getChores();
    const filtered = chores.filter((c) => c.id !== id);
    if (filtered.length === chores.length) return false;
    await saveData(STORAGE_KEYS.chores, filtered);
    return true;
  }

  // --- Completions ---

  async getCompletions(): Promise<ChoreCompletion[]> {
    return loadData<ChoreCompletion[]>(STORAGE_KEYS.completions, []);
  }

  getCompletionsSync(): ChoreCompletion[] {
    return loadDataSync<ChoreCompletion[]>(STORAGE_KEYS.completions, []);
  }

  async getCompletionsToday(resetTime?: string | null): Promise<ChoreCompletion[]> {
    const today = choreToday(resetTime);
    const completions = await this.getCompletions();
    return completions.filter((c) => completedOnChoreDay(c.completed_at, today, resetTime));
  }

  async getCompletionsForPeriod(startDate: string, endDate: string): Promise<ChoreCompletion[]> {
    const completions = await this.getCompletions();
    return completions.filter((c) => {
      const date = localDayKey(c.completed_at);
      return date >= startDate && date <= endDate;
    });
  }

  async completeChore(
    choreId: string,
    memberId: string,
    verifiedBy?: string,
    resetTime?: string | null,
    by?: ChoreCompletion['by'],
  ): Promise<ChoreCompletion> {
    const chores = this.getChoresSync();
    const chore = chores.find((entry) => entry.id === choreId);
    const creditedMemberId = memberCreditedForCompletion(memberId, chore?.assigned_to, by);
    const completions = await this.getCompletions();
    const today = choreToday(resetTime);
    const existing = completions.find(
      (c) =>
        c.chore_id === choreId &&
        c.member_id === creditedMemberId &&
        completedOnChoreDay(c.completed_at, today, resetTime)
    );
    if (existing) return existing;
    const uncredited = creditedMemberId === UNCREDITED_MEMBER_ID;
    const progressBefore = uncredited
      ? { completed: 0, total: 0 }
      : memberProgress(creditedMemberId, chores, completions, today, null, resetTime);
    const completion: ChoreCompletion = {
      chore_id: choreId,
      member_id: creditedMemberId,
      completed_at: new Date().toISOString(),
      verified_by: verifiedBy,
      ...(by === 'guest' ? { by: 'guest' as const } : {}),
    };
    completions.push(completion);
    await saveData(STORAGE_KEYS.completions, completions);

    // A guest check-off with no assignee is not a family member's chore.
    if (uncredited) return completion;

    // Count the streak on this chore day. Older streak rows are not rewritten.
    await this.updateStreakForMember(creditedMemberId, resetTime);

    const progressAfter = memberProgress(creditedMemberId, chores, completions, today, null, resetTime);
    void this.emitChoreChange({
      choreId,
      memberId: creditedMemberId,
      completed: true,
      localDate: today,
      resetTime,
      completions,
      progressBefore,
      progressAfter,
    });

    return completion;
  }

  async uncompleteChore(choreId: string, memberId: string, resetTime?: string | null): Promise<boolean> {
    const completions = await this.getCompletions();
    const today = choreToday(resetTime);
    const index = completions.findIndex(
      (c) =>
        c.chore_id === choreId &&
        c.member_id === memberId &&
        completedOnChoreDay(c.completed_at, today, resetTime)
    );
    if (index === -1) return false;
    const chores = this.getChoresSync();
    const progressBefore = memberProgress(memberId, chores, completions, today, null, resetTime);
    completions.splice(index, 1);
    await saveData(STORAGE_KEYS.completions, completions);
    const progressAfter = memberProgress(memberId, chores, completions, today, null, resetTime);
    void this.emitChoreChange({
      choreId,
      memberId,
      completed: false,
      localDate: today,
      resetTime,
      completions,
      progressBefore,
      progressAfter,
    });
    return true;
  }

  /**
   * Fire HA events and set the privilege switch after the completion list is
   * saved. Errors are logged and never reject the chore toggle.
   */
  private async emitChoreChange(args: {
    choreId: string;
    memberId: string;
    completed: boolean;
    localDate: string;
    resetTime?: string | null;
    completions: ChoreCompletion[];
    progressBefore: { completed: number; total: number };
    progressAfter: { completed: number; total: number };
  }): Promise<void> {
    try {
      const members = this.getMembersSync();
      const chores = this.getChoresSync();
      const member = members.find((entry) => entry.id === args.memberId) ?? {
        id: args.memberId,
        name: '',
        avatar: '',
        color: '',
        role: 'child' as const,
      };
      const chore = chores.find((entry) => entry.id === args.choreId) ?? {
        id: args.choreId,
        name: '',
        assigned_to: [args.memberId],
        frequency: 'daily' as const,
        value_cents: 0,
      };
      const events = eventsForChoreChange({
        member,
        chore,
        completed: args.completed,
        localDate: args.localDate,
        progressBefore: args.progressBefore,
        progressAfter: args.progressAfter,
      });
      await publishChoreEvents(events);
      await applyPrivilegeDecision(
        privilegeDecision(member, chores, args.completions, args.localDate, null, args.resetTime),
      );
    } catch (err) {
      console.warn('[beacon] chore side effects failed', err);
    }
  }

  // --- Streaks ---

  async getStreaks(): Promise<Streak[]> {
    return loadData<Streak[]>(STORAGE_KEYS.streaks, []);
  }

  async getStreakForMember(memberId: string): Promise<Streak> {
    const streaks = await this.getStreaks();
    const existing = streaks.find((s) => s.member_id === memberId);
    return existing ?? { member_id: memberId, current: 0, longest: 0, last_completed: '' };
  }

  /**
   * Count this completion on the chore day from Daily Reset Time.
   * A row that already counted this chore day is left untouched, including
   * rows saved before streaks stored `last_chore_day`.
   */
  private async updateStreakForMember(memberId: string, resetTime?: string | null): Promise<void> {
    const streaks = await this.getStreaks();
    const index = streaks.findIndex((streak) => streak.member_id === memberId);
    const existing: Streak = index === -1
      ? { member_id: memberId, current: 0, longest: 0, last_completed: '' }
      : streaks[index];
    const updated = advanceStreak(existing, new Date(), null, resetTime);
    if (updated === existing) return;
    if (index === -1) streaks.push(updated);
    else streaks[index] = updated;
    await saveData(STORAGE_KEYS.streaks, streaks);
  }

  // --- Routines ---

  async getRoutines(): Promise<Routine[]> {
    return loadData<Routine[]>(STORAGE_KEYS.routines, []);
  }

  async getRoutinesForMember(memberId: string): Promise<Routine[]> {
    const routines = await this.getRoutines();
    return routines.filter((r) => r.member_id === memberId);
  }

  async updateRoutine(id: string, data: Partial<Omit<Routine, 'id'>>): Promise<Routine | null> {
    const routines = await this.getRoutines();
    const index = routines.findIndex((r) => r.id === id);
    if (index === -1) return null;
    routines[index] = { ...routines[index], ...data };
    await saveData(STORAGE_KEYS.routines, routines);
    return routines[index];
  }

  async addRoutine(routine: Omit<Routine, 'id'>): Promise<Routine> {
    const routines = await this.getRoutines();
    const newRoutine: Routine = { ...routine, id: generateId() };
    routines.push(newRoutine);
    await saveData(STORAGE_KEYS.routines, routines);
    return newRoutine;
  }

  async removeRoutine(id: string): Promise<boolean> {
    const routines = await this.getRoutines();
    const filtered = routines.filter((r) => r.id !== id);
    if (filtered.length === routines.length) return false;
    await saveData(STORAGE_KEYS.routines, filtered);
    return true;
  }

  // --- Routine task completions ---

  async getRoutineTaskCompletions(): Promise<RoutineTaskCompletion[]> {
    return loadData<RoutineTaskCompletion[]>(STORAGE_KEYS.routine_completions, []);
  }

  async getRoutineTaskCompletionsToday(): Promise<RoutineTaskCompletion[]> {
    // Routines are clock-tied, not chore-chart-tied: the day is calendar midnight.
    const today = localDayKey();
    const completions = await this.getRoutineTaskCompletions();
    // Same calendar-midnight day: routines are clock-tied, not chore-chart-tied.
    return completions.filter((c) => localDayKey(c.completed_at) === today);
  }

  async completeRoutineTask(routineId: string, taskId: string, memberId: string): Promise<void> {
    const completions = await this.getRoutineTaskCompletions();
    // Routines are clock-tied, not chore-chart-tied: the day is calendar midnight.
    const today = localDayKey();
    const exists = completions.some(
      (c) =>
        c.routine_id === routineId &&
        c.task_id === taskId &&
        c.member_id === memberId &&
        localDayKey(c.completed_at) === today // calendar midnight; routines are clock-tied, not chore-chart-tied
    );
    if (exists) return;
    completions.push({
      routine_id: routineId,
      task_id: taskId,
      member_id: memberId,
      completed_at: new Date().toISOString(),
    });
    await saveData(STORAGE_KEYS.routine_completions, completions);
  }

  async uncompleteRoutineTask(routineId: string, taskId: string, memberId: string): Promise<boolean> {
    const completions = await this.getRoutineTaskCompletions();
    // Routines are clock-tied, not chore-chart-tied: the day is calendar midnight.
    const today = localDayKey();
    const index = completions.findIndex(
      (c) =>
        c.routine_id === routineId &&
        c.task_id === taskId &&
        c.member_id === memberId &&
        localDayKey(c.completed_at) === today // calendar midnight; routines are clock-tied, not chore-chart-tied
    );
    if (index === -1) return false;
    completions.splice(index, 1);
    await saveData(STORAGE_KEYS.routine_completions, completions);
    return true;
  }
}
