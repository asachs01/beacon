import { useState, useEffect, useCallback } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { WeatherData } from '../types';

const WEATHER_ENTITY = import.meta.env.VITE_HA_WEATHER_ENTITY || 'weather.home';
const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

export function useWeather(getClient: () => HomeAssistantClient | null) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    const client = getClient();
    if (!client?.isConnected) return;

    try {
      const data = await client.getWeather(WEATHER_ENTITY);
      setWeather(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather');
    }
  }, [getClient]);

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  return { weather, error, refresh: fetchWeather };
}
