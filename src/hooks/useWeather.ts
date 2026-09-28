import { useState, useEffect, useCallback, useRef } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { WeatherData } from '../types';
import { hasToken } from '../api/ha-rest';
import { findWeatherEntity, weatherEntityId } from '../api/ha-services';
import { refreshWhileAwake } from '../utils/display-sleep';

const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

/**
 * `enabled: false` stops refreshing (the last reading is kept); turning it
 * back on fetches at once. `entityId` is Settings' Weather Entity: changing
 * it fetches at once too.
 */
export function useWeather(getClient: () => HomeAssistantClient | null, enabled = true, entityId?: string) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the latest fetch may set state: changing the entity (or a refresh)
  // starts a new fetch while an older one is still in flight, and the older
  // one must not overwrite the newer with a stale (wrong-entity) reading.
  const requestId = useRef(0);

  const fetchWeather = useCallback(async () => {
    const client = getClient();
    const configEntity = entityId?.trim() || weatherEntityId();
    const myRequest = ++requestId.current;
    const isCurrent = () => myRequest === requestId.current;

    // Try WebSocket client first
    if (client?.isConnected) {
      try {
        const data = await client.getWeather(configEntity);
        if (!isCurrent()) return;
        setWeather(data);
        setError(null);
        return;
      } catch (err) {
        if (!isCurrent()) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch weather');
      }
    }

    // Fall back to REST API (proxy mode)
    if (hasToken()) {
      try {
        const entity = await findWeatherEntity(configEntity);
        if (!isCurrent()) return;
        if (entity) {
          const attrs = entity.attributes;
          setWeather({
            temperature: (attrs.temperature as number) ?? 0,
            temperatureUnit: (attrs.temperature_unit as string) ?? '°F',
            condition: entity.state,
            humidity: attrs.humidity as number | undefined,
            windSpeed: attrs.wind_speed as number | undefined,
            forecast: [], // forecast requires a separate service call
          });
          setError(null);
        }
      } catch (err) {
        if (!isCurrent()) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch weather');
      }
    }
  }, [getClient, entityId]);

  useEffect(() => {
    if (!enabled) return;
    fetchWeather();
    return refreshWhileAwake(fetchWeather, REFRESH_INTERVAL);
  }, [fetchWeather, enabled]);

  return { weather, error, refresh: fetchWeather };
}
