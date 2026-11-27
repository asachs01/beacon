import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { FamilyStore } from '../api/family';
import { applyPrivilegeDecisions } from '../api/chore-bridge';
import { privilegeDecisions } from '../api/chore-privileges';
import { choreDayKey } from '../api/date-keys';
import { getChoreResetTime, subscribeChoreResetTime } from '../api/chore-reset-time';
import type { Chore } from '../types/family';
import type { FamilyMember } from '../types/family';

function memberPrivilegeKey(members: FamilyMember[]): string {
  return members
    .map((member) => `${member.id}:${member.role}:${member.privilegeEntityId ?? ''}`)
    .sort()
    .join('|');
}

function choresPrivilegeKey(chores: Chore[]): string {
  return chores
    .map((chore) => `${chore.id}:${[...chore.assigned_to].sort().join('+')}`)
    .sort()
    .join('|');
}

/**
 * Re-read stored chores and set each child's privilege entity to match the
 * current chore day. Uses the synchronous local cache so a server read cannot
 * overwrite a toggle that just landed in localStorage. Call after the first
 * family/chore load, when the binding or the chore list changes, and when
 * the chore day rolls at the configured reset time.
 */
export async function reevaluatePrivileges(store: FamilyStore, resetTime?: string | null): Promise<void> {
  const today = choreDayKey(undefined, null, resetTime);
  const decisions = privilegeDecisions(
    store.getMembersSync(),
    store.getChoresSync(),
    store.getCompletionsSync(),
    today,
    null,
    resetTime,
  );
  await applyPrivilegeDecisions(decisions);
}

/**
 * Match privilege switches to the current chore day once data has loaded,
 * and again when that day rolls while this page is open. The add-on server
 * does the same check when no browser is open. An unset reset time is
 * local midnight.
 */
export function useChorePrivileges(members: FamilyMember[], chores: Chore[], ready: boolean): void {
  const resetTime = useSyncExternalStore(subscribeChoreResetTime, getChoreResetTime, getChoreResetTime);
  const store = useMemo(() => new FamilyStore(), []);
  const privilegeKey = memberPrivilegeKey(members);
  const choresKey = choresPrivilegeKey(chores);

  useEffect(() => {
    if (!ready) return;
    if (import.meta.env.VITE_DEMO === 'true') return;
    let cancelled = false;
    void (async () => {
      try {
        const today = choreDayKey(undefined, null, resetTime);
        const decisions = privilegeDecisions(
          store.getMembersSync(),
          store.getChoresSync(),
          store.getCompletionsSync(),
          today,
          null,
          resetTime,
        );
        if (cancelled) return;
        await applyPrivilegeDecisions(decisions);
      } catch (err) {
        console.warn('[beacon] privilege re-eval failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, ready, privilegeKey, choresKey, resetTime]);

  useEffect(() => {
    if (!ready) return;
    if (import.meta.env.VITE_DEMO === 'true') return;
    let day = choreDayKey(undefined, null, resetTime);
    const timer = setInterval(() => {
      const next = choreDayKey(undefined, null, resetTime);
      if (next === day) return;
      day = next;
      void reevaluatePrivileges(store, resetTime);
    }, 30_000);
    return () => clearInterval(timer);
  }, [store, ready, resetTime]);
}
