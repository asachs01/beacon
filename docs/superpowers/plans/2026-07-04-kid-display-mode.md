# Kid Display Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock a wall-mounted screen to one family member and show only their time-of-day routine and chores with tap-to-complete.

**Architecture:** An early-return "focus shell" branch in `App.tsx` (same pattern as `OnboardingView`) renders a new `FocusView` when a focus member is resolved from `?display=<memberId>` URL param or the device-local `localStorage` key. Routine completions are date-stamped records mirroring `ChoreCompletion`, so routines reset daily with no midnight job. A routine editor lives in Settings → Family; a display picker lives in Settings → Display.

**Tech Stack:** React 19 + TypeScript + Vite, date-fns, lucide-react icons, existing `beacon-store` persistence (server-first + localStorage cache).

**Spec:** `docs/superpowers/specs/2026-07-04-kid-display-mode-design.md`

## Global Constraints

- No test infrastructure exists in this repo; each task verifies with `npm run build` (runs `tsc && vite build`) and, where UI-visible, by driving the app with `npm run dev`.
- The focus member assignment must NEVER be stored in `BeaconSettings` (it syncs across devices via `beacon-store`); device-local state uses plain `localStorage` key `beacon_display_member`.
- URL param name is exactly `display`; localStorage key is exactly `beacon_display_member`; storage key for completions is exactly `beacon_routine_completions`.
- "Today" comparisons use `new Date().toISOString().slice(0, 10)` (UTC date) — this matches the existing `ChoreCompletion` behavior exactly. Do not "fix" this to local time in this feature; consistency with chores on the same screen wins.
- Follow existing idioms: hooks mirror `useChores`, settings rows use `settings-row`/`Toggle`/`Segment`, CSS uses theme custom properties (`var(--bg-primary)`, `var(--accent)`, `var(--border)`, etc.).
- Commit messages use conventional commits (`feat:`, `refactor:`) — semantic-release generates the changelog from them; do not hand-edit `CHANGELOG.md`.
- After ALL tasks complete: `rsync -av --delete src/ beacon/src/` (HA builds from `beacon/`, not repo root).

---

### Task 1: Data layer — RoutineTaskCompletion type and FamilyStore methods

**Files:**
- Modify: `src/types/family.ts` (Routine/RoutineTask block, lines 34–47)
- Modify: `src/api/family.ts` (STORAGE_KEYS at line 10, Routines section at line 204)

**Interfaces:**
- Consumes: existing `loadData`/`saveData` from `src/api/beacon-store.ts`.
- Produces (later tasks rely on these exact signatures):
  - `interface RoutineTaskCompletion { routine_id: string; task_id: string; member_id: string; completed_at: string }`
  - `FamilyStore.updateRoutine(id: string, data: Partial<Omit<Routine, 'id'>>): Promise<Routine | null>`
  - `FamilyStore.getRoutineTaskCompletionsToday(): Promise<RoutineTaskCompletion[]>`
  - `FamilyStore.completeRoutineTask(routineId: string, taskId: string, memberId: string): Promise<void>`
  - `FamilyStore.uncompleteRoutineTask(routineId: string, taskId: string, memberId: string): Promise<boolean>`

- [ ] **Step 1: Update types**

In `src/types/family.ts`, replace the `RoutineTask` interface (lines 42–47) — the `completed` boolean is removed (verified zero consumers) — and add `RoutineTaskCompletion` after it:

```ts
export interface RoutineTask {
  id: string;
  name: string;
  order: number;
}

/** A member checking off one routine task on one day (mirrors ChoreCompletion) */
export interface RoutineTaskCompletion {
  routine_id: string;
  task_id: string;
  member_id: string;
  completed_at: string; // ISO date string for serialization
}
```

- [ ] **Step 2: Add storage key and FamilyStore methods**

In `src/api/family.ts`:

1. Add to the import from `'../types/family'`: `RoutineTaskCompletion`.
2. Add to `STORAGE_KEYS`: `routine_completions: 'beacon_routine_completions',`
3. In the `// --- Routines ---` section, add after `getRoutinesForMember`:

```ts
  async updateRoutine(id: string, data: Partial<Omit<Routine, 'id'>>): Promise<Routine | null> {
    const routines = await this.getRoutines();
    const index = routines.findIndex((r) => r.id === id);
    if (index === -1) return null;
    routines[index] = { ...routines[index], ...data };
    await saveData(STORAGE_KEYS.routines, routines);
    return routines[index];
  }
```

4. Add a new section at the end of the class, before the closing brace:

```ts
  // --- Routine task completions ---

  async getRoutineTaskCompletions(): Promise<RoutineTaskCompletion[]> {
    return loadData<RoutineTaskCompletion[]>(STORAGE_KEYS.routine_completions, []);
  }

  async getRoutineTaskCompletionsToday(): Promise<RoutineTaskCompletion[]> {
    const today = new Date().toISOString().slice(0, 10);
    const completions = await this.getRoutineTaskCompletions();
    return completions.filter((c) => c.completed_at.slice(0, 10) === today);
  }

  async completeRoutineTask(routineId: string, taskId: string, memberId: string): Promise<void> {
    const completions = await this.getRoutineTaskCompletions();
    const today = new Date().toISOString().slice(0, 10);
    const exists = completions.some(
      (c) =>
        c.routine_id === routineId &&
        c.task_id === taskId &&
        c.member_id === memberId &&
        c.completed_at.slice(0, 10) === today
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
    const today = new Date().toISOString().slice(0, 10);
    const index = completions.findIndex(
      (c) =>
        c.routine_id === routineId &&
        c.task_id === taskId &&
        c.member_id === memberId &&
        c.completed_at.slice(0, 10) === today
    );
    if (index === -1) return false;
    completions.splice(index, 1);
    await saveData(STORAGE_KEYS.routine_completions, completions);
    return true;
  }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors (nothing consumed `RoutineTask.completed`, so its removal breaks nothing).

- [ ] **Step 4: Commit**

```bash
git add src/types/family.ts src/api/family.ts
git commit -m "feat: add routine task completion records to family store"
```

---

### Task 2: useRoutines hook

**Files:**
- Create: `src/hooks/useRoutines.ts`

**Interfaces:**
- Consumes: `FamilyStore` methods from Task 1, `Routine`/`RoutineTaskCompletion` types.
- Produces: `useRoutines(memberId?: string)` returning `{ routines, completionsToday, addRoutine, updateRoutine, removeRoutine, toggleTask, isTaskCompletedToday, refresh }`. Exact signatures below — Tasks 4 and 7 call these.

- [ ] **Step 1: Create the hook (mirrors `src/hooks/useChores.ts`)**

```ts
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. (The hook is not imported anywhere yet; `tsc` still type-checks it.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRoutines.ts
git commit -m "feat: add useRoutines hook"
```

---

### Task 3: Focus mode resolution module

**Files:**
- Create: `src/focus.ts`

**Interfaces:**
- Produces (Tasks 5–6 rely on these):
  - `getFocusMemberId(): string | null` — URL `?display=` wins, else localStorage.
  - `setDeviceFocusMember(id: string | null): void`
  - `clearFocusMode(): void` — clears localStorage key AND strips the URL param via `history.replaceState`.
  - `buildFocusUrl(memberId: string): string`

- [ ] **Step 1: Create `src/focus.ts`**

```ts
/**
 * Kid Display (focus mode) resolution.
 *
 * A display is locked to one family member either by URL param
 * (?display=<memberId>, wins — survives kiosk-browser reboots) or by a
 * device-local localStorage key.
 *
 * Deliberately NOT part of BeaconSettings: settings sync across devices
 * via beacon-store, and the display assignment must stay per-device.
 */

const FOCUS_STORAGE_KEY = 'beacon_display_member';
const FOCUS_URL_PARAM = 'display';

export function getFocusMemberId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get(FOCUS_URL_PARAM);
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(FOCUS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setDeviceFocusMember(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(FOCUS_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(FOCUS_STORAGE_KEY);
    }
  } catch {
    /* localStorage unavailable */
  }
}

export function clearFocusMode(): void {
  setDeviceFocusMember(null);
  const url = new URL(window.location.href);
  if (url.searchParams.has(FOCUS_URL_PARAM)) {
    url.searchParams.delete(FOCUS_URL_PARAM);
    window.history.replaceState({}, '', url);
  }
}

export function buildFocusUrl(memberId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(FOCUS_URL_PARAM, memberId);
  return url.toString();
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/focus.ts
git commit -m "feat: add focus mode resolution module"
```

---

### Task 4: FocusView components and styles

**Files:**
- Create: `src/components/focus/period.ts`
- Create: `src/components/focus/RoutineCard.tsx`
- Create: `src/components/focus/FocusChores.tsx`
- Create: `src/components/focus/FocusView.tsx`
- Create: `src/styles/focus.css`
- Modify: `src/main.tsx` (add css import after line 14)

**Interfaces:**
- Consumes: `useRoutines` (Task 2), `useFamily`, `useChores`, `ScreenSaver`, `BeaconSettings`, `hapticMedium`/`hapticSuccess` from `src/hooks/useHaptics.ts`.
- Produces: `<FocusView memberId={string} settings={BeaconSettings} onExit={() => void} />` — Task 5 renders exactly this.

- [ ] **Step 1: Create `src/components/focus/period.ts`** (pure time-of-day logic)

```ts
import { Routine } from '../../types/family';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

const ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening'];

/** morning < 12:00, afternoon 12:00–16:59, evening >= 17:00 (local time) */
export function getTimeOfDay(date: Date): TimeOfDay {
  const h = date.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export interface RoutinePick {
  routine: Routine;
  isCurrent: boolean;
  /** empty when current; otherwise e.g. "This afternoon", "Tonight", "Tomorrow morning" */
  label: string;
}

const PREVIEW_LABELS: Record<TimeOfDay, string> = {
  morning: 'This morning',
  afternoon: 'This afternoon',
  evening: 'Tonight',
};

/**
 * Pick the routine to show: the current period's, else search forward with
 * wraparound (evening -> tomorrow morning). Returns null when the member has
 * no routines at all.
 */
export function pickRoutine(routines: Routine[], now: Date): RoutinePick | null {
  if (routines.length === 0) return null;
  const startIdx = ORDER.indexOf(getTimeOfDay(now));
  for (let offset = 0; offset < ORDER.length; offset++) {
    const idx = (startIdx + offset) % ORDER.length;
    const period = ORDER[idx];
    const routine = routines.find((r) => r.time_of_day === period);
    if (!routine) continue;
    const isCurrent = offset === 0;
    const wrapped = startIdx + offset >= ORDER.length;
    const label = isCurrent
      ? ''
      : wrapped
        ? `Tomorrow ${period}`
        : PREVIEW_LABELS[period];
    return { routine, isCurrent, label };
  }
  return null;
}
```

- [ ] **Step 2: Create `src/components/focus/RoutineCard.tsx`**

```tsx
import { useState } from 'react';
import { Routine } from '../../types/family';
import { hapticMedium, hapticSuccess } from '../../hooks/useHaptics';

interface RoutineCardProps {
  routine: Routine;
  /** empty when this is the current period's routine */
  label: string;
  /** future-period previews render read-only */
  interactive: boolean;
  isTaskCompleted: (taskId: string) => boolean;
  onToggleTask: (taskId: string) => void;
}

export function RoutineCard({ routine, label, interactive, isTaskCompleted, onToggleTask }: RoutineCardProps) {
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const tasks = [...routine.tasks].sort((a, b) => a.order - b.order);
  const doneCount = tasks.filter((t) => isTaskCompleted(t.id)).length;

  const handleToggle = (taskId: string) => {
    if (!interactive) return;
    if (!isTaskCompleted(taskId)) {
      setAnimatingId(taskId);
      setTimeout(() => setAnimatingId(null), 400);
      hapticMedium();
      if (doneCount === tasks.length - 1) hapticSuccess();
    }
    onToggleTask(taskId);
  };

  return (
    <section className={`focus-card ${interactive ? '' : 'focus-card--preview'}`}>
      <header className="focus-card-header">
        <h2 className="focus-card-title">{routine.name}</h2>
        {label ? (
          <span className="focus-card-badge">{label}</span>
        ) : (
          <span className="focus-card-count">
            {doneCount === tasks.length && tasks.length > 0 ? 'Done!' : `${doneCount}/${tasks.length}`}
          </span>
        )}
      </header>
      <ul className="focus-checklist">
        {tasks.map((task) => {
          const done = isTaskCompleted(task.id);
          return (
            <li key={task.id}>
              <button
                type="button"
                className={`focus-check-row ${done ? 'focus-check-row--done' : ''} ${animatingId === task.id ? 'focus-check-row--completing' : ''}`}
                onClick={() => handleToggle(task.id)}
                disabled={!interactive}
                aria-label={done ? `Undo ${task.name}` : `Complete ${task.name}`}
              >
                <span className="focus-check-box">
                  {done && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="focus-check-label">{task.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Create `src/components/focus/FocusChores.tsx`**

```tsx
import { useState } from 'react';
import { Chore } from '../../types/family';
import { hapticMedium, hapticSuccess } from '../../hooks/useHaptics';

interface FocusChoresProps {
  chores: Chore[];
  completedIds: Set<string>;
  currencySymbol: string;
  onToggle: (choreId: string) => void;
}

export function FocusChores({ chores, completedIds, currencySymbol, onToggle }: FocusChoresProps) {
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  if (chores.length === 0) return null;

  const remaining = chores.filter((c) => !completedIds.has(c.id)).length;

  const handleToggle = (choreId: string) => {
    if (!completedIds.has(choreId)) {
      setAnimatingId(choreId);
      setTimeout(() => setAnimatingId(null), 400);
      hapticMedium();
      if (remaining === 1) hapticSuccess();
    }
    onToggle(choreId);
  };

  return (
    <section className="focus-card">
      <header className="focus-card-header">
        <h2 className="focus-card-title">Chores</h2>
        <span className="focus-card-count">
          {remaining === 0 ? 'Done!' : `${chores.length - remaining}/${chores.length}`}
        </span>
      </header>
      <ul className="focus-checklist">
        {chores.map((chore) => {
          const done = completedIds.has(chore.id);
          return (
            <li key={chore.id}>
              <button
                type="button"
                className={`focus-check-row ${done ? 'focus-check-row--done' : ''} ${animatingId === chore.id ? 'focus-check-row--completing' : ''}`}
                onClick={() => handleToggle(chore.id)}
                aria-label={done ? `Undo ${chore.name}` : `Complete ${chore.name}`}
              >
                <span className="focus-check-box">
                  {done && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="focus-check-label">
                  {chore.icon && <span className="focus-check-icon">{chore.icon}</span>}
                  {chore.name}
                </span>
                {chore.value_cents > 0 && (
                  <span className="focus-check-value">
                    {currencySymbol}
                    {(chore.value_cents / 100).toFixed(2)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Create `src/components/focus/FocusView.tsx`**

```tsx
import { useState, useEffect, useMemo, useRef, CSSProperties } from 'react';
import { format } from 'date-fns';
import { useFamily } from '../../hooks/useFamily';
import { useChores } from '../../hooks/useChores';
import { useRoutines } from '../../hooks/useRoutines';
import { BeaconSettings } from '../../hooks/useSettings';
import { ScreenSaver } from '../ScreenSaver';
import { RoutineCard } from './RoutineCard';
import { FocusChores } from './FocusChores';
import { pickRoutine, getTimeOfDay } from './period';

interface FocusViewProps {
  memberId: string;
  settings: BeaconSettings;
  onExit: () => void;
}

const GREETINGS = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
} as const;

export function FocusView({ memberId, settings, onExit }: FocusViewProps) {
  const { members } = useFamily();
  const routinesApi = useRoutines(memberId);
  const choresApi = useChores();

  const member = members.find((m) => m.id === memberId);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Periodic data refresh so a wall display picks up edits made elsewhere
  const { refresh: refreshRoutines } = routinesApi;
  const { refresh: refreshChores } = choresApi;
  useEffect(() => {
    const t = setInterval(() => {
      refreshRoutines();
      refreshChores();
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [refreshRoutines, refreshChores]);

  // Exit gesture: 5 taps on the clock within 3 seconds
  const taps = useRef<number[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const handleClockTap = () => {
    const t = Date.now();
    taps.current = [...taps.current.filter((prev) => t - prev < 3000), t];
    if (taps.current.length >= 5) {
      taps.current = [];
      setShowExitConfirm(true);
    }
  };

  const memberChores = useMemo(
    () => choresApi.chores.filter((c) => c.assigned_to.includes(memberId)),
    [choresApi.chores, memberId]
  );
  const completedChoreIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of choresApi.completionsToday) {
      if (c.member_id === memberId) ids.add(c.chore_id);
    }
    return ids;
  }, [choresApi.completionsToday, memberId]);

  const pick = pickRoutine(routinesApi.routines, now);

  if (!member) {
    // Member deleted while display active: App-level guard exits on next render
    return null;
  }

  const currentRoutineTasks = pick && pick.isCurrent ? pick.routine.tasks : [];
  const routineDone = currentRoutineTasks.every((t) =>
    routinesApi.isTaskCompletedToday(pick!.routine.id, t.id, memberId)
  );
  const choresDone = memberChores.every((c) => completedChoreIds.has(c.id));
  const hadItems = currentRoutineTasks.length + memberChores.length > 0;
  const allDone = hadItems && routineDone && choresDone;

  return (
    <div className="focus-view" style={{ '--focus-accent': member.color } as CSSProperties}>
      <header className="focus-header">
        <div className="focus-member">
          <span
            className="focus-avatar"
            style={{ borderColor: member.color, backgroundColor: member.color + '22' }}
          >
            {member.avatar}
          </span>
          <div>
            <div className="focus-greeting">{GREETINGS[getTimeOfDay(now)]},</div>
            <div className="focus-name">{member.name}</div>
          </div>
        </div>
        <button type="button" className="focus-clock" onClick={handleClockTap} aria-label="Clock">
          <div className="focus-time">
            {format(now, settings.timeFormat === '24h' ? 'HH:mm' : 'h:mm a')}
          </div>
          <div className="focus-date">{format(now, 'EEEE, MMMM d')}</div>
        </button>
      </header>

      <main className="focus-body">
        {allDone ? (
          <div className="focus-celebration">
            <div className="focus-celebration-emoji">🎉</div>
            <div className="focus-celebration-title">All done — great job!</div>
          </div>
        ) : (
          <>
            {pick && (
              <RoutineCard
                routine={pick.routine}
                label={pick.label}
                interactive={pick.isCurrent}
                isTaskCompleted={(taskId) =>
                  routinesApi.isTaskCompletedToday(pick.routine.id, taskId, memberId)
                }
                onToggleTask={(taskId) => routinesApi.toggleTask(pick.routine, taskId)}
              />
            )}
            <FocusChores
              chores={memberChores}
              completedIds={completedChoreIds}
              currencySymbol={settings.currencySymbol}
              onToggle={(choreId) =>
                completedChoreIds.has(choreId)
                  ? choresApi.uncompleteChore(choreId, memberId)
                  : choresApi.completeChore(choreId, memberId)
              }
            />
            {!pick && memberChores.length === 0 && (
              <div className="focus-empty">
                Nothing scheduled yet. A parent can add routines and chores in Settings.
              </div>
            )}
          </>
        )}
      </main>

      {showExitConfirm && (
        <div className="focus-exit-backdrop" onClick={() => setShowExitConfirm(false)}>
          <div className="focus-exit-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Exit {member.name}&rsquo;s display?</p>
            <div className="focus-exit-actions">
              <button type="button" className="settings-btn" onClick={() => setShowExitConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="settings-btn settings-btn--primary" onClick={onExit}>
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      <ScreenSaver
        enabled={settings.screenSaverEnabled}
        dimTimeoutMin={settings.dimTimeout}
        screenSaverTimeoutMin={settings.screenSaverTimeout}
      />
    </div>
  );
}
```

- [ ] **Step 5: Create `src/styles/focus.css`**

```css
/* Kid Display (focus mode) */

.focus-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

.focus-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px;
  border-bottom: 3px solid var(--focus-accent, var(--accent));
}

.focus-member {
  display: flex;
  align-items: center;
  gap: 16px;
}

.focus-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 3px solid var(--focus-accent, var(--accent));
  font-size: 2rem;
}

.focus-greeting {
  font-size: 1rem;
  color: var(--text-muted);
}

.focus-name {
  font-size: 1.8rem;
  font-weight: 700;
  line-height: 1.1;
}

.focus-clock {
  background: none;
  border: none;
  color: inherit;
  text-align: right;
  cursor: default;
  padding: 0;
  font: inherit;
}

.focus-time {
  font-size: 2.2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.focus-date {
  font-size: 0.95rem;
  color: var(--text-muted);
}

.focus-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}

.focus-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
}

.focus-card--preview {
  opacity: 0.65;
}

.focus-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 8px;
}

.focus-card-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.focus-card-badge {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-today, var(--bg-primary));
  color: var(--text-muted);
}

.focus-card-count {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--focus-accent, var(--accent));
}

.focus-checklist {
  list-style: none;
  margin: 0;
  padding: 8px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.focus-check-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 14px 12px;
  border: none;
  border-radius: 12px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 1.2rem;
  cursor: pointer;
  text-align: left;
  transition: background 150ms ease;
  min-height: 56px; /* kid-sized tap target */
}

.focus-check-row:not(:disabled):hover {
  background: var(--bg-primary);
}

.focus-check-row:disabled {
  cursor: default;
}

.focus-check-box {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--focus-accent, var(--accent));
  color: #fff;
  transition: all 150ms ease;
}

.focus-check-row--done .focus-check-box {
  background: var(--focus-accent, var(--accent));
}

.focus-check-row--done .focus-check-label {
  text-decoration: line-through;
  color: var(--text-muted);
}

.focus-check-row--completing .focus-check-box {
  transform: scale(1.2);
}

.focus-check-icon {
  margin-right: 8px;
}

.focus-check-value {
  margin-left: auto;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--focus-accent, var(--accent));
}

.focus-celebration {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.focus-celebration-emoji {
  font-size: 4.5rem;
}

.focus-celebration-title {
  font-size: 1.6rem;
  font-weight: 700;
}

.focus-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  text-align: center;
  padding: 24px;
}

.focus-exit-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.focus-exit-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  max-width: 320px;
  text-align: center;
}

.focus-exit-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 16px;
}

/* Invalid-member banner (rendered by App in the normal shell) */
.focus-invalid-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  padding: 8px 16px;
  background: #ef444422;
  color: var(--text-primary);
  font-size: 0.9rem;
  border-bottom: 1px solid var(--border);
}
```

- [ ] **Step 6: Register the stylesheet**

In `src/main.tsx`, after line 14 (`import './styles/weather.css';`) add:

```ts
import './styles/focus.css';
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/focus/ src/styles/focus.css src/main.tsx
git commit -m "feat: add FocusView kid display components"
```

---

### Task 5: App.tsx integration — focus shell branch, exit, invalid banner

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getFocusMemberId`/`clearFocusMode`/`setDeviceFocusMember` (Task 3), `FocusView` (Task 4).
- Produces: `handleEnterFocusMode(memberId: string)` passed to `SettingsView` as prop `onEnterFocusMode` (Task 6 consumes; Task 6 also adds the prop to `SettingsViewProps`).

- [ ] **Step 1: Add imports** (with the other component imports near the top of `src/App.tsx`)

```ts
import { FocusView } from './components/focus/FocusView';
import { getFocusMemberId, clearFocusMode, setDeviceFocusMember } from './focus';
```

- [ ] **Step 2: Add focus state and handlers** (inside `App()`, after the `activeView` state declaration around line 131)

```ts
  // Kid Display (focus) mode — URL param wins, then device-local storage
  const [focusMemberId, setFocusMemberId] = useState<string | null>(() => getFocusMemberId());
  const focusMember = focusMemberId ? members.find((m) => m.id === focusMemberId) : undefined;
  const focusInvalid = !!focusMemberId && members.length > 0 && !focusMember;

  const handleExitFocus = useCallback(() => {
    clearFocusMode();
    setFocusMemberId(null);
  }, []);

  const handleEnterFocusMode = useCallback((memberId: string) => {
    setDeviceFocusMember(memberId);
    setFocusMemberId(memberId);
  }, []);
```

- [ ] **Step 3: Add the focus shell early returns** (immediately AFTER the onboarding early-return block that ends around line 404, BEFORE the main `return (`)

```tsx
  // Kid Display mode: replace the entire shell (same pattern as onboarding)
  if (focusMember) {
    return (
      <FocusView
        memberId={focusMember.id}
        settings={settings}
        onExit={handleExitFocus}
      />
    );
  }

  // Focus member requested but members not loaded yet (fresh device cache):
  // hold on a lightweight loading screen instead of flashing the full app.
  if (focusMemberId && members.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    );
  }
```

- [ ] **Step 4: Add the invalid-member banner** (first child inside `<div className={\`beacon ...\`}>`, before `<Sidebar ...>`)

```tsx
      {focusInvalid && (
        <div className="focus-invalid-banner">
          Kid display member not found — showing the full app.
          <button type="button" className="settings-btn" onClick={handleExitFocus}>
            Dismiss
          </button>
        </div>
      )}
```

- [ ] **Step 5: Pass the enter handler to SettingsView** — in the `activeView === 'settings'` branch, add prop:

```tsx
            onEnterFocusMode={handleEnterFocusMode}
```

Note: this will not type-check until Task 6 adds `onEnterFocusMode` to `SettingsViewProps`. If executing tasks strictly in order, add the prop in Task 6 Step 1 FIRST or do Tasks 5 and 6 in one working session before running the build. Alternative: defer this step's edit to Task 6 — acceptable; then Task 5's build check passes standalone by omitting this prop until Task 6.

**Decision for executors:** omit this Step 5 edit in Task 5; Task 6 adds both the prop type and this call site. Task 5's deliverable is entry via URL/localStorage + exit + banner.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Verify in browser**

Run: `npm run dev`, open `http://localhost:5173/`.
1. In Settings → Family, ensure at least one member exists (create "Testkid" if needed).
2. Get the member id: DevTools console → `JSON.parse(localStorage.getItem('beacon_family_members'))` → copy an `id`.
3. Open `http://localhost:5173/?display=<that-id>` → FocusView renders: avatar, greeting, clock; no sidebar.
4. Tap the clock 5 times quickly → confirm dialog → Exit → normal app returns, URL param stripped.
5. Open `http://localhost:5173/?display=bogus-id` → normal app with the "member not found" banner; Dismiss clears it.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire kid display focus shell into App"
```

---

### Task 6: Settings → Display — Kid Display picker

**Files:**
- Modify: `src/components/SettingsView.tsx` (props interface ~line 44; `renderDisplay` ~line 1023)
- Modify: `src/App.tsx` (pass `onEnterFocusMode` prop — deferred Step 5 of Task 5)

**Interfaces:**
- Consumes: `buildFocusUrl` (Task 3), `handleEnterFocusMode` from App (Task 5).
- Produces: `SettingsViewProps.onEnterFocusMode: (memberId: string) => void`.

- [ ] **Step 1: Add the prop**

In `SettingsViewProps` (after the Family props block around line 48):

```ts
  // Kid Display
  onEnterFocusMode: (memberId: string) => void;
```

Destructure `onEnterFocusMode` in the component signature alongside the other props.

- [ ] **Step 2: Add local state** (near the other useState calls at the top of the component)

```ts
  const [kidDisplayMemberId, setKidDisplayMemberId] = useState('');
  const [copiedFocusUrl, setCopiedFocusUrl] = useState(false);
```

- [ ] **Step 3: Add import**

```ts
import { buildFocusUrl } from '../focus';
```

- [ ] **Step 4: Add the Kid Display group** at the end of `renderDisplay()`, after the kiosk-mode `settings-group` div closes:

```tsx
      <h2 className="settings-section-title" style={{ marginTop: 32 }}>Kid Display</h2>
      <p className="settings-section-desc">
        Lock a wall-mounted screen to one family member — shows only their routines and chores.
      </p>
      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Family Member</div>
            <div className="settings-row-sublabel">Who this display belongs to</div>
          </div>
          <select
            className="settings-select"
            value={kidDisplayMemberId}
            onChange={(e) => {
              setKidDisplayMemberId(e.target.value);
              setCopiedFocusUrl(false);
            }}
          >
            <option value="">Choose a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.avatar} {m.name}
              </option>
            ))}
          </select>
        </div>
        {kidDisplayMemberId && (
          <>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Use on This Device</div>
                <div className="settings-row-sublabel">
                  Locks this screen now. Exit later with 5 taps on the clock.
                </div>
              </div>
              <button
                type="button"
                className="settings-btn settings-btn--primary"
                onClick={() => onEnterFocusMode(kidDisplayMemberId)}
              >
                Start
              </button>
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Display URL</div>
                <div className="settings-row-sublabel">
                  For kiosk browsers and wall panels — bookmark or set as home page.
                </div>
              </div>
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  navigator.clipboard
                    .writeText(buildFocusUrl(kidDisplayMemberId))
                    .then(() => setCopiedFocusUrl(true))
                    .catch(() => {
                      window.prompt('Copy this URL:', buildFocusUrl(kidDisplayMemberId));
                    });
                }}
              >
                {copiedFocusUrl ? 'Copied!' : 'Copy URL'}
              </button>
            </div>
          </>
        )}
      </div>
```

- [ ] **Step 5: Wire the App prop** — in `src/App.tsx` `activeView === 'settings'` branch, add:

```tsx
            onEnterFocusMode={handleEnterFocusMode}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Verify in browser**

`npm run dev` → Settings → Display → Kid Display: pick a member → **Start** switches this tab straight into FocusView (and survives a reload — localStorage). Exit via 5 clock taps. **Copy URL** puts `?display=<id>` URL on the clipboard.

- [ ] **Step 8: Commit**

```bash
git add src/components/SettingsView.tsx src/App.tsx
git commit -m "feat: add kid display picker to display settings"
```

---

### Task 7: Settings → Family — routine editor

**Files:**
- Modify: `src/components/SettingsView.tsx` (imports, state, `renderFamily` ~line 569)

**Interfaces:**
- Consumes: `useRoutines()` (Task 2 — instantiated with NO memberId so all routines load), `Routine`/`RoutineTask` types.
- Produces: UI only; no exports.

- [ ] **Step 1: Add imports**

Add `ListChecks` to the existing `lucide-react` import, `useRoutines` and the types:

```ts
import { useRoutines } from '../hooks/useRoutines';
import { Routine } from '../types/family';
```

- [ ] **Step 2: Add state + helpers** (top of the component, near member-form state)

```ts
  // ---- Routine editor state ----
  const routinesApi = useRoutines();
  const [routinesFor, setRoutinesFor] = useState<FamilyMember | null>(null);
  const [routineForm, setRoutineForm] = useState<{
    id: string | null;
    name: string;
    time_of_day: Routine['time_of_day'];
    tasks: { id: string | null; name: string }[];
  } | null>(null);
  const [confirmDeleteRoutine, setConfirmDeleteRoutine] = useState<string | null>(null);

  const genTaskId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleSaveRoutine = useCallback(async () => {
    if (!routineForm || !routinesFor) return;
    const name = routineForm.name.trim();
    const tasks = routineForm.tasks
      .map((t) => ({ ...t, name: t.name.trim() }))
      .filter((t) => t.name.length > 0)
      .map((t, i) => ({ id: t.id ?? genTaskId(), name: t.name, order: i }));
    if (!name || tasks.length === 0) return;
    if (routineForm.id) {
      await routinesApi.updateRoutine(routineForm.id, {
        name,
        time_of_day: routineForm.time_of_day,
        tasks,
      });
    } else {
      await routinesApi.addRoutine({
        name,
        member_id: routinesFor.id,
        time_of_day: routineForm.time_of_day,
        tasks,
      });
    }
    setRoutineForm(null);
  }, [routineForm, routinesFor, routinesApi]);
```

- [ ] **Step 3: Add a "Routines" button to each member card** — in `renderFamily`, inside `settings-fm-actions` (before the Edit button):

```tsx
                  <button
                    type="button"
                    className="settings-fm-btn"
                    onClick={() => setRoutinesFor(member)}
                    aria-label={`Routines for ${member.name}`}
                  >
                    <ListChecks size={16} />
                  </button>
```

- [ ] **Step 4: Add the routines management screen** — at the TOP of `renderFamily`'s returned JSX, short-circuit when `routinesFor` is set. Replace `const renderFamily = () => (` body opening so it reads:

```tsx
  const renderFamily = () => {
    if (routinesFor) {
      const memberRoutines = routinesApi.routines.filter((r) => r.member_id === routinesFor.id);
      return (
        <>
          <h2 className="settings-section-title">
            {routinesFor.avatar} {routinesFor.name} — Routines
          </h2>
          <p className="settings-section-desc">
            Morning and night checklists shown on their kid display.
          </p>
          <div className="settings-group">
            <div style={{ padding: '12px 20px 4px' }}>
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  setRoutinesFor(null);
                  setRoutineForm(null);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}
              >
                <ChevronLeft size={16} /> Back
              </button>
            </div>
            {routineForm === null ? (
              <>
                <div className="settings-fm-list">
                  {memberRoutines.length === 0 && (
                    <div className="settings-fm-empty">
                      No routines yet. Add a morning or bedtime checklist.
                    </div>
                  )}
                  {memberRoutines.map((routine) => (
                    <div key={routine.id} className="settings-fm-card">
                      <div className="settings-fm-info">
                        <div className="settings-fm-name">{routine.name}</div>
                        <div className="settings-fm-role">
                          {routine.time_of_day} · {routine.tasks.length} task{routine.tasks.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="settings-fm-actions">
                        <button
                          type="button"
                          className="settings-fm-btn"
                          onClick={() =>
                            setRoutineForm({
                              id: routine.id,
                              name: routine.name,
                              time_of_day: routine.time_of_day,
                              tasks: [...routine.tasks]
                                .sort((a, b) => a.order - b.order)
                                .map((t) => ({ id: t.id, name: t.name })),
                            })
                          }
                          aria-label={`Edit ${routine.name}`}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="settings-fm-btn settings-fm-btn--danger"
                          onClick={() => {
                            if (confirmDeleteRoutine === routine.id) {
                              routinesApi.removeRoutine(routine.id);
                              setConfirmDeleteRoutine(null);
                            } else {
                              setConfirmDeleteRoutine(routine.id);
                              setTimeout(() => setConfirmDeleteRoutine(null), 3000);
                            }
                          }}
                          aria-label={`Delete ${routine.name}`}
                        >
                          {confirmDeleteRoutine === routine.id ? (
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ef4444' }}>Sure?</span>
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '8px 20px 16px' }}>
                  <button
                    type="button"
                    className="settings-btn settings-btn--primary"
                    onClick={() =>
                      setRoutineForm({
                        id: null,
                        name: '',
                        time_of_day: 'morning',
                        tasks: [{ id: null, name: '' }],
                      })
                    }
                  >
                    + Add Routine
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="settings-row">
                  <div className="settings-row-label">Name</div>
                  <input
                    type="text"
                    className="settings-input"
                    value={routineForm.name}
                    onChange={(e) => setRoutineForm((f) => f && { ...f, name: e.target.value })}
                    placeholder="Morning Routine"
                    autoFocus
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">Time of Day</div>
                  <Segment
                    value={routineForm.time_of_day}
                    options={[
                      { value: 'morning', label: 'Morning' },
                      { value: 'afternoon', label: 'Afternoon' },
                      { value: 'evening', label: 'Evening' },
                    ]}
                    onChange={(v) => setRoutineForm((f) => f && { ...f, time_of_day: v })}
                  />
                </div>
                <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                  <div className="settings-row-label" style={{ paddingTop: 4 }}>Tasks</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, maxWidth: 340 }}>
                    {routineForm.tasks.map((task, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="text"
                          className="settings-input"
                          value={task.name}
                          placeholder={`Task ${i + 1} (e.g. Brush teeth)`}
                          onChange={(e) =>
                            setRoutineForm((f) => {
                              if (!f) return f;
                              const tasks = [...f.tasks];
                              tasks[i] = { ...tasks[i], name: e.target.value };
                              return { ...f, tasks };
                            })
                          }
                        />
                        <button
                          type="button"
                          className="settings-fm-btn"
                          disabled={i === 0}
                          aria-label="Move up"
                          onClick={() =>
                            setRoutineForm((f) => {
                              if (!f || i === 0) return f;
                              const tasks = [...f.tasks];
                              [tasks[i - 1], tasks[i]] = [tasks[i], tasks[i - 1]];
                              return { ...f, tasks };
                            })
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="settings-fm-btn"
                          disabled={i === routineForm.tasks.length - 1}
                          aria-label="Move down"
                          onClick={() =>
                            setRoutineForm((f) => {
                              if (!f || i === f.tasks.length - 1) return f;
                              const tasks = [...f.tasks];
                              [tasks[i], tasks[i + 1]] = [tasks[i + 1], tasks[i]];
                              return { ...f, tasks };
                            })
                          }
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="settings-fm-btn settings-fm-btn--danger"
                          aria-label="Remove task"
                          onClick={() =>
                            setRoutineForm((f) => {
                              if (!f) return f;
                              return { ...f, tasks: f.tasks.filter((_, j) => j !== i) };
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="settings-btn"
                      style={{ alignSelf: 'flex-start' }}
                      onClick={() =>
                        setRoutineForm((f) => f && { ...f, tasks: [...f.tasks, { id: null, name: '' }] })
                      }
                    >
                      + Add Task
                    </button>
                  </div>
                </div>
                <div style={{ padding: '12px 20px 16px', display: 'flex', gap: 8 }}>
                  <button type="button" className="settings-btn settings-btn--primary" onClick={handleSaveRoutine}>
                    Save Routine
                  </button>
                  <button type="button" className="settings-btn" onClick={() => setRoutineForm(null)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      );
    }

    return (
      <>
        {/* existing renderFamily JSX unchanged */}
      </>
    );
  };
```

Note for the executor: `renderFamily` is currently an arrow with an implicit-return `(...)`. Convert it to a block body `{ if (routinesFor) { return (...); } return ( <existing JSX/> ); }` — the existing JSX moves verbatim into the final `return`.

`Segment` is generic over the option value type — the existing role usage (`'parent' | 'child'`) shows the pattern; `time_of_day` works identically with `'morning' | 'afternoon' | 'evening'`.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Verify in browser**

`npm run dev` → Settings → Family Members:
1. Member card shows the new ListChecks button → opens "<name> — Routines".
2. Add "Morning Routine" (morning) with tasks "Brush teeth", "Get dressed", "Pack backpack" → saves, appears in list with "morning · 3 tasks".
3. Edit it: reorder with ↑/↓, save → order persists.
4. Open `?display=<member-id>` before noon (or temporarily set the routine to the current period) → routine card renders with the tasks in order; tapping checks them off; reload → still checked (persisted for today).
5. Delete flow: trash → "Sure?" → trash again removes it.

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsView.tsx
git commit -m "feat: add routine editor to family settings"
```

---

### Task 8: End-to-end verification, dual-directory sync

**Files:**
- Modify: `beacon/src/**` (rsync mirror — no hand edits)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 2: Drive the full spec verification list** (`npm run dev`)

1. Enter via Settings picker → Start; reload the tab → still in FocusView (localStorage persistence).
2. Enter via copied `?display=` URL in a fresh tab.
3. Complete routine tasks + all chores → celebration card appears.
4. Simulate next-day reset: DevTools → `localStorage.getItem('beacon_routine_completions')` → edit a record's `completed_at` date to yesterday → reload → task unchecked again.
5. Exit gesture: 5 taps on clock within 3s → confirm → back to full app, URL param stripped.
6. Invalid member: `?display=nope` → banner in normal app → Dismiss.
7. Member with no routines and no chores → neutral empty state (NOT celebration).
8. Evening check: member with only a morning routine viewed after 17:00 → card shows "Tomorrow morning" label, rows disabled (read-only), chores still tappable.

- [ ] **Step 3: Dual-directory sync (HA builds from `beacon/`)**

```bash
rsync -av --delete src/ beacon/src/
```

- [ ] **Step 4: Commit the sync**

```bash
git add beacon/src/
git commit -m "chore: sync src to beacon addon directory"
```

---

## Self-Review Notes

- Spec coverage: §1 → Tasks 3, 5, 6; §2 → Tasks 1, 2; §3 → Task 4 (+5); §4 → Task 7; §5 error handling → Task 5 Steps 3–4 + FocusView null-member guard; §6 verification → Task 8. CHANGELOG requirement satisfied via conventional commits (semantic-release owns CHANGELOG.md).
- Task 5/6 circular dependency (App prop ↔ SettingsView prop type) resolved explicitly: the prop is wired in Task 6.
- Type consistency: `onEnterFocusMode(memberId: string)`, `useRoutines(memberId?)` return shape, and `RoutineTaskCompletion` field names are identical across Tasks 1, 2, 4, 5, 6, 7.
