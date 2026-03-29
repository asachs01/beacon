import { useState, useEffect, useRef, useCallback } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { getConfig } from '../config';

/** Are we running inside HA's ingress proxy? */
function isIngress(): boolean {
  return window.location.pathname.includes('/ingress/') || (window !== window.parent);
}

function resolveHaUrl(): string {
  const config = getConfig();

  // In ingress mode, connect through the current origin — HA's proxy handles auth
  if (isIngress()) {
    try {
      return window.parent.location.origin;
    } catch {
      return window.location.origin;
    }
  }

  if (config.ha_url) return config.ha_url;
  return window.location.origin;
}

export function useHomeAssistant() {
  const clientRef = useRef<HomeAssistantClient | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const { ha_token: HA_TOKEN } = getConfig();
    const HA_URL = resolveHaUrl();

    // In ingress mode, HA's proxy handles auth — we can use the access_token
    // from the hassio ingress session. If no token, try connecting anyway
    // (ingress may provide session-based auth).
    if (!HA_TOKEN && !isIngress()) {
      console.warn('Beacon: No HA token configured. Running in demo mode.');
      return;
    }

    const client = new HomeAssistantClient(HA_URL, HA_TOKEN || '');
    client.setConnectionChangeHandler(setConnected);
    clientRef.current = client;

    client.connect().catch((err) => {
      console.error('Beacon: Failed to connect to Home Assistant', err);
    });

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, []);

  const getClient = useCallback(() => clientRef.current, []);

  return { client: getClient, connected };
}
