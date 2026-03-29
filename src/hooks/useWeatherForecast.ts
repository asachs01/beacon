import { useState, useEffect, useCallback } from 'react';
import { ForecastDay } from '../types';
import { callHaService, haFetch, hasToken } from '../api/ha-rest';
import { getConfig } from '../config';

const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * Fetches a 7-day daily weather forecast from Home Assistant.
 * Auto-discovers the weather entity if none is configured.
 */
export function useWeatherForecast(): ForecastDay[] {
  const [forecast, setForecast] = useState<ForecastDay[]>([]);

  const fetchForecast = useCallback(async () => {
    if (!hasToken()) return;

    try {
      // Resolve weather entity — try configured, then auto-discover
      const configEntity = getConfig().weather_entity;
      let entityId = '';

      if (configEntity) {
        try {
          await haFetch(`/api/states/${configEntity}`);
          entityId = configEntity;
        } catch { /* doesn't exist, fall through */ }
      }

      if (!entityId) {
        const states = (await haFetch('/api/states')) as Array<{ entity_id: string }>;
        const found = states.find((s) => s.entity_id.startsWith('weather.'));
        if (!found) return;
        entityId = found.entity_id;
      }

      const result = (await callHaService(
        'weather',
        'get_forecasts',
        { entity_id: entityId, type: 'daily' },
        true,
      )) as Record<string, unknown>;

      // Response shape: { service_response: { "weather.xxx": { forecast: [...] } } }
      // or in add-on proxy mode the wrapper may already unwrap service_response
      const outer =
        (result as { service_response?: Record<string, unknown> })
          .service_response ?? result;
      const entityData = outer[entityId] as
        | { forecast?: Array<Record<string, unknown>> }
        | undefined;
      const raw = entityData?.forecast ?? [];

      const days: ForecastDay[] = raw.map((f) => ({
        date: (f.datetime as string).slice(0, 10), // "2026-03-29"
        condition: (f.condition as string) ?? 'sunny',
        tempHigh: (f.temperature as number) ?? 0,
        tempLow: (f.templow as number) ?? 0,
      }));

      setForecast(days);
    } catch {
      // Silently ignore — weather is supplementary
    }
  }, []);

  useEffect(() => {
    fetchForecast();
    const interval = setInterval(fetchForecast, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchForecast]);

  return forecast;
}
