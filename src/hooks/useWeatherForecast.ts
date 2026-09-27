import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { ForecastDay } from '../types';
import { hasToken } from '../api/ha-rest';
import { findWeatherEntity, getWeatherForecast } from '../api/ha-services';
import { refreshWhileAwake } from '../utils/display-sleep';

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
      const entity = await findWeatherEntity();
      if (!entity) return;
      const raw = await getWeatherForecast(entity.entity_id, 'daily');

      const days: ForecastDay[] = raw.map((f) => ({
        // The day it falls on here, as the Weather screen shows it: many
        // integrations give the time in UTC, often still the day before
        // east of UTC (the date in the string put it on the wrong day).
        date: format(parseISO(f.datetime as string), 'yyyy-MM-dd'),
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
    return refreshWhileAwake(fetchForecast, REFRESH_INTERVAL);
  }, [fetchForecast]);

  return forecast;
}
