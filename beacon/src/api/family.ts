import { HomeAssistantClient } from './homeassistant';
import {
  FamilyMember,
  Chore,
  ChoreCompletion,
  Streak,
  Routine,
} from '../types/family';

const STORAGE_KEYS = {
  members: 'beacon_family_members',
  chores: 'beacon_chores',
  completions: 'beacon_completions',
  streaks: 'beacon_streaks',
  routines: 'beacon_routines',
} as const;

/** HA entity IDs for syncing family data (input_text helpers) */
const HA_HELPERS = {
  members: 'input_text.beacon_family_members',
  chores: 'input_text.beacon_chores',
  completions: 'input_text.beacon_completions',
  streaks: 'input_text.beacon_streaks',
  routines: 'input_text.beacon_routines',
} as const;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadFromStorage<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Family data store.
 * Uses localStorage as the primary store.
 * When an HA client is provided and connected, syncs data to HA input_text helpers.
 */
export class FamilyStore {
  private haClient: (() => HomeAssistantClient | null) | null = null;

  constructor(haClient?: () => HomeAssistantClient | null) {
    this.haClient = haClient ?? null;
  }

  // --- HA Sync Helpers ---

  private async syncToHA(helperEntity: string, data: unknown): Promise<void> {
    const client = this.haClient?.();
    if (!client?.isConnected) return;

    try {
      // HA input_text has a 255-char limit; use a truncated version or skip
      const json = JSON.stringify(data);
      if (json.length > 255) {
        // For larger payloads, we rely on localStorage only
        // A production system would use HA's REST API or a custom component
        return;
      }
      await (client as unknown as { sendMessage(msg: Record<string, unknown>): Promise<unknown> })
        .sendMessage?.({
          type: 'call_service',
          domain: 'input_text',
          service: 'set_value',
          target: { entity_id: helperEntity },
          service_data: { value: json },
        });
    } catch {
      // Silently fall back to localStorage-only
    }
  }

  // --- Members ---

  getMembers(): FamilyMember[] {
    return loadFromStorage<FamilyMember>(STORAGE_KEYS.members);
  }

  addMember(member: Omit<FamilyMember, 'id'>): FamilyMember {
    const members = this.getMembers();
    const newMember: FamilyMember = { ...member, id: generateId() };
    members.push(newMember);
    saveToStorage(STORAGE_KEYS.members, members);
    this.syncToHA(HA_HELPERS.members, members);
    return newMember;
  }

  updateMember(id: string, data: Partial<Omit<FamilyMember, 'id'>>): FamilyMember | null {
    const members = this.getMembers();
    const index = members.findIndex((m) => m.id === id);
    if (index === -1) return null;
    members[index] = { ...members[index], ...data };
    saveToStorage(STORAGE_KEYS.members, members);
    this.syncToHA(HA_HELPERS.members, members);
    return members[index];
  }

  removeMember(id: string): boolean {
    const members = this.getMembers();
    const filtered = members.filter((m) => m.id !== id);
    if (filtered.length === members.length) return false;
    saveToStorage(STORAGE_KEYS.members, filtered);
    this.syncToHA(HA_HELPERS.members, filtered);
    return true;
  }

  // --- Chores ---

  getChores(): Chore[] {
    return loadFromStorage<Chore>(STORAGE_KEYS.chores);
  }

  addChore(chore: Omit<Chore, 'id'>): Chore {
    const chores = this.getChores();
    const newChore: Chore = { ...chore, id: generateId() };
    chores.push(newChore);
    saveToStorage(STORAGE_KEYS.chores, chores);
    this.syncToHA(HA_HELPERS.chores, chores);
    return newChore;
  }

  updateChore(id: string, data: Partial<Omit<Chore, 'id'>>): Chore | null {
    const chores = this.getChores();
    const index = chores.findIndex((c) => c.id === id);
    if (index === -1) return null;
    chores[index] = { ...chores[index], ...data };
    saveToStorage(STORAGE_KEYS.chores, chores);
    this.syncToHA(HA_HELPERS.chores, chores);
    return chores[index];
  }

  removeChore(id: string): boolean {
    const chores = this.getChores();
    const filtered = chores.filter((c) => c.id !== id);
    if (filtered.length === chores.length) return false;
    saveToStorage(STORAGE_KEYS.chores, filtered);
    this.syncToHA(HA_HELPERS.chores, filtered);
    return true;
  }

  // --- Completions ---

  getCompletions(): ChoreCompletion[] {
    return loadFromStorage<ChoreCompletion>(STORAGE_KEYS.completions);
  }

  getCompletionsToday(): ChoreCompletion[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.getCompletions().filter(
      (c) => c.completed_at.slice(0, 10) === today
    );
  }

  getCompletionsForPeriod(startDate: string, endDate: string): ChoreCompletion[] {
    return this.getCompletions().filter((c) => {
      const date = c.completed_at.slice(0, 10);
      return date >= startDate && date <= endDate;
    });
  }

  completeChore(choreId: string, memberId: string, verifiedBy?: string): ChoreCompletion {
    const completions = this.getCompletions();
    const completion: ChoreCompletion = {
      chore_id: choreId,
      member_id: memberId,
      completed_at: new Date().toISOString(),
      verified_by: verifiedBy,
    };
    completions.push(completion);
    saveToStorage(STORAGE_KEYS.completions, completions);

    // Update streaks
    this.updateStreakForMember(memberId);

    return completion;
  }

  uncompleteChore(choreId: string, memberId: string): boolean {
    const completions = this.getCompletions();
    const today = new Date().toISOString().slice(0, 10);
    const index = completions.findIndex(
      (c) =>
        c.chore_id === choreId &&
        c.member_id === memberId &&
        c.completed_at.slice(0, 10) === today
    );
    if (index === -1) return false;
    completions.splice(index, 1);
    saveToStorage(STORAGE_KEYS.completions, completions);
    return true;
  }

  // --- Streaks ---

  getStreaks(): Streak[] {
    return loadFromStorage<Streak>(STORAGE_KEYS.streaks);
  }

  getStreakForMember(memberId: string): Streak {
    const streaks = this.getStreaks();
    const existing = streaks.find((s) => s.member_id === memberId);
    return existing ?? { member_id: memberId, current: 0, longest: 0, last_completed: '' };
  }

  private updateStreakForMember(memberId: string): void {
    const streaks = this.getStreaks();
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

    saveToStorage(STORAGE_KEYS.streaks, streaks);
    this.syncToHA(HA_HELPERS.streaks, streaks);
  }

  // --- Routines ---

  getRoutines(): Routine[] {
    return loadFromStorage<Routine>(STORAGE_KEYS.routines);
  }

  getRoutinesForMember(memberId: string): Routine[] {
    return this.getRoutines().filter((r) => r.member_id === memberId);
  }

  addRoutine(routine: Omit<Routine, 'id'>): Routine {
    const routines = this.getRoutines();
    const newRoutine: Routine = { ...routine, id: generateId() };
    routines.push(newRoutine);
    saveToStorage(STORAGE_KEYS.routines, routines);
    this.syncToHA(HA_HELPERS.routines, routines);
    return newRoutine;
  }

  removeRoutine(id: string): boolean {
    const routines = this.getRoutines();
    const filtered = routines.filter((r) => r.id !== id);
    if (filtered.length === routines.length) return false;
    saveToStorage(STORAGE_KEYS.routines, filtered);
    this.syncToHA(HA_HELPERS.routines, filtered);
    return true;
  }
}
