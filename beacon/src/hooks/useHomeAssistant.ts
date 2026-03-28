import { useState, useEffect, useRef, useCallback } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { getConfig } from '../config';

const { ha_url: HA_URL, ha_token: HA_TOKEN } = getConfig();

export function useHomeAssistant() {
  const clientRef = useRef<HomeAssistantClient | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
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
