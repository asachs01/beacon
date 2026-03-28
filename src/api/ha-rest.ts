/**
 * Shared helpers for HA REST API calls used by Grocy and AnyList clients.
 */
import { getConfig } from '../config';

function resolveHaUrl(): string {
  const config = getConfig();
  if (config.ha_url) return config.ha_url.replace(/\/$/, '');
  try {
    return window.parent.location.origin;
  } catch {
    return window.location.origin.replace(/^http:/, 'https:');
  }
}

const haUrl = resolveHaUrl();
const haToken = getConfig().ha_token;

/**
 * Fetch from the HA REST API with automatic auth headers.
 */
export async function haFetch(path: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(`${haUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${haToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`HA API ${res.status}: ${res.statusText}`);
  return res.json();
}

/**
 * Call a HA service via the REST API.
 */
export async function callHaService(
  domain: string,
  service: string,
  data?: Record<string, unknown>,
): Promise<unknown> {
  return haFetch(`/api/services/${domain}/${service}`, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

/**
 * Fetch a single entity state from the HA REST API.
 * Returns null if the entity doesn't exist or the request fails.
 */
export async function getEntityState(entityId: string): Promise<{
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
} | null> {
  try {
    return await haFetch(`/api/states/${entityId}`) as {
      entity_id: string;
      state: string;
      attributes: Record<string, unknown>;
    };
  } catch {
    return null;
  }
}

/** Whether an HA token is configured */
export function hasToken(): boolean {
  return !!haToken;
}
