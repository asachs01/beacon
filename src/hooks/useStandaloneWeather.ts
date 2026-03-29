/**
 * Standalone weather hook — uses OpenWeatherMap when HA is not connected.
 *
 * Reads location from settings (stored during onboarding wizard).
 * Falls back gracefully when no API key or location is configured.
 */

import { useState, useEffect, useCallback } from 'react';
import { WeatherData } from '../types';
import { fetchCurrentWeather, fetchForecast } from '../api/openweathermap';

const STORAGE_KEY = 'beacon-weather-location';
const CACHE_KEY = 'beacon-weather-cache';
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

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

export function getWeatherLocation(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setWeatherLocation(location: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, location);
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

    setLoading(true);
    try {
      const [current, forecast] = await Promise.all([
        fetchCurrentWeather(location),
        fetchForecast(location),
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
