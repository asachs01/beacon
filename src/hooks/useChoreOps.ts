/**
 * ChoreOps data hook.
 *
 * Reuses the single HomeAssistantClient from useHomeAssistant (no second
 * WebSocket connection). Reads an initial state snapshot, then refetches on
 * `state_changed` events for ChoreOps entities only, debounced to avoid a
 * refetch per entity during a burst of ChoreOps updates.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
}

export function useChoreOps(): UseChoreOpsResult {
  const { client, connected } = useHomeAssistant();
  const [data, setData] = useState<ChoreOpsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const activeClient = client();
    if (!activeClient || !connected) return;

    let cancelled = false;

    const load = async () => {
      try {
        const states = (await activeClient.getStates()) as ChoreOpsEntityState[];
        if (cancelled || !mountedRef.current) return;
        setData(normalizeChoreOps(states));
        setError(null);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to read ChoreOps entities');
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false);
      }
    };

    void load();

    let subscriptionId: number | null = null;
    const scheduleRefetch = (event: unknown) => {
      if (!isChoreOpsEntity(event)) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!cancelled) void load();
      }, REFETCH_DEBOUNCE_MS);
    };

    activeClient
      .subscribeStateChanges((event) => scheduleRefetch(event))
      .then((id) => {
        if (cancelled) {
          activeClient.unsubscribe(id);
          return;
        }
        subscriptionId = id;
      })
      .catch(() => {
        /* subscription is an optimisation; the initial snapshot still works */
      });

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (subscriptionId !== null) activeClient.unsubscribe(subscriptionId);
    };
  }, [client, connected]);

  const refresh = useCallback(() => {
    const activeClient = client();
    if (!activeClient) return;
    setLoading(true);
    activeClient
      .getStates()
      .then((states) => setData(normalizeChoreOps(states as ChoreOpsEntityState[])))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to read ChoreOps entities'),
      )
      .finally(() => setLoading(false));
  }, [client]);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      available: Boolean(data?.available),
      refresh,
    }),
    [data, loading, error, refresh],
  );
}
