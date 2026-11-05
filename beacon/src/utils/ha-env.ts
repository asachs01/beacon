/** Shared environment detection helpers for HA add-on context */

/** Is this running as an HA add-on? Older runtime configs imply add-on mode. */
export function isAddOn(): boolean {
  const runtime = window.__BEACON_CONFIG__;
  return (
    !!runtime && (runtime.deployment_mode === 'addon' || runtime.deployment_mode === undefined)
  );
}

/** Does the deployment provide a same-origin backend proxy? */
export function usesServerProxy(): boolean {
  return !!window.__BEACON_CONFIG__;
}

/** Are we running inside HA's ingress proxy? */
export function isIngress(): boolean {
  return window.location.pathname.includes('/ingress/') || window !== window.parent;
}

/**
 * Get the base URL for API calls routed through Beacon's backend proxy.
 * In ingress mode this includes the ingress path; at the standalone root it is empty.
 */
export function getIngressBasePath(): string {
  if (usesServerProxy()) {
    return window.location.pathname.replace(/\/$/, '');
  }
  return '';
}
