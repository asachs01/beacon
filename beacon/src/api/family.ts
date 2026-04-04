import {
  FamilyMember,
  Chore,
  ChoreCompletion,
  Streak,
  Routine,
  Payout,
} from '../types/family';
import { loadData, loadDataSync, saveData } from './beacon-store';

const STORAGE_KEYS = {
  members: 'beacon_family_members',
  chores: 'beacon_chores',
  completions: 'beacon_completions',
  streaks: 'beacon_streaks',
  routines: 'beacon_routines',
  payouts: 'beacon_payouts',
} as const;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  async getCompletionsToday(): Promise<ChoreCompletion[]> {
    const today = new Date().toISOString().slice(0, 10);
    const completions = await this.getCompletions();
    return completions.filter(
      (c) => c.completed_at.slice(0, 10) === today
    );
  }

  async getCompletionsForPeriod(startDate: string, endDate: string): Promise<ChoreCompletion[]> {
    const completions = await this.getCompletions();
    return completions.filter((c) => {
      const date = c.completed_at.slice(0, 10);
      return date >= startDate && date <= endDate;
    });
  }

  async completeChore(choreId: string, memberId: string, verifiedBy?: string): Promise<ChoreCompletion> {
    const completions = await this.getCompletions();
    const completion: ChoreCompletion = {
      chore_id: choreId,
      member_id: memberId,
      completed_at: new Date().toISOString(),
      verified_by: verifiedBy,
    };
    completions.push(completion);
    await saveData(STORAGE_KEYS.completions, completions);

    // Update streaks
    await this.updateStreakForMember(memberId);

    return completion;
  }

  async uncompleteChore(choreId: string, memberId: string): Promise<boolean> {
    const completions = await this.getCompletions();
    const today = new Date().toISOString().slice(0, 10);
    const index = completions.findIndex(
      (c) =>
        c.chore_id === choreId &&
        c.member_id === memberId &&
        c.completed_at.slice(0, 10) === today
    );
    if (index === -1) return false;
    completions.splice(index, 1);
    await saveData(STORAGE_KEYS.completions, completions);
    return true;
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

  private async updateStreakForMember(memberId: string): Promise<void> {
    const streaks = await this.getStreaks();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let streak = streaks.find((s) => s.member_id === memberId);
    if (!streak) {
      streak = { member_id: memberId, current: 0, longest: 0, last_completed: '' };
      streaks.push(streak);
    }

    const lastDate = streak.last_completed.slice(0, 10);

    if (lastDate === today) {
      // Already counted today
      return;
    }

    if (lastDate === yesterday) {
      streak.current += 1;
    } else {
      streak.current = 1;
    }

    streak.longest = Math.max(streak.longest, streak.current);
    streak.last_completed = new Date().toISOString();

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

  // --- Payouts ---

  async getPayouts(): Promise<Payout[]> {
    return loadData<Payout[]>(STORAGE_KEYS.payouts, []);
  }

  getPayoutsSync(): Payout[] {
    return loadDataSync<Payout[]>(STORAGE_KEYS.payouts, []);
  }

  async addPayout(payout: Omit<Payout, 'id'>): Promise<Payout> {
    const payouts = await this.getPayouts();
    const newPayout: Payout = { ...payout, id: generateId() };
    payouts.push(newPayout);
    await saveData(STORAGE_KEYS.payouts, payouts);
    return newPayout;
  }

  async getBalance(memberId: string): Promise<number> {
    const [completions, chores, payouts] = await Promise.all([
      this.getCompletions(),
      this.getChores(),
      this.getPayouts(),
    ]);

    const choreMap = new Map(chores.map((c) => [c.id, c]));

    // Sum earned from completed chores
    const earned = completions
      .filter((c) => c.member_id === memberId)
      .reduce((sum, c) => {
        const chore = choreMap.get(c.chore_id);
        return sum + (chore?.value_cents ?? 0);
      }, 0);

    // Sum payouts already made
    const paid = payouts
      .filter((p) => p.member_id === memberId)
      .reduce((sum, p) => sum + p.amount_cents, 0);

    return earned - paid;
  }

  getBalanceSync(memberId: string): number {
    const completions = this.getCompletionsSync();
    const chores = this.getChoresSync();
    const payouts = this.getPayoutsSync();

    const choreMap = new Map(chores.map((c) => [c.id, c]));

    const earned = completions
      .filter((c) => c.member_id === memberId)
      .reduce((sum, c) => {
        const chore = choreMap.get(c.chore_id);
        return sum + (chore?.value_cents ?? 0);
      }, 0);

    const paid = payouts
      .filter((p) => p.member_id === memberId)
      .reduce((sum, p) => sum + p.amount_cents, 0);

    return earned - paid;
  }
}
