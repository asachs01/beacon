/**
 * Helpers for Home Assistant service calls that return data
 * (`?return_response`) and for the weather entity, shared by every screen
 * that reads to-do lists or weather.
 */
import { callHaService, fetchAllStates, haFetch } from './ha-rest';
import { getConfig } from '../config';
import { loadDataSync } from './beacon-store';

/**
 * Call a service with return_response and return the part of the
 * response for one entity. HA answers `{ service_response: { [entityId]: … } }`;
 * the unwrapped `{ [entityId]: … }` form is accepted too. Returns
 * undefined when the response has no entry for the entity.
 */
export async function callServiceForEntity<T>(
  domain: string,
  service: string,
  entityId: string,
  data: Record<string, unknown> = {},
): Promise<T | undefined> {
  const result = await callHaService(domain, service, { entity_id: entityId, ...data }, true) as
    | { service_response?: Record<string, T> }
    | Record<string, T>
    | null;
  const byEntity = (result as { service_response?: Record<string, T> } | null)?.service_response ?? result;
  return (byEntity as Record<string, T> | null)?.[entityId];
}

export interface HaTodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  description?: string;
  due?: string;
}

/**
 * Items of an HA to-do list, or null when the response couldn't be read
 * (so callers can tell "empty list" apart from "unknown").
 */
export async function getTodoItems(
  entityId: string,
  statuses?: HaTodoItem['status'][],
): Promise<HaTodoItem[] | null> {
  const response = await callServiceForEntity<{ items?: HaTodoItem[] }>(
    'todo', 'get_items', entityId, statuses ? { status: statuses } : {},
  );
  return Array.isArray(response?.items) ? response.items : null;
}

// --- Weather ---

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

/**
 * Settings > Integrations > Weather Entity (this display's copy of the
 * settings), else the add-on option. The setting used to be ignored.
 */
export function weatherEntityId(): string {
  const chosen = loadDataSync<{ weatherEntity?: string } | null>('beacon-settings', null)?.weatherEntity?.trim();
  return chosen || getConfig().weather_entity;
}

/**
 * The weather entity to show: `configured` (by default the one chosen in
 * Settings) if it exists, otherwise the first `weather.*` entity. Null if
 * there's none.
 */
export async function findWeatherEntity(configured = weatherEntityId()): Promise<HaState | null> {
  if (configured) {
    try {
      return await haFetch(`/api/states/${configured}`) as HaState;
    } catch { /* doesn't exist: fall back to discovery */ }
  }
  const states = await fetchAllStates();
  return states.find((s) => s.entity_id.startsWith('weather.')) ?? null;
}

/** Raw forecast entries from weather.get_forecasts ([] if unavailable). */
export async function getWeatherForecast<T = Record<string, unknown>>(
  entityId: string,
  type: 'daily' | 'hourly',
): Promise<T[]> {
  const response = await callServiceForEntity<{ forecast?: T[] }>('weather', 'get_forecasts', entityId, { type });
  return response?.forecast ?? [];
}
