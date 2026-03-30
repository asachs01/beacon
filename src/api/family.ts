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

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Get the base path for beacon-data API calls (ingress-aware) */
function getDataApiBase(): string {
  if (window.__BEACON_CONFIG__) {
    return window.location.pathname.replace(/\/$/, '');
  }
  return '';
}

/** Load data: try server-side persistence first, fall back to localStorage */
function loadFromStorage<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save data to localStorage AND server-side persistence (fire-and-forget) */
function saveToStorage<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
  // Also persist to server if in add-on mode
  if (window.__BEACON_CONFIG__) {
    const base = getDataApiBase();
    fetch(`${base}/beacon-data/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => { /* server persistence is best-effort */ });
  }
}

/**
 * Restore data from server synchronously BEFORE React renders.
 * Uses synchronous XHR to win the race against useState initializers.
 */
function restoreFromServerSync(key: string): void {
  if (!window.__BEACON_CONFIG__) return;
  const localRaw = localStorage.getItem(key);
  if (localRaw) return; // already have data

  try {
    const base = getDataApiBase();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${base}/beacon-data/${key}`, false); // synchronous
    xhr.send();
    if (xhr.status === 200 && xhr.responseText && xhr.responseText !== 'null') {
      const serverData = JSON.parse(xhr.responseText);
      if (Array.isArray(serverData) && serverData.length > 0) {
        localStorage.setItem(key, JSON.stringify(serverData));
      }
    }
  } catch { /* best-effort */ }
}

// Restore all family data keys BEFORE React mounts
Object.values(STORAGE_KEYS).forEach(restoreFromServerSync);

/**
 * Family data store.
 * Uses localStorage as the primary store with server-side persistence
 * in add-on mode (/data/ directory survives container rebuilds).
 */
export class FamilyStore {
  constructor(_haClient?: () => HomeAssistantClient | null) {
    // Server restore happens at module load (synchronous, before React)
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
    return newMember;
  }

  updateMember(id: string, data: Partial<Omit<FamilyMember, 'id'>>): FamilyMember | null {
    const members = this.getMembers();
    const index = members.findIndex((m) => m.id === id);
    if (index === -1) return null;
    members[index] = { ...members[index], ...data };
    saveToStorage(STORAGE_KEYS.members, members);
    return members[index];
  }

  removeMember(id: string): boolean {
    const members = this.getMembers();
    const filtered = members.filter((m) => m.id !== id);
    if (filtered.length === members.length) return false;
    saveToStorage(STORAGE_KEYS.members, filtered);
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
    return newChore;
  }

  updateChore(id: string, data: Partial<Omit<Chore, 'id'>>): Chore | null {
    const chores = this.getChores();
    const index = chores.findIndex((c) => c.id === id);
    if (index === -1) return null;
    chores[index] = { ...chores[index], ...data };
    saveToStorage(STORAGE_KEYS.chores, chores);
    return chores[index];
  }

  removeChore(id: string): boolean {
    const chores = this.getChores();
    const filtered = chores.filter((c) => c.id !== id);
    if (filtered.length === chores.length) return false;
    saveToStorage(STORAGE_KEYS.chores, filtered);
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
    return newRoutine;
  }

  removeRoutine(id: string): boolean {
    const routines = this.getRoutines();
    const filtered = routines.filter((r) => r.id !== id);
    if (filtered.length === routines.length) return false;
    saveToStorage(STORAGE_KEYS.routines, filtered);
    return true;
  }
}
