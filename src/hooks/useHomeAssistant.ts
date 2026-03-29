import { useState, useEffect, useRef, useCallback } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { getConfig } from '../config';
import { setHaToken } from '../api/ha-rest';

/** Are we running inside HA's ingress proxy? */
function isIngress(): boolean {
  return window.location.pathname.includes('/ingress/') || (window !== window.parent);
}

/** Is this running as an HA add-on? (runtime config injected by run.sh) */
function isAddOn(): boolean {
  return !!window.__BEACON_CONFIG__;
}

function resolveHaUrl(): string {
  const config = getConfig();

  if (config.ha_url && !config.ha_url.includes('supervisor')) return config.ha_url;

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

    try {
      window.parent.postMessage({ type: 'auth/request' }, '*');
    } catch {
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      resolve(null);
    }
  });
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

      // In add-on mode with the proxy, we don't need a browser-side token.
      // The server.js proxy injects SUPERVISOR_TOKEN for all /api/* requests.
      // Just mark as connected so REST-based hooks fire.
      if (isAddOn() && !token) {
        console.info('Beacon: Add-on proxy mode — using REST API via ingress.');
        if (!cancelled) setConnected(true);
        return;
      }

      // If no token from config, try requesting one from HA ingress
      if (!token && isIngress()) {
        token = await requestIngressToken() || '';
      }

      if (!token) {
        console.warn('Beacon: No HA token available. Running in demo mode.');
        return;
      }

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
