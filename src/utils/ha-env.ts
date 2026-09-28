/** Shared environment detection helpers for HA add-on context */

/** Is this running behind the Family server (runtime config from run.sh)? */
export function isAddOn(): boolean {
  return !!window.__BEACON_CONFIG__;
}

/** HA ingress is identified by its URL, not by an arbitrary parent frame. */
export function isIngress(): boolean {
  return /^\/api\/hassio_ingress\/[^/]+(?:\/|$)/.test(window.location.pathname);
}

/**
 * Get the base URL for API calls routed through the ingress proxy.
 * In ingress: uses the HA-assigned ingress path.
 * In standalone proxy mode: API paths are relative to the current origin.
 */
export function getIngressBasePath(): string {
  if (!isAddOn()) return '';
  return /^\/api\/hassio_ingress\/[^/]+/.exec(window.location.pathname)?.[0] || '';
}
