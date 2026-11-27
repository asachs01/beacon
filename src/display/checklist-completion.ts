import { UNCREDITED_MEMBER_ID } from '../types/family';
import { guestCompletionBy } from './guest-mode';

/**
 * Dashboard and calendar task lists share one checkbox per chore. Guest
 * check-offs go through `guestCompletionBy`, the same marker as the Chores
 * screen. An assigned chore is stored on that assignee. An unassigned chore
 * is stored with no member, so it awards no points and no streak.
 */

export interface ChecklistChore {
  id: string;
  assigned_to: readonly string[];
}

export interface ChecklistMember {
  id: string;
}

export interface ChecklistCompletion {
  chore_id: string;
  member_id: string;
  by?: string;
}

export function checklistToggleMemberId(
  chore: ChecklistChore | undefined,
  members: readonly ChecklistMember[],
  guestActive: boolean,
): string {
  if (guestActive && chore) {
    const assignee = chore.assigned_to.find((id) => members.some((member) => member.id === id));
    if (assignee) return assignee;
    return UNCREDITED_MEMBER_ID;
  }
  return members[0]?.id ?? '__none__';
}

function completionFor(
  chore: ChecklistChore,
  members: readonly ChecklistMember[],
  completions: readonly ChecklistCompletion[],
  guestActive: boolean,
): ChecklistCompletion | undefined {
  const memberId = checklistToggleMemberId(chore, members, guestActive);
  return completions.find((entry) => entry.chore_id === chore.id && entry.member_id === memberId);
}

export function checklistCompletedIds(input: {
  chores: readonly ChecklistChore[];
  members: readonly ChecklistMember[];
  completions: readonly ChecklistCompletion[];
  guestActive: boolean;
}): Set<string> {
  const ids = new Set<string>();
  for (const chore of input.chores) {
    if (completionFor(chore, input.members, input.completions, input.guestActive)) {
      ids.add(chore.id);
    }
  }
  return ids;
}

export function checklistGuestCheckedIds(input: {
  chores: readonly ChecklistChore[];
  members: readonly ChecklistMember[];
  completions: readonly ChecklistCompletion[];
  guestActive: boolean;
}): Set<string> {
  const ids = new Set<string>();
  for (const chore of input.chores) {
    const completion = completionFor(chore, input.members, input.completions, input.guestActive);
    if (completion?.by === 'guest') ids.add(chore.id);
  }
  return ids;
}

export interface ChecklistTogglePlan {
  memberId: string;
  action: 'complete' | 'uncomplete';
  /** Passed straight through to `completeChore`. Set only for a guest check-off. */
  by?: 'guest';
}

export function planChecklistToggle(input: {
  choreId: string;
  chores: readonly ChecklistChore[];
  members: readonly ChecklistMember[];
  completions: readonly ChecklistCompletion[];
  guestActive: boolean;
}): ChecklistTogglePlan {
  const chore = input.chores.find((entry) => entry.id === input.choreId);
  const memberId = checklistToggleMemberId(chore, input.members, input.guestActive);
  const done = input.completions.some(
    (entry) => entry.chore_id === input.choreId && entry.member_id === memberId,
  );
  if (done) return { memberId, action: 'uncomplete' };
  const by = guestCompletionBy(input.guestActive);
  return {
    memberId,
    action: 'complete',
    ...(by ? { by } : {}),
  };
}
