/** Shared environment detection helpers for HA add-on context */

/** Is this running as an HA add-on? (runtime config injected by run.sh) */
export function isAddOn(): boolean {
  return !!window.__BEACON_CONFIG__;
}

/** Are we running inside HA's ingress proxy? */
export function isIngress(): boolean {
  return window.location.pathname.includes('/ingress/') || (window !== window.parent);
}

/**
 * Get the base URL for API calls routed through the ingress proxy.
 * In add-on mode: uses the ingress base path.
 * In standalone mode: uses configured ha_url or current origin.
 */
export function getIngressBasePath(): string {
  if (isAddOn()) {
    return window.location.pathname.replace(/\/$/, '');
  }
  return '';
}
