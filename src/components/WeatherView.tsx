import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isSameDay } from 'date-fns';
import { RefreshCw, Droplets, Wind, Thermometer, Gauge, Clock, CalendarDays } from 'lucide-react';
import { weatherIcon, conditionLabel } from '../types/weather-icons';
import { hasToken } from '../api/ha-rest';
import { findWeatherEntity, getWeatherForecast } from '../api/ha-services';
import { refreshWhileAwake } from '../utils/display-sleep';
import '../styles/weather.css';
import '../styles/glass.css';

interface ForecastItem {
  datetime: string;
  condition: string;
  temperature: number;
  templow: number;
  humidity?: number;
  wind_speed?: number;
  precipitation_probability?: number;
}

interface HourlyItem {
  datetime: string;
  condition: string;
  temperature: number;
  humidity?: number;
  wind_speed?: number;
  precipitation_probability?: number;
}

interface CurrentWeather {
  entityId: string;
  state: string;
  temperature: number;
  temperatureUnit: string;
  humidity?: number;
  windSpeed?: number;
  windSpeedUnit: string;
  windBearing?: number;
  pressure?: number;
  feelsLike?: number;
}

/**
 * The screen's tint for each condition: a faint wash of it over the theme's
 * background, as the Music screen has of the artwork.
 */
const CONDITION_TINT: Record<string, string> = {
  sunny: '#f59e0b',
  'clear-night': '#6366f1',
  partlycloudy: '#60a5fa',
  cloudy: '#94a3b8',
  fog: '#94a3b8',
  rainy: '#3b82f6',
  pouring: '#2563eb',
  lightning: '#8b5cf6',
  'lightning-rainy': '#7c3aed',
  snowy: '#38bdf8',
  'snowy-rainy': '#38bdf8',
  hail: '#64748b',
  windy: '#14b8a6',
  'windy-variant': '#14b8a6',
  exceptional: '#ef4444',
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** A wind bearing in degrees as a compass point. */
function compassPoint(degrees: number): string {
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

export function WeatherView() {
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [hourly, setHourly] = useState<HourlyItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHourly = useCallback(async (entityId: string) => {
    try {
      setHourlyLoading(true);
      setHourly(await getWeatherForecast<HourlyItem>(entityId, 'hourly'));
    } catch {
      setHourly([]);
    } finally {
      setHourlyLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!hasToken()) {
      setError('Not connected to Home Assistant');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const entity = await findWeatherEntity();
      if (!entity) {
        setError('No weather entity found');
        setLoading(false);
        return;
      }

      const entityId = entity.entity_id;

      const attrs = entity.attributes;
      setCurrent({
        entityId,
        state: entity.state,
        temperature: (attrs.temperature as number) ?? 0,
        temperatureUnit: (attrs.temperature_unit as string) ?? '°F',
        humidity: attrs.humidity as number | undefined,
        windSpeed: attrs.wind_speed as number | undefined,
        windSpeedUnit: (attrs.wind_speed_unit as string) ?? 'mph',
        windBearing: attrs.wind_bearing as number | undefined,
        pressure: attrs.pressure as number | undefined,
        feelsLike: attrs.apparent_temperature as number | undefined,
      });

      // Fetch daily forecast
      try {
        setForecast((await getWeatherForecast<ForecastItem>(entityId, 'daily')).slice(0, 7));
      } catch {
        // Forecast not available for this entity
        setForecast([]);
      }

      // Fetch hourly forecast
      await fetchHourly(entityId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather');
    } finally {
      setLoading(false);
    }
  }, [fetchHourly]);

  useEffect(() => {
    fetchData();
    return refreshWhileAwake(fetchData, 10 * 60 * 1000);
  }, [fetchData]);

  const handleDayClick = (datetime: string) => {
    setSelectedDay(prev => prev === datetime ? null : datetime);
  };

  const hoursForSelectedDay = selectedDay
    ? hourly.filter(h => isSameDay(parseISO(h.datetime), parseISO(selectedDay)))
    : [];

  const tint = CONDITION_TINT[current?.state ?? ''] ?? 'var(--accent, #3b82f6)';
  const shell = (children: React.ReactNode) => (
    <div className="weather-view" style={{ '--wx-tint': tint } as React.CSSProperties}>
      <div className="weather-bg" aria-hidden="true" />
      <div className="weather-scroll">{children}</div>
    </div>
  );

  if (loading && !current) {
    return shell(<div className="weather-loading">Loading weather…</div>);
  }

  if (error && !current) {
    return shell(
      <div className="weather-error">
        <p>{error}</p>
        <button type="button" className="weather-retry-btn" onClick={fetchData}>
          Retry
        </button>
      </div>,
    );
  }

  if (!current) return null;

  const unit = current.temperatureUnit.replace('°', '');
  const today = forecast.find((d) => isSameDay(parseISO(d.datetime), new Date()));

  // The hourly tile: the day picked below, else the next 24 hours.
  const now = Date.now();
  const hours = selectedDay
    ? hoursForSelectedDay
    : hourly.filter((h) => parseISO(h.datetime).getTime() > now - 60 * 60 * 1000).slice(0, 24);

  // The 7-day tile's bars span the week's lowest low to its highest high.
  const weekLow = Math.min(...forecast.map((d) => d.templow));
  const weekHigh = Math.max(...forecast.map((d) => d.temperature));
  const weekSpan = Math.max(1, weekHigh - weekLow);

  return shell(
    <div className="weather-layout">
      <div className="weather-col">
        {/* Current conditions */}
        <section className="weather-hero">
          <span className="weather-hero-icon" aria-hidden="true">{weatherIcon(current.state)}</span>
          <span className="weather-current-temp">{Math.round(current.temperature)}°</span>
          <span className="weather-current-condition">{conditionLabel(current.state)}</span>
          {today && (
            <span className="weather-hero-range">
              H:{Math.round(today.temperature)}°  L:{Math.round(today.templow)}°
            </span>
          )}
          <button
            type="button"
            className="weather-refresh-btn"
            onClick={fetchData}
            title="Refresh weather"
            aria-label="Refresh weather"
          >
            <RefreshCw size={18} strokeWidth={1.75} className={loading ? 'weather-spin' : undefined} />
          </button>
        </section>

        <div className="weather-current-details">
          {current.feelsLike != null && (
            <div className="weather-tile weather-detail">
              <span className="weather-tile-label"><Thermometer size={14} aria-hidden="true" /> Feels like</span>
              <span className="weather-detail-value">{Math.round(current.feelsLike)}°{unit}</span>
            </div>
          )}
          {current.humidity != null && (
            <div className="weather-tile weather-detail">
              <span className="weather-tile-label"><Droplets size={14} aria-hidden="true" /> Humidity</span>
              <span className="weather-detail-value">{Math.round(current.humidity)}%</span>
            </div>
          )}
          {current.windSpeed != null && (
            <div className="weather-tile weather-detail">
              <span className="weather-tile-label"><Wind size={14} aria-hidden="true" /> Wind</span>
              <span className="weather-detail-value">
                {Math.round(current.windSpeed)} <small>{current.windSpeedUnit}</small>
                {current.windBearing != null && <small> {compassPoint(current.windBearing)}</small>}
              </span>
            </div>
          )}
          {current.pressure != null && (
            <div className="weather-tile weather-detail">
              <span className="weather-tile-label"><Gauge size={14} aria-hidden="true" /> Pressure</span>
              <span className="weather-detail-value">{Math.round(current.pressure)} <small>hPa</small></span>
            </div>
          )}
        </div>
      </div>

      <div className="weather-col">
        {/* Hourly */}
        <section className="weather-tile weather-hourly">
          <div className="weather-tile-header">
            <h3 className="weather-tile-label weather-hourly-title">
              <Clock size={14} aria-hidden="true" />
              {selectedDay ? `Hourly — ${format(parseISO(selectedDay), 'EEEE, MMM d')}` : 'Hourly forecast'}
            </h3>
            {selectedDay && (
              <button type="button" className="weather-hourly-close" onClick={() => setSelectedDay(null)}>
                Next 24 hours
              </button>
            )}
          </div>
          {hourlyLoading ? (
            <div className="weather-hourly-loading">Loading hourly forecast…</div>
          ) : hours.length === 0 ? (
            <div className="weather-hourly-empty">
              {selectedDay ? 'No hourly forecast for this day.' : 'No hourly forecast available.'}
            </div>
          ) : (
            <div className="weather-hourly-scroll">
              {hours.map((hour, i) => {
                const time = parseISO(hour.datetime);
                return (
                  <div key={hour.datetime} className="weather-hourly-card">
                    <span className="weather-hourly-time">
                      {!selectedDay && i === 0 ? 'Now' : format(time, 'h a')}
                    </span>
                    <span className="weather-hourly-icon" aria-hidden="true">{weatherIcon(hour.condition)}</span>
                    <span className="weather-hourly-temp">{Math.round(hour.temperature)}°</span>
                    {hour.precipitation_probability != null && hour.precipitation_probability > 0 && (
                      <span className="weather-hourly-precip">{hour.precipitation_probability}%</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 7-day forecast: tap a day for its hours */}
        {forecast.length > 0 && (
          <section className="weather-tile weather-forecast">
            <h2 className="weather-tile-label weather-forecast-title">
              <CalendarDays size={14} aria-hidden="true" /> {forecast.length}-day forecast
            </h2>
            <ul className="weather-days">
              {forecast.map((day) => {
                const date = parseISO(day.datetime);
                const isSelected = selectedDay === day.datetime;
                const from = (day.templow - weekLow) / weekSpan;
                const to = (day.temperature - weekLow) / weekSpan;
                return (
                  <li key={day.datetime}>
                    <button
                      type="button"
                      className={`weather-forecast-card${isSelected ? ' weather-forecast-card--selected' : ''}`}
                      onClick={() => handleDayClick(day.datetime)}
                      aria-pressed={isSelected}
                      aria-label={`${format(date, 'EEEE')}: ${conditionLabel(day.condition)}, high ${Math.round(day.temperature)}°, low ${Math.round(day.templow)}°`}
                    >
                      <span className="weather-forecast-day">
                        {isSameDay(date, new Date()) ? 'Today' : format(date, 'EEE')}
                      </span>
                      <span className="weather-forecast-icon" aria-hidden="true">{weatherIcon(day.condition)}</span>
                      <span className="weather-forecast-precip">
                        {day.precipitation_probability ? `${day.precipitation_probability}%` : ''}
                      </span>
                      <span className="weather-forecast-low">{Math.round(day.templow)}°</span>
                      <span className="weather-range" aria-hidden="true">
                        <span
                          className="weather-range-fill"
                          style={{ left: `${from * 100}%`, width: `${Math.max(0.04, to - from) * 100}%` }}
                        />
                      </span>
                      <span className="weather-forecast-high">{Math.round(day.temperature)}°</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>,
  );
}
