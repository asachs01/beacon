/**
 * Shared poller for Home Assistant entity states.
 *
 * Every HA card used to run its own `setInterval`, so a dashboard with several
 * cards produced as many concurrent polling loops (re-fetching the same
 * entities). This module keeps a single timer and one cache for all of them.
 */
import { getAllEntityStates, getEntityState } from './ha-rest';

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type HaEntitySnapshot = Record<string, HaEntityState>;

type Listener = (states: HaEntitySnapshot) => void;

interface Subscription {
  entityIds: string[];
  listener: Listener;
}

const POLL_INTERVAL = 5_000;
/** Past this many distinct entities, one /api/states call is cheaper than N per-entity calls. */
const BULK_FETCH_THRESHOLD = 8;

const subscriptions = new Set<Subscription>();
const cache = new Map<string, HaEntityState>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribedEntityIds(): string[] {
  const entityIds = new Set<string>();
  subscriptions.forEach((subscription) => subscription.entityIds.forEach((id) => entityIds.add(id)));
  return Array.from(entityIds);
}

function snapshotFor(entityIds: string[]): HaEntitySnapshot {
  const snapshot: HaEntitySnapshot = {};
  entityIds.forEach((entityId) => {
    const state = cache.get(entityId);
    if (state) snapshot[entityId] = state;
  });
  return snapshot;
}

function notifyAll(): void {
  subscriptions.forEach((subscription) => subscription.listener(snapshotFor(subscription.entityIds)));
}

async function fetchStates(entityIds: string[]): Promise<HaEntityState[]> {
  if (entityIds.length === 0) return [];

  if (entityIds.length > BULK_FETCH_THRESHOLD) {
    const wanted = new Set(entityIds);
    const all = await getAllEntityStates();
    return all.filter((state) => wanted.has(state.entity_id));
  }

  const states = await Promise.all(entityIds.map((entityId) => getEntityState(entityId)));
  return states.filter((state): state is HaEntityState => state !== null);
}

/** Fetch now instead of waiting for the next tick — used after a service call. */
export async function refreshEntities(entityIds?: string[]): Promise<void> {
  const states = await fetchStates(entityIds ?? subscribedEntityIds());
  if (states.length === 0) return;
  states.forEach((state) => cache.set(state.entity_id, state));
  notifyAll();
}

function handleVisibilityChange(): void {
  if (!document.hidden) void refreshEntities();
}

function startPolling(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (!document.hidden) void refreshEntities();
  }, POLL_INTERVAL);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function stopPolling(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

export function subscribeEntities(entityIds: string[], listener: Listener): () => void {
  const subscription: Subscription = { entityIds: [...entityIds], listener };
  subscriptions.add(subscription);
  listener(snapshotFor(subscription.entityIds));
  void refreshEntities(subscription.entityIds);
  startPolling();

  return () => {
    subscriptions.delete(subscription);
    if (subscriptions.size === 0) stopPolling();
  };
}

export function resetHaEntityStore(): void {
  subscriptions.clear();
  cache.clear();
  stopPolling();
}
