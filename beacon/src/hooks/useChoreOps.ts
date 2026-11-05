/**
 * ChoreOps data hook.
 *
 * Reuses the single HomeAssistantClient from useHomeAssistant (no second
 * WebSocket connection). Reads an initial state snapshot, then refetches on
 * `state_changed` events for ChoreOps entities only, debounced to avoid a
 * refetch per entity during a burst of ChoreOps updates.
 *
 * The snapshot and the state_changed subscription are shared by every caller
 * and ref-counted by mount/unmount: the dashboard, leaderboard, chores screen,
 * settings and focus mode all read the same data. Without that sharing each
 * caller would hold its own subscription and run its own full `get_states`
 * whenever ChoreOps updates anything.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { useHomeAssistant } from './useHomeAssistant';
import { normalizeChoreOps, purposeOf } from '../api/choreops';
import type { ChoreOpsEntityState, ChoreOpsState } from '../types/choreops';

const REFETCH_DEBOUNCE_MS = 400;

interface StateChangedPayload {
  entity_id?: unknown;
  new_state?: { entity_id?: unknown; attributes?: unknown } | null;
}

/** Extract the entity id from a `state_changed` event payload. */
function changedEntityId(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const payload = (event as { data?: StateChangedPayload }).data;
  if (!payload) return null;

  if (typeof payload.entity_id === 'string') return payload.entity_id;
  const fromState = payload.new_state?.entity_id;
  return typeof fromState === 'string' ? fromState : null;
}

function isChoreOpsEntity(event: unknown): boolean {
  const entityId = changedEntityId(event);
  if (!entityId) return false;
  if (entityId.includes('_choreops_') || entityId.endsWith('_choreops')) return true;

  // Fall back to the purpose attribute when the entity id is unexpected.
  if (typeof event !== 'object' || event === null) return false;
  const attrs = (event as { data?: StateChangedPayload }).data?.new_state?.attributes;
  return (
    typeof attrs === 'object' &&
    attrs !== null &&
    purposeOf({ entity_id: entityId, state: '', attributes: attrs as Record<string, unknown> }) !==
      null
  );
}

export interface UseChoreOpsResult {
  data: ChoreOpsState | null;
  loading: boolean;
  error: string | null;
  /** True when HA is connected and at least one ChoreOps entity was found. */
  available: boolean;
  refresh: () => void;
  /** Press a ChoreOps action button (claim/approve/disapprove). */
  pressButton: (entityId: string) => Promise<void>;
}

interface ChoreOpsSnapshot {
  data: ChoreOpsState | null;
  loading: boolean;
  error: string | null;
}

let snapshot: ChoreOpsSnapshot = { data: null, loading: true, error: null };
const listeners = new Set<() => void>();
let refCount = 0;
let teardown: (() => void) | null = null;

function emit(patch: Partial<ChoreOpsSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ChoreOpsSnapshot {
  return snapshot;
}

async function loadSnapshot(activeClient: HomeAssistantClient): Promise<void> {
  try {
    const states = (await activeClient.getStates()) as ChoreOpsEntityState[];
    emit({ data: normalizeChoreOps(states), error: null, loading: false });
  } catch (err) {
    emit({
      error: err instanceof Error ? err.message : 'Failed to read ChoreOps entities',
      loading: false,
    });
  }
}

/**
 * Register a consumer of the shared snapshot. The first consumer owns the
 * subscription; the last one to unmount tears it down.
 */
function acquire(activeClient: HomeAssistantClient): () => void {
  refCount += 1;

  if (refCount === 1) {
    // Only show the loading state when there is nothing cached to render.
    emit({ loading: snapshot.data === null });
    void loadSnapshot(activeClient);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscriptionId: number | null = null;
    let cancelled = false;

    activeClient
      .subscribeStateChanges((event) => {
        if (!isChoreOpsEntity(event)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (!cancelled) void loadSnapshot(activeClient);
        }, REFETCH_DEBOUNCE_MS);
      })
      .then((id) => {
        if (cancelled) {
          activeClient.unsubscribe(id);
          return;
        }
        subscriptionId = id;
      })
      .catch(() => {
        /* subscription is an optimisation; the snapshot still loads */
      });

    teardown = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (subscriptionId !== null) activeClient.unsubscribe(subscriptionId);
    };
  }

  return () => {
    refCount -= 1;
    if (refCount > 0) return;
    teardown?.();
    teardown = null;
  };
}

export function useChoreOps(): UseChoreOpsResult {
  const { client, connected } = useHomeAssistant();
  const state = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    const activeClient = client();
    if (!activeClient || !connected) return;
    return acquire(activeClient);
  }, [client, connected]);

  const refresh = useCallback(() => {
    const activeClient = client();
    if (!activeClient) return;
    emit({ loading: true });
    void loadSnapshot(activeClient);
  }, [client]);

  /**
   * Invoke a ChoreOps action by pressing its button entity.
   * ChoreOps exposes actions only as `button.*` entities, discovered from the
   * parent sensor's attributes — never hardcoded.
   */
  const pressButton = useCallback(
    async (entityId: string): Promise<void> => {
      const activeClient = client();
      if (!activeClient) throw new Error('Not connected to Home Assistant');
      if (!entityId.startsWith('button.')) {
        throw new Error(`Not a button entity: ${entityId}`);
      }
      await activeClient.callService('button', 'press', entityId);
    },
    [client],
  );

  return useMemo(
    () => ({
      data: state.data,
      loading: state.loading,
      error: state.error,
      available: Boolean(state.data?.available),
      refresh,
      pressButton,
    }),
    [state, refresh, pressButton],
  );
}
