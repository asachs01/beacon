/**
 * SPA view of lib/chore-privileges.cjs. The add-on server requires the same
 * file so privilege decisions and event payloads cannot drift.
 */
import {
  PRIVILEGE_DOMAINS as PRIVILEGE_DOMAINS_JS,
  CHORE_COMPLETED_EVENT as CHORE_COMPLETED_EVENT_JS,
  ALL_CHORES_DONE_EVENT as ALL_CHORES_DONE_EVENT_JS,
  dayKey as dayKeyJs,
  memberProgress as memberProgressJs,
  isMemberDayComplete as isMemberDayCompleteJs,
  privilegeDecision as privilegeDecisionJs,
  privilegeDecisions as privilegeDecisionsJs,
  eventsForChoreChange as eventsForChoreChangeJs,
} from '../../lib/chore-privileges.cjs';
import type { Chore, ChoreCompletion, FamilyMember } from '../types/family';

export const PRIVILEGE_DOMAINS = PRIVILEGE_DOMAINS_JS as readonly string[];
export const CHORE_COMPLETED_EVENT = CHORE_COMPLETED_EVENT_JS as 'beacon_chore_completed';
export const ALL_CHORES_DONE_EVENT = ALL_CHORES_DONE_EVENT_JS as 'beacon_all_chores_done';

export interface MemberProgress {
  completed: number;
  total: number;
}

export interface PrivilegeDecision {
  memberId: string;
  entityId: string;
  domain: string;
  service: 'turn_on' | 'turn_off';
  progress: MemberProgress;
  reason: 'complete' | 'incomplete' | 'no_chores';
}

export interface ChoreEvent {
  event: 'beacon_chore_completed' | 'beacon_all_chores_done';
  data: Record<string, string | boolean>;
}

type ProgressInput = { completed: number; total: number } | null;

export function dayKey(
  value?: Date | string | number | null,
  timeZone?: string | null,
  resetTime?: string | null,
): string {
  return dayKeyJs(value, timeZone, resetTime) as string;
}

export function memberProgress(
  memberId: string,
  chores: Chore[],
  completions: ChoreCompletion[],
  localDate: string,
  timeZone?: string | null,
  resetTime?: string | null,
): MemberProgress {
  return memberProgressJs(memberId, chores, completions, localDate, timeZone, resetTime) as MemberProgress;
}

export function isMemberDayComplete(progress: ProgressInput): boolean {
  return isMemberDayCompleteJs(progress) as boolean;
}

export function privilegeDecision(
  member: FamilyMember,
  chores: Chore[],
  completions: ChoreCompletion[],
  localDate: string,
  timeZone?: string | null,
  resetTime?: string | null,
): PrivilegeDecision | null {
  return privilegeDecisionJs(member, chores, completions, localDate, timeZone, resetTime) as PrivilegeDecision | null;
}

export function privilegeDecisions(
  members: FamilyMember[],
  chores: Chore[],
  completions: ChoreCompletion[],
  localDate: string,
  timeZone?: string | null,
  resetTime?: string | null,
): PrivilegeDecision[] {
  return privilegeDecisionsJs(members, chores, completions, localDate, timeZone, resetTime) as PrivilegeDecision[];
}

export function eventsForChoreChange(input: {
  member: Pick<FamilyMember, 'id' | 'name'>;
  chore: Pick<Chore, 'id' | 'name'> | null;
  completed: boolean;
  localDate: string;
  progressBefore: ProgressInput;
  progressAfter: ProgressInput;
}): ChoreEvent[] {
  return eventsForChoreChangeJs(input) as ChoreEvent[];
}
