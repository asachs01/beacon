export const PRIVILEGE_DOMAINS: readonly string[];
export const CHORE_COMPLETED_EVENT: 'beacon_chore_completed';
export const ALL_CHORES_DONE_EVENT: 'beacon_all_chores_done';

export function dayKey(
  value?: unknown,
  timeZone?: string | null,
  resetTime?: string | null,
): string;

export function memberProgress(
  memberId: string,
  chores: unknown,
  completions: unknown,
  localDate: string,
  timeZone?: string | null,
  resetTime?: string | null,
): { completed: number; total: number };

export function isMemberDayComplete(
  progress: { completed: number; total: number } | null,
): boolean;

export function privilegeDecision(
  member: unknown,
  chores: unknown,
  completions: unknown,
  localDate: string,
  timeZone?: string | null,
  resetTime?: string | null,
): {
  memberId: string;
  entityId: string;
  domain: string;
  service: 'turn_on' | 'turn_off';
  progress: { completed: number; total: number };
  reason: 'complete' | 'incomplete' | 'no_chores';
} | null;

export function privilegeDecisions(
  members: unknown,
  chores: unknown,
  completions: unknown,
  localDate: string,
  timeZone?: string | null,
  resetTime?: string | null,
): Array<{
  memberId: string;
  entityId: string;
  domain: string;
  service: 'turn_on' | 'turn_off';
  progress: { completed: number; total: number };
  reason: 'complete' | 'incomplete' | 'no_chores';
}>;

export function eventsForChoreChange(input: unknown): Array<{
  event: 'beacon_chore_completed' | 'beacon_all_chores_done';
  data: Record<string, string | boolean>;
}>;

export function acceptedChoreEvents(events: unknown): Array<{
  event: string;
  data: Record<string, unknown>;
}>;

export function createPrivilegeScheduler(deps: {
  now?: () => Date;
  getTimeZone?: () => Promise<string | null>;
  getResetTime?: () => Promise<string | null>;
  readSnapshot?: () => Promise<{ members: unknown; chores: unknown; completions: unknown }>;
  apply?: (decisions: unknown, info: { reason: string; localDate: string; timeZone: string | null }) => Promise<void>;
  hasToken?: () => boolean;
  log?: (message: string) => void;
}): () => Promise<void>;
