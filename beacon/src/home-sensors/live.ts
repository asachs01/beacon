import type { HaLiveState } from './types';

export interface HaStateSource {
  readonly isConnected: boolean;
  getStates(): Promise<unknown[]>;
  subscribeStateChanges(handler: (event: unknown) => void): Promise<number>;
  unsubscribe(id: number): void;
}

export function coerceHaState(value: unknown): HaLiveState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.entity_id !== 'string' || !record.entity_id.includes('.')) return null;
  const attributes = record.attributes && typeof record.attributes === 'object'
    ? record.attributes as Record<string, unknown>
    : {};
  const state: HaLiveState = {
    entity_id: record.entity_id,
    state: typeof record.state === 'string' ? record.state : 'unknown',
    attributes,
  };
  if (typeof record.last_changed === 'string') state.last_changed = record.last_changed;
  if (typeof record.last_updated === 'string') state.last_updated = record.last_updated;
  if (typeof record.last_reported === 'string') state.last_reported = record.last_reported;
  return state;
}

function upsert(catalog: readonly HaLiveState[], next: HaLiveState): HaLiveState[] {
  const index = catalog.findIndex((entity) => entity.entity_id === next.entity_id);
  if (index === -1) return [...catalog, next];
  const copy = catalog.slice();
  copy[index] = next;
  return copy;
}

/** Apply one state_changed event. A null new_state means Home Assistant removed the entity. */
export function applyStateChanged(catalog: readonly HaLiveState[], event: unknown): HaLiveState[] {
  if (!event || typeof event !== 'object') return [...catalog];
  const data = (event as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return [...catalog];
  const record = data as { entity_id?: unknown; new_state?: unknown };
  if (record.new_state == null) {
    const entityId = typeof record.entity_id === 'string' ? record.entity_id : '';
    if (!entityId) return [...catalog];
    const previous = catalog.find((entity) => entity.entity_id === entityId);
    return upsert(catalog, {
      entity_id: entityId,
      state: 'unavailable',
      attributes: previous?.attributes ?? {},
      last_changed: previous?.last_changed,
      last_updated: previous?.last_updated,
      last_reported: previous?.last_reported,
    });
  }
  const next = coerceHaState(record.new_state);
  if (!next) return [...catalog];
  return upsert(catalog, next);
}

/**
 * One get_states snapshot, then state_changed. Callers must not add a timer.
 * The returned function drops the websocket subscription.
 */
export async function runHomeSensorSubscription(
  source: HaStateSource,
  onChange: (entities: HaLiveState[]) => void,
): Promise<() => void> {
  const initial = (await source.getStates())
    .map((row) => coerceHaState(row))
    .filter((row): row is HaLiveState => row != null);
  onChange(initial);
  let current = initial;
  const id = await source.subscribeStateChanges((event) => {
    current = applyStateChanged(current, event);
    onChange(current);
  });
  return () => source.unsubscribe(id);
}

/**
 * Prefer the Home Assistant websocket the app already opened (browser token).
 * Otherwise, in add-on and standalone server mode, use the proxied socket.
 */
export function pickHomeSensorSource<T extends { isConnected: boolean }>(input: {
  direct: T | null;
  proxyMode: boolean;
  proxy: T | null;
}): T | null {
  if (input.direct?.isConnected) return input.direct;
  if (!input.proxyMode) return null;
  if (input.proxy?.isConnected) return input.proxy;
  return null;
}
