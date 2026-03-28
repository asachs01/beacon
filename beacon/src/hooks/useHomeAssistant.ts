import { useState, useEffect, useRef, useCallback } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { getConfig } from '../config';

function resolveHaUrl(): string {
  const config = getConfig();
  if (config.ha_url) return config.ha_url;
  // In ingress mode, use the parent frame's origin (not the inner iframe)
  try {
    return window.parent.location.origin;
  } catch {
    // Cross-origin — fall back to current origin but force https
    const origin = window.location.origin;
    return origin.replace(/^http:/, 'https:');
  }
}

export function useHomeAssistant() {
  const clientRef = useRef<HomeAssistantClient | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const { ha_token: HA_TOKEN } = getConfig();
    const HA_URL = resolveHaUrl();

    if (!HA_TOKEN) {
      console.warn('Beacon: No HA token configured. Set VITE_HA_TOKEN env var.');
      return;
    }

    const client = new HomeAssistantClient(HA_URL, HA_TOKEN);
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
