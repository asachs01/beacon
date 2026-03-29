import { useState, useEffect, useRef, useCallback } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { getConfig } from '../config';
import { setHaToken } from '../api/ha-rest';

/** Are we running inside HA's ingress proxy? */
function isIngress(): boolean {
  return window.location.pathname.includes('/ingress/') || (window !== window.parent);
}

/** Is the add-on's API proxy available? (server.js proxies /api/* to HA) */
function isAddOn(): boolean {
  return !!window.__BEACON_CONFIG__;
}

function resolveHaUrl(): string {
  const config = getConfig();

  // If a real HA URL is configured (not the internal supervisor URL), use it
  if (config.ha_url && !config.ha_url.includes('supervisor')) return config.ha_url;

  // In add-on mode with the proxy server, use same-origin (proxy handles /api/*)
  if (isAddOn()) return window.location.origin;

  // In ingress or iframe mode, use the parent frame's origin (the HA frontend)
  if (isIngress()) {
    try {
      return window.parent.location.origin;
    } catch {
      return window.location.origin;
    }
  }

  return window.location.origin;
}

/**
 * Request an access token from the HA frontend via the ingress postMessage API.
 * HA panels use this to get a short-lived token for API calls.
 * Returns null if not in ingress or if the request times out.
 */
function requestIngressToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!isIngress()) {
      resolve(null);
      return;
    }

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 3000);

    function handler(event: MessageEvent) {
      if (event.data?.type === 'auth/token') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve(event.data.access_token || null);
      }
    }

    window.addEventListener('message', handler);

    // Request token from HA frontend
    try {
      window.parent.postMessage({ type: 'auth/request' }, '*');
    } catch {
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      resolve(null);
    }
  });
}

/**
 * Check if the add-on's API proxy is working by hitting a lightweight endpoint.
 * The proxy injects the Supervisor token server-side.
 */
async function probeProxy(): Promise<boolean> {
  try {
    const res = await fetch('/api/config', { headers: { 'Accept': 'application/json' } });
    return res.ok;
  } catch {
    return false;
  }
}

export function useHomeAssistant() {
  const clientRef = useRef<HomeAssistantClient | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const config = getConfig();
      let token = config.ha_token;
      const url = resolveHaUrl();

      // If no token from config, try requesting one from HA ingress
      if (!token && isIngress()) {
        token = await requestIngressToken() || '';
      }

      // If still no token and we're in add-on mode, check if the proxy works.
      // The proxy adds the Supervisor token server-side, so the WebSocket
      // auth message needs a token. Fetch one from the proxy's /api/ endpoint.
      if (!token && isAddOn()) {
        const proxyWorks = await probeProxy();
        if (proxyWorks) {
          // The proxy handles auth — use a special "proxy" marker.
          // The WebSocket connection goes through the proxy which injects
          // the Supervisor token. We still need *something* for the WS
          // auth message, but the proxy rewrites it.
          // Actually, the HA WS protocol requires auth_required → auth message.
          // The proxy forwards the raw WS frames, so we need a real token.
          // Let's get one from the Supervisor API via the proxy.
          try {
            const res = await fetch('/api/config');
            if (res.ok) {
              // Proxy works — we can make REST API calls without a token.
              // For WebSocket, we need the token. But the proxy can't easily
              // inject tokens into WebSocket frames. So we'll skip WS and
              // use REST-only mode.
              console.info('Beacon: API proxy available. Using REST-only mode.');
              setHaToken('__proxy__');
              if (!cancelled) setConnected(true);
              return;
            }
          } catch { /* fall through */ }
        }
      }

      if (!token) {
        console.warn('Beacon: No HA token available. Running in demo mode.');
        return;
      }

      // Share the token with the REST API module so grocery/calendar REST calls work too
      setHaToken(token);

      if (cancelled) return;

      const client = new HomeAssistantClient(url, token);
      client.setConnectionChangeHandler(setConnected);
      clientRef.current = client;

      client.connect().catch((err) => {
        console.error('Beacon: Failed to connect to Home Assistant', err);
      });
    }

    connect();

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  const getClient = useCallback(() => clientRef.current, []);

  return { client: getClient, connected };
}
