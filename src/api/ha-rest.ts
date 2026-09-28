/**
 * Shared helpers for HA REST API calls.
 *
 * With runtime-config.js (add-on or standalone Docker), API calls go
 * through the same-origin Family server. HA credentials stay server-side.
 *
 * Native/onboarding mode without that server can connect directly with a
 * token entered on the device (never one compiled into the public bundle).
 */
import { getConfig } from '../config';
import { isAddOn, getIngressBasePath } from '../utils/ha-env';

/**
 * Get the base URL for API calls.
 * - Add-on mode: use the ingress base path (e.g. /api/hassio_ingress/<token>)
 * - Standalone mode: use the configured HA URL or current origin
 */
function resolveBaseUrl(): string {
  if (isAddOn()) return getIngressBasePath();

  const config = getConfig();
  if (config.ha_url && !config.ha_url.includes('supervisor')) {
    return config.ha_url.replace(/\/$/, '');
  }

  try {
    if (window !== window.parent) return window.parent.location.origin;
  } catch { /* cross-origin */ }

  return window.location.origin;
}

// Lazy-resolve
let _baseUrl: string | null = null;
let _haToken: string | null = null;

function getBaseUrl() {
  if (!_baseUrl) _baseUrl = resolveBaseUrl();
  return _baseUrl;
}

function getHaToken() {
  if (_haToken === null) _haToken = getConfig().ha_token;
  return _haToken;
}

/**
 * Set the HA token dynamically (e.g. from ingress token request).
 */
export function setHaToken(token: string) {
  _haToken = token;
}

/**
 * Fetch from the HA REST API.
 * In add-on mode, requests go through the ingress proxy (no auth header needed).
 * In standalone mode, requests go directly to HA with Bearer token.
 */
export async function haFetch(path: string, options?: RequestInit): Promise<unknown> {
  const token = getHaToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers as Record<string, string>,
  };

  // Only add auth header in standalone mode (not add-on proxy)
  if (token && !isAddOn()) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const base = getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) throw new Error(`HA API ${res.status}: ${res.statusText}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Call a HA service via the REST API.
 * In add-on mode, uses /beacon-action/service to avoid ingress POST issues.
 */
export async function callHaService(
  domain: string,
  service: string,
  data?: Record<string, unknown>,
  returnResponse = false,
  /** Why this call is being made; logged by the add-on server for deletes. */
  reason?: string,
): Promise<unknown> {
  // In add-on mode, route through the dedicated service endpoint
  // (HA ingress proxy can mangle POST bodies on /api/* paths)
  if (isAddOn()) {
    const base = getBaseUrl();
    const res = await fetch(`${base}/beacon-action/service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, service, data: data ?? {}, return_response: returnResponse, reason }),
    });
    if (!res.ok) throw new Error(`Service call ${res.status}: ${res.statusText}`);
    return res.json();
  }

  const qs = returnResponse ? '?return_response' : '';
  return haFetch(`/api/services/${domain}/${service}${qs}`, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

/**
 * Fetch a single entity state from the HA REST API.
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

export interface HaStateObject {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

/**
 * Every entity state from HA's /api/states — a large response on a big
 * install. One copy is shared by all callers: a copy younger than
 * `maxAgeMs` is reused, and concurrent requests share one download (the
 * dashboard used to start several full downloads at once on load).
 * Throws if the request fails; failures aren't cached.
 */
const DEFAULT_STATES_MAX_AGE_MS = 10_000;
let statesCache: { at: number; states: HaStateObject[] } | null = null;
let statesInFlight: Promise<HaStateObject[]> | null = null;

export function fetchAllStates(maxAgeMs = DEFAULT_STATES_MAX_AGE_MS): Promise<HaStateObject[]> {
  if (statesCache && Date.now() - statesCache.at < maxAgeMs) return Promise.resolve(statesCache.states);
  if (statesInFlight) return statesInFlight;
  statesInFlight = (haFetch('/api/states') as Promise<HaStateObject[] | null>)
    .then((states) => {
      const list = states ?? [];
      statesCache = { at: Date.now(), states: list };
      return list;
    })
    .finally(() => { statesInFlight = null; });
  return statesInFlight;
}

/**
 * For finding which entities exist (to-do lists, TaskMate's sensors): a
 * copy of all states up to this old will do, since those rarely change;
 * what's in them is fetched fresh on its own. The dashboard used to
 * download every entity's state once a minute just to find its lists.
 */
export const ENTITY_LIST_MAX_AGE_MS = 10 * 60 * 1000;

/** Test hook: forget the shared copy. */
export function resetStatesCache(): void {
  statesCache = null;
  statesInFlight = null;
}

/**
 * Every entity state, or [] on failure (used by HA entity picker UIs and
 * generic entity/sensor cards).
 */
export async function getAllEntityStates(maxAgeMs?: number): Promise<HaStateObject[]> {
  try {
    return await fetchAllStates(maxAgeMs);
  } catch {
    return [];
  }
}

/** Whether HA API calls should work (add-on proxy or token configured) */
export function hasToken(): boolean {
  return (isAddOn() && getConfig().ha_available) || !!getHaToken();
}

/**
 * Error thrown by callBeaconAction when the add-on server bridge (or HA
 * itself, relayed through it) rejects the request. Carries the HA error
 * `code` when available (e.g. "not_supported" for calendars that don't
 * support event update/delete) so callers can branch on it instead of
 * pattern-matching the message string.
 */
export class BeaconActionError extends Error {
  code: string | null;
  status: number;
  constructor(message: string, code: string | null, status: number) {
    super(message);
    this.name = 'BeaconActionError';
    this.code = code;
    this.status = status;
  }
}

/**
 * POST to one of the add-on server's /beacon-action/* endpoints and return
 * the parsed JSON body — including on error responses, since those bridge
 * endpoints return `{ error, code }` bodies that callers need to inspect
 * (e.g. to detect HA's "not_supported" for calendars lacking event
 * update/delete). Only used in add-on/proxy mode; standalone mode talks to
 * HA directly over WebSocket via HomeAssistantClient instead.
 */
export async function callBeaconAction(path: string, body: Record<string, unknown>): Promise<unknown> {
  const base = getBaseUrl();
  const token = getHaToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token && !isAddOn()) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data)
      ? String((data as { error: unknown }).error)
      : `Family action ${path} failed: ${res.status}`;
    const code = (data && typeof data === 'object' && 'code' in data)
      ? (data as { code: string | null }).code
      : null;
    throw new BeaconActionError(message, code, res.status);
  }

  return data;
}
