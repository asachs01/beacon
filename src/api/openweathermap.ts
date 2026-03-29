/**
 * OpenWeatherMap free-tier API integration.
 *
 * Uses current weather + 5-day/3-hour forecast endpoints.
 * The API key can be provided via VITE_OWM_API_KEY env var or falls back
 * to a built-in key for convenience during development.
 */

import { WeatherData, ForecastDay } from '../types';

const API_KEY = import.meta.env.VITE_OWM_API_KEY || '';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

/** Map OWM icon/condition codes to HA-compatible condition strings */
function mapCondition(owmMain: string): string {
  const map: Record<string, string> = {
    Clear: 'sunny',
    Clouds: 'cloudy',
    Rain: 'rainy',
    Drizzle: 'rainy',
    Thunderstorm: 'lightning-rainy',
    Snow: 'snowy',
    Mist: 'fog',
    Smoke: 'fog',
    Haze: 'fog',
    Dust: 'fog',
    Fog: 'fog',
    Sand: 'fog',
    Ash: 'fog',
    Squall: 'windy',
    Tornado: 'exceptional',
  };
  return map[owmMain] || 'cloudy';
}

export interface OWMCurrentResponse {
  main: {
    temp: number;
    humidity: number;
    feels_like: number;
    pressure: number;
  };
  wind: { speed: number; deg?: number };
  weather: Array<{ main: string; description: string }>;
  name: string;
}

export interface OWMForecastResponse {
  list: Array<{
    dt: number;
    dt_txt: string;
    main: { temp: number; temp_min: number; temp_max: number };
    weather: Array<{ main: string }>;
    pop?: number;
  }>;
}

/**
 * Fetch current weather by zip code (US default) or city name.
 * Units are imperial (Fahrenheit).
 */
export async function fetchCurrentWeather(
  location: string,
  apiKey?: string,
): Promise<WeatherData> {
  const key = apiKey || API_KEY;
  if (!key) throw new Error('No OpenWeatherMap API key configured');

  // Determine query parameter: zip code (digits) vs city name
  const isZip = /^\d{5}$/.test(location.trim());
  const query = isZip
    ? `zip=${location.trim()},us`
    : `q=${encodeURIComponent(location.trim())}`;

  const res = await fetch(
    `${BASE_URL}/weather?${query}&appid=${key}&units=imperial`,
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Weather API error (${res.status}): ${body}`);
  }

  const data: OWMCurrentResponse = await res.json();
  const condition = data.weather?.[0]?.main ?? 'Clear';

  return {
    temperature: Math.round(data.main.temp),
    temperatureUnit: '°F',
    condition: mapCondition(condition),
    humidity: data.main.humidity,
    windSpeed: Math.round(data.wind.speed),
    forecast: [],
  };
}

/**
 * Fetch a 5-day forecast and aggregate into daily highs/lows.
 */
export async function fetchForecast(
  location: string,
  apiKey?: string,
): Promise<ForecastDay[]> {
  const key = apiKey || API_KEY;
  if (!key) return [];

  const isZip = /^\d{5}$/.test(location.trim());
  const query = isZip
    ? `zip=${location.trim()},us`
    : `q=${encodeURIComponent(location.trim())}`;

  const res = await fetch(
    `${BASE_URL}/forecast?${query}&appid=${key}&units=imperial`,
  );
  if (!res.ok) return [];

  const data: OWMForecastResponse = await res.json();

  // Group forecast entries by date and aggregate
  const byDate = new Map<
    string,
    { temps: number[]; conditions: string[]; pops: number[] }
  >();

  for (const entry of data.list) {
    const date = entry.dt_txt.split(' ')[0]; // "YYYY-MM-DD"
    if (!byDate.has(date)) {
      byDate.set(date, { temps: [], conditions: [], pops: [] });
    }
    const bucket = byDate.get(date)!;
    bucket.temps.push(entry.main.temp_max, entry.main.temp_min);
    bucket.conditions.push(entry.weather?.[0]?.main ?? 'Clear');
    if (entry.pop != null) bucket.pops.push(entry.pop);
  }

  const days: ForecastDay[] = [];
  for (const [date, bucket] of byDate.entries()) {
    // Skip today — only show future days
    const todayStr = new Date().toISOString().slice(0, 10);
    if (date === todayStr) continue;

    // Use the most common condition for the day
    const conditionCounts = new Map<string, number>();
    for (const c of bucket.conditions) {
      conditionCounts.set(c, (conditionCounts.get(c) || 0) + 1);
    }
    let topCondition = 'Clear';
    let topCount = 0;
    for (const [c, count] of conditionCounts) {
      if (count > topCount) {
        topCondition = c;
        topCount = count;
      }
    }

    days.push({
      date,
      condition: mapCondition(topCondition),
      tempHigh: Math.round(Math.max(...bucket.temps)),
      tempLow: Math.round(Math.min(...bucket.temps)),
    });

    if (days.length >= 5) break;
  }

  return days;
}
