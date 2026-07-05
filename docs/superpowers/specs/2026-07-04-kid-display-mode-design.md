# Kid Display Mode (Focus Mode) — Design

**Date:** 2026-07-04
**Status:** Approved

## Purpose

A wall-mounted display can be locked to a single family member (a kid) and show
only their content: the routine for the current time of day and their assigned
chores, with tap-to-complete. Goal: each kid gets a dedicated screen on their
wall showing their morning/night routines and chores.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Device lock mechanism | Both: URL param `?display=<memberId>` takes precedence, plain-`localStorage` fallback |
| Interactivity | Tap to complete (no PIN) |
| Routine management | Editor in Settings → Family section |
| Display content | Time-aware auto-switch routine + chores; clock + name/avatar header |
| Lock & exit | Fully locked (no nav); 5 taps on clock within 3s → confirm dialog to exit |
| Architecture | Early-return "focus shell" branch in `App.tsx` (same pattern as `OnboardingView`) |

## 1. Mode resolution & lock

New module `src/focus.ts`:

- `getFocusMemberId(): string | null` — reads `?display=` from
  `window.location.search`; if absent, reads localStorage key
  `beacon_display_member`.
- `setDeviceFocusMember(id: string | null)` — writes/clears the localStorage
  key.
- The value is **deliberately not** part of `BeaconSettings`: settings persist
  through `beacon-store` and sync across devices in add-on mode; the display
  assignment must stay per-device. Plain `localStorage` is per-device.

`App.tsx` resolves the focus member ID into state on mount. If set and it
matches an existing member, App early-returns `<FocusView …>` before the normal
shell — sidebar, OmniAdd, slide panels, and NowPlayingBar never mount (locked
by construction). If the ID matches no member (deleted member, typo'd URL), a
dismissible banner explains the problem and the normal app renders.

Exit: 5 taps on the clock within 3 seconds opens a confirm dialog. Confirming
clears the localStorage key, strips the `display` URL param via
`history.replaceState`, and clears the React state (no reload).

Setup UX (Settings → Display section, next to the existing kiosk toggle):
"Kid Display" — pick a member, then either **Use on this device** (writes
localStorage, enters mode immediately) or copy the generated URL
(`<origin><path>?display=<memberId>`) for kiosk browsers / HA wallpanel apps.

## 2. Data layer

Routine task completions become date-stamped records, mirroring the existing
`ChoreCompletion` pattern. A task is "done today" iff a completion record with
today's date exists — no midnight reset job, and history is retained.

`src/types/family.ts`:

```ts
export interface RoutineTaskCompletion {
  routine_id: string;
  task_id: string;
  member_id: string;
  completed_at: string; // ISO date string
}
```

- Remove `RoutineTask.completed` (verified: zero consumers anywhere).

`src/api/family.ts` (`FamilyStore`), new storage key
`beacon_routine_completions`:

- `updateRoutine(id, data)` — currently missing; needed by the editor.
- `getRoutineTaskCompletionsToday(): Promise<RoutineTaskCompletion[]>`
- `completeRoutineTask(routineId, taskId, memberId)`
- `uncompleteRoutineTask(routineId, taskId, memberId)` — removes today's record.

New hook `src/hooks/useRoutines.ts`, mirroring `useChores`:
`useRoutines(memberId?)` → `{ routines, completionsToday, toggleTask,
addRoutine, updateRoutine, removeRoutine, loading }`. When `memberId` is
given, routines are filtered via `getRoutinesForMember`.

Routines do **not** feed the streak system in v1.

## 3. FocusView UI

New components under `src/components/focus/`:

- `FocusView.tsx` — orchestrator. Uses `useFamily` (to resolve the member),
  `useRoutines(memberId)`, `useChores`, `useSettings` (theme/time format
  already applied at App level).
- Header: member avatar + name (member `color` as accent), live clock, date.
- `RoutineCard.tsx` — the routine for the current time of day:
  morning < 12:00, afternoon 12:00–17:00, evening ≥ 17:00. If the member has
  no routine for the current period, search forward with wraparound
  (afternoon → evening → morning-tomorrow, etc.) and show the first match with
  a period label ("This afternoon", "Tonight", "Tomorrow morning"); if the
  member has no routines at all, the card is omitted. Tasks render as large
  tappable checklist rows (reuse existing checkbox styles; targets sized for
  small kids). Only the current period's routine is tappable; a future
  period's routine renders read-only.
- `FocusChores.tsx` — chores where `assigned_to` includes the member, tap to
  toggle via existing `completeChore`/`uncompleteChore` **with this member's
  ID** (the `firstMemberId` hack at `App.tsx:313` is untouched but explicitly
  not used here).
- Celebration state: when every item that was shown for today (current-period
  routine tasks and assigned chores) is complete, show a full-card "All done —
  great job!" state consistent with the dashboard's existing empty-state
  pattern. Requires at least one completable item to have existed; a member
  with no routines and no chores sees a neutral empty state instead.
- `ScreenSaver` stays mounted inside the focus shell (burn-in protection on
  wall-mounted screens), honoring existing settings.
- Styling in `src/styles/focus.css`, following existing CSS conventions
  (CSS custom properties from the theme system).

## 4. Routine editor (Settings → Family)

Each member row in the existing family-member management UI gains a
"Routines" affordance:

- List the member's routines (name + time-of-day badge + task count).
- Add/edit modal: routine name, time-of-day select (morning/afternoon/evening),
  ordered task list (add, remove, move up/down; `order` = array index).
- Delete with confirm.
- Parent-facing; no PIN gating in v1.

## 5. Error handling

- Unknown/deleted focus member → banner + normal app (see §1).
- Member deleted while a display is in focus mode → member resolution fails on
  next data refresh; FocusView exits to the normal app.
- Offline/HA-down: `beacon-store` already reads server-first with localStorage
  cache; the display keeps rendering cached data. Completions queue in
  localStorage and push in the background (existing behavior).

## 6. Verification

No test infrastructure exists in this repo (no runner, zero test files); this
feature follows suit. Verification:

1. `npm run build` (`tsc && vite build`) — type-checks everything.
2. Drive the real app: enter via `?display=<id>` and via the Settings picker;
   tap routine tasks and chores; confirm completions persist and reset the
   next day (simulate by editing the stored date); exit via 5-tap gesture;
   confirm invalid member ID falls back with banner.
3. Dual-directory sync per project rules: `rsync -av --delete src/ beacon/src/`
   and CHANGELOG entry (keepachangelog format).

## Out of scope (v1)

- PIN gates (for completion or exit)
- Routine streaks / leaderboard integration
- Calendar events on the kid display
- MCP tools for routine management
- Per-display theming
