/**
 * Standalone weather hook — uses OpenWeatherMap when HA is not connected.
 *
 * Reads location and API key from settings (stored during onboarding wizard).
 * Falls back gracefully when no API key or location is configured.
 */

import { useState, useEffect, useCallback } from 'react';
import { WeatherData } from '../types';
import { fetchCurrentWeather, fetchForecast, OWMUnits } from '../api/openweathermap';

const CACHE_KEY = 'beacon-weather-cache';
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

/** Settings storage key — kept in sync with useSettings.ts */
const SETTINGS_STORAGE_KEY = 'beacon-settings';

interface CachedWeather {
  data: WeatherData;
  timestamp: number;
  location: string;
}

function getCachedWeather(): CachedWeather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedWeather = JSON.parse(raw);
    // Cache for 15 minutes
    if (Date.now() - cached.timestamp < REFRESH_INTERVAL) return cached;
    return null;
  } catch {
    return null;
  }
}

function setCachedWeather(data: WeatherData, location: string): void {
  try {
    const cached: CachedWeather = { data, timestamp: Date.now(), location };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch { /* best-effort */ }
}

/** Read weather location from the unified settings store. */
export function getWeatherLocation(): string {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return '';
    const settings = JSON.parse(raw);
    return settings.weatherLocation || '';
  } catch {
    return '';
  }
}

/** Read OWM API key from the unified settings store. */
function getOwmApiKey(): string {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return '';
    const settings = JSON.parse(raw);
    return settings.owmApiKey || '';
  } catch {
    return '';
  }
}

/** Determine units from locale in settings. */
function getUnits(): OWMUnits {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return 'imperial';
    const settings = JSON.parse(raw);
    const locale: string = settings.locale || 'en-US';
    // US uses imperial; most others use metric
    return locale === 'en-US' ? 'imperial' : 'metric';
  } catch {
    return 'imperial';
  }
}

/**
 * Legacy setter — writes to settings.weatherLocation for backward compat.
 * Prefer using updateSettings({ weatherLocation }) from useSettings hook.
 */
export function setWeatherLocation(location: string): void {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const settings = raw ? JSON.parse(raw) : {};
    settings.weatherLocation = location;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch { /* best-effort */ }
}

export function useStandaloneWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchWeather = useCallback(async () => {
    const location = getWeatherLocation();
    if (!location) return;

    // Check cache first
    const cached = getCachedWeather();
    if (cached && cached.location === location) {
      setWeather(cached.data);
      return;
    }

    const apiKey = getOwmApiKey();
    const units = getUnits();

    setLoading(true);
    try {
      const [current, forecast] = await Promise.all([
        fetchCurrentWeather(location, apiKey || undefined, units),
        fetchForecast(location, apiKey || undefined, units),
      ]);

      const data: WeatherData = {
        ...current,
        forecast,
      };

      setWeather(data);
      setError(null);
      setCachedWeather(data, location);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load weather');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  return { weather, error, loading, refresh: fetchWeather };
}
