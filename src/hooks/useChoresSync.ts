import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyFamilyDataChanged } from '../api/family';
import { callBeaconAction } from '../api/ha-rest';
import { getIngressBasePath, isAddOn } from '../utils/ha-env';
import { refreshWhileAwake } from '../utils/display-sleep';

/**
 * The Google Tasks chores sync runs in the Family server (chores-sync.cjs),
 * once for the whole family, whether or not any screen is open. It used to
 * run here, in every open browser, where passes on different devices could
 * overlap and import a new Google task as two chores.
 *
 * This hook only reads the sync's status and asks for a pass ("Sync Now").
 * The status says when the sync last changed Family's chores or
 * completions (e.g. imported a task, or pulled a tick made in Google); when
 * that moves on, this screen's chore data is refreshed.
 *
 * Without the Family server (Vite development or native), there's no sync.
 */

export interface ChoresSyncStatus {
  running: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastChangeAt: string | null;
  /** Plain-language problems from the last pass, e.g. a list it couldn't read. */
  problems: string[];
}

const SYNC_PATH = '/beacon-action/chores-sync';
const POLL_MS = 30_000;

async function fetchStatus(): Promise<ChoresSyncStatus | null> {
  try {
    const res = await fetch(`${getIngressBasePath()}${SYNC_PATH}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as ChoresSyncStatus) : null;
  } catch {
    return null;
  }
}

export function useChoresSync(enabled: boolean) {
  const available = isAddOn();
  const [status, setStatus] = useState<ChoresSyncStatus | null>(null);
  /** lastChangeAt from the previous status; undefined until the first one. */
  const seenChangeRef = useRef<string | null | undefined>(undefined);

  const apply = useCallback((next: ChoresSyncStatus) => {
    setStatus(next);
    if (seenChangeRef.current !== undefined && next.lastChangeAt !== seenChangeRef.current) {
      notifyFamilyDataChanged();
    }
    seenChangeRef.current = next.lastChangeAt;
  }, []);

  useEffect(() => {
    if (!enabled || !available) return;
    let cancelled = false;
    const poll = async () => {
      const next = await fetchStatus();
      if (next && !cancelled) apply(next);
    };
    if (!document.hidden) void poll();
    const stopPolling = refreshWhileAwake(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [enabled, available, apply]);

  /**
   * Run a pass now and wait for it. The server writes a report to its log
   * (the add-on Log tab or `docker logs` in standalone mode).
   */
  const runSync = useCallback(async () => {
    apply((await callBeaconAction(SYNC_PATH, {})) as ChoresSyncStatus);
  }, [apply]);

  return { status, runSync, available };
}
