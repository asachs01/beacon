/**
 * Shared helpers for HA REST API calls used by Grocy and AnyList clients.
 */
import { getConfig } from '../config';

function resolveHaUrl(): string {
  const config = getConfig();
  // If a real HA URL is configured (not the internal supervisor URL), use it
  if (config.ha_url && !config.ha_url.includes('supervisor')) {
    return config.ha_url.replace(/\/$/, '');
  }
  // In ingress/iframe mode, use the parent frame's origin
  try {
    if (window !== window.parent) return window.parent.location.origin;
  } catch { /* cross-origin */ }
  return window.location.origin;
}

// Lazy-resolve to avoid issues with config loading timing
let _haUrl: string | null = null;
let _haToken: string | null = null;

function getHaUrl() {
  if (!_haUrl) _haUrl = resolveHaUrl();
  return _haUrl;
}

function getHaToken() {
  if (_haToken === null) _haToken = getConfig().ha_token;
  return _haToken;
}

/**
 * Set the HA token dynamically (e.g. from ingress token request).
 * Called by useHomeAssistant after obtaining a token.
 */
export function setHaToken(token: string) {
  _haToken = token;
}

/**
 * Fetch from the HA REST API with automatic auth headers.
 */
export async function haFetch(path: string, options?: RequestInit): Promise<unknown> {
  const token = getHaToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers as Record<string, string>,
  };
  // When using the add-on proxy (__proxy__ marker), skip the Authorization header
  // — the server.js proxy injects the Supervisor token server-side.
  if (token && token !== '__proxy__') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // In proxy mode, call same-origin /api/* directly
  const baseUrl = token === '__proxy__' ? '' : getHaUrl();

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) throw new Error(`HA API ${res.status}: ${res.statusText}`);
  return res.json();
}

/**
 * Call a HA service via the REST API.
 * Set returnResponse=true for services like todo.get_items that return data.
 */
export async function callHaService(
  domain: string,
  service: string,
  data?: Record<string, unknown>,
  returnResponse = false,
): Promise<unknown> {
  const qs = returnResponse ? '?return_response' : '';
  return haFetch(`/api/services/${domain}/${service}${qs}`, {
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
  return !!getHaToken();
}
