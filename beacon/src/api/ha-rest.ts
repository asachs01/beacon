/**
 * Shared helpers for HA REST API calls.
 *
 * In add-on mode (proxy), API calls go through the ingress path to the
 * add-on's server.js which proxies to http://supervisor/core with
 * SUPERVISOR_TOKEN. No browser-side auth needed.
 *
 * In standalone mode, API calls go directly to the HA instance with a
 * user-provided long-lived access token.
 */
import { getConfig } from '../config';

/** Detect if we're running as an HA add-on (runtime config was injected) */
function isAddOn(): boolean {
  return !!window.__BEACON_CONFIG__;
}

/**
 * Get the base URL for API calls.
 * - Add-on mode: use the ingress base path (e.g. /api/hassio_ingress/<token>)
 * - Standalone mode: use the configured HA URL or current origin
 */
function resolveBaseUrl(): string {
  // Add-on proxy mode: API calls go through the ingress path
  if (isAddOn()) {
    // The page is loaded at /api/hassio_ingress/<token>/
    // API calls should go to /api/hassio_ingress/<token>/api/...
    // Using '.' as base resolves relative to the current path
    const pathname = window.location.pathname;
    // Strip trailing slash for clean joining
    return pathname.replace(/\/$/, '');
  }

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
  return res.json();
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
): Promise<unknown> {
  // In add-on mode, route through the dedicated service endpoint
  // (HA ingress proxy can mangle POST bodies on /api/* paths)
  if (isAddOn()) {
    const base = getBaseUrl();
    const res = await fetch(`${base}/beacon-action/service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, service, data: data ?? {}, return_response: returnResponse }),
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

/** Whether HA API calls should work (add-on proxy or token configured) */
export function hasToken(): boolean {
  return isAddOn() || !!getHaToken();
}
