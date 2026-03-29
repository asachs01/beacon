import { useState, useEffect, useRef, useCallback } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { getConfig } from '../config';
import { setHaToken } from '../api/ha-rest';

/** Are we running inside HA's ingress proxy? */
function isIngress(): boolean {
  return window.location.pathname.includes('/ingress/') || (window !== window.parent);
}

function resolveHaUrl(): string {
  const config = getConfig();

  // If a real HA URL is configured (not the internal supervisor URL), use it
  if (config.ha_url && !config.ha_url.includes('supervisor')) return config.ha_url;

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
