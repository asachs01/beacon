import { useEffect, useMemo } from 'react';
import { FamilyStore } from '../api/family';
import { applyPrivilegeDecisions } from '../api/chore-bridge';
import { privilegeDecisions } from '../api/chore-privileges';
import { localDayKey } from '../api/date-keys';
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
 * Re-read stored chores and set each child's privilege entity to match today.
 * Uses the synchronous local cache so a server read cannot overwrite a toggle
 * that just landed in localStorage. Call after the first family/chore load,
 * when the binding or the chore list changes, and when the local day rolls.
 */
export async function reevaluatePrivileges(store: FamilyStore): Promise<void> {
  const today = localDayKey();
  const decisions = privilegeDecisions(
    store.getMembersSync(),
    store.getChoresSync(),
    store.getCompletionsSync(),
    today,
  );
  await applyPrivilegeDecisions(decisions);
}

/**
 * Match privilege switches to today's chores once data has loaded, and again
 * at local midnight while this page is open. The add-on server does the same
 * check when no browser is open.
 */
export function useChorePrivileges(members: FamilyMember[], chores: Chore[], ready: boolean): void {
  const store = useMemo(() => new FamilyStore(), []);
  const privilegeKey = memberPrivilegeKey(members);
  const choresKey = choresPrivilegeKey(chores);

  useEffect(() => {
    if (!ready) return;
    if (import.meta.env.VITE_DEMO === 'true') return;
    let cancelled = false;
    void (async () => {
      try {
        const today = localDayKey();
        const decisions = privilegeDecisions(
          store.getMembersSync(),
          store.getChoresSync(),
          store.getCompletionsSync(),
          today,
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
  }, [store, ready, privilegeKey, choresKey]);

  useEffect(() => {
    if (!ready) return;
    if (import.meta.env.VITE_DEMO === 'true') return;
    let day = localDayKey();
    const timer = setInterval(() => {
      const next = localDayKey();
      if (next === day) return;
      day = next;
      void reevaluatePrivileges(store);
    }, 30_000);
    return () => clearInterval(timer);
  }, [store, ready]);
}
