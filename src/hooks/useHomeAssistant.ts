import { useState, useEffect, useRef, useCallback } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { getConfig } from '../config';
import { setHaToken } from '../api/ha-rest';
import { isAddOn } from '../utils/ha-env';

function resolveHaUrl(): string {
  const config = getConfig();

  if (config.ha_url && !config.ha_url.includes('supervisor')) return config.ha_url;

  return window.location.origin;
}

export function useHomeAssistant() {
  const clientRef = useRef<HomeAssistantClient | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const config = getConfig();
      const token = config.ha_token;
      const url = resolveHaUrl();

      // In server-backed mode the browser has no HA token. The server uses
      // its Supervisor token (add-on) or HA_TOKEN (standalone Docker).
      if (isAddOn() && !token) {
        if (!config.ha_available) {
          console.info('Family: Local-only server mode — Home Assistant is not configured.');
          return;
        }
        console.info('Family: Server proxy mode — using same-origin REST API.');
        if (!cancelled) setConnected(true);
        return;
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
