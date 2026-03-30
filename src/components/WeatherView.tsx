import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isSameDay } from 'date-fns';
import { RefreshCw, ChevronDown, Droplets, Wind } from 'lucide-react';
import { weatherIcon, conditionLabel } from '../types/weather-icons';
import { haFetch, callHaService, hasToken } from '../api/ha-rest';
import { getConfig } from '../config';

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
  windBearing?: number;
  pressure?: number;
  feelsLike?: number;
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
      const result = await callHaService('weather', 'get_forecasts', {
        entity_id: entityId,
        type: 'hourly',
      }, true) as { service_response?: Record<string, { forecast: HourlyItem[] }> };

      const svcResponse = result?.service_response ?? result;
      const hourlyData = (svcResponse as Record<string, { forecast: HourlyItem[] }>)?.[entityId]?.forecast ?? [];
      setHourly(hourlyData);
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

      // Discover weather entity — try configured, then auto-discover
      const configEntity = getConfig().weather_entity;
      let entity: { entity_id: string; state: string; attributes: Record<string, unknown> } | null = null;

      // Try configured entity first
      if (configEntity) {
        try {
          entity = await haFetch(`/api/states/${configEntity}`) as typeof entity;
        } catch { /* entity doesn't exist, fall through to discovery */ }
      }

      // Auto-discover if configured entity doesn't exist
      if (!entity) {
        const states = await haFetch('/api/states') as Array<{
          entity_id: string;
          state: string;
          attributes: Record<string, unknown>;
        }>;
        const found = states.find(s => s.entity_id.startsWith('weather.'));
        if (!found) {
          setError('No weather entity found');
          setLoading(false);
          return;
        }
        entity = found;
      }

      const entityId = entity!.entity_id;

      const attrs = entity.attributes;
      setCurrent({
        entityId,
        state: entity.state,
        temperature: (attrs.temperature as number) ?? 0,
        temperatureUnit: (attrs.temperature_unit as string) ?? '°F',
        humidity: attrs.humidity as number | undefined,
        windSpeed: attrs.wind_speed as number | undefined,
        windBearing: attrs.wind_bearing as number | undefined,
        pressure: attrs.pressure as number | undefined,
        feelsLike: attrs.apparent_temperature as number | undefined,
      });

      // Fetch daily forecast
      try {
        const result = await callHaService('weather', 'get_forecasts', {
          entity_id: entityId,
          type: 'daily',
        }, true) as { service_response?: Record<string, { forecast: ForecastItem[] }> };

        const svcResponse = result?.service_response ?? result;
        const forecastData = (svcResponse as Record<string, { forecast: ForecastItem[] }>)?.[entityId]?.forecast ?? [];
        setForecast(forecastData.slice(0, 7));
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
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDayClick = (datetime: string) => {
    setSelectedDay(prev => prev === datetime ? null : datetime);
  };

  const hoursForSelectedDay = selectedDay
    ? hourly.filter(h => isSameDay(parseISO(h.datetime), parseISO(selectedDay)))
    : [];

  if (loading && !current) {
    return (
      <div className="weather-view">
        <div className="weather-loading">Loading weather data...</div>
      </div>
    );
  }

  if (error && !current) {
    return (
      <div className="weather-view">
        <div className="weather-error">
          <p>{error}</p>
          <button type="button" className="weather-retry-btn" onClick={fetchData}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const unit = current.temperatureUnit.replace('°', '');

  return (
    <div className="weather-view">
      {/* Current conditions */}
      <section className="weather-current">
        <div className="weather-current-main">
          <span className="weather-current-icon">
            {weatherIcon(current.state)}
          </span>
          <div className="weather-current-temp-block">
            <span className="weather-current-temp">
              {Math.round(current.temperature)}°{unit}
            </span>
            <span className="weather-current-condition">
              {conditionLabel(current.state)}
            </span>
          </div>
        </div>

        <div className="weather-current-details">
          {current.feelsLike != null && (
            <div className="weather-detail">
              <span className="weather-detail-label">Feels like</span>
              <span className="weather-detail-value">{Math.round(current.feelsLike)}°{unit}</span>
            </div>
          )}
          {current.humidity != null && (
            <div className="weather-detail">
              <span className="weather-detail-label">Humidity</span>
              <span className="weather-detail-value">{current.humidity}%</span>
            </div>
          )}
          {current.windSpeed != null && (
            <div className="weather-detail">
              <span className="weather-detail-label">Wind</span>
              <span className="weather-detail-value">{Math.round(current.windSpeed)} mph</span>
            </div>
          )}
          {current.pressure != null && (
            <div className="weather-detail">
              <span className="weather-detail-label">Pressure</span>
              <span className="weather-detail-value">{Math.round(current.pressure)} hPa</span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="weather-refresh-btn"
          onClick={fetchData}
          title="Refresh weather"
          aria-label="Refresh weather"
        >
          <RefreshCw size={18} strokeWidth={1.5} />
        </button>
      </section>

      {/* 7-day forecast */}
      {forecast.length > 0 && (
        <section className="weather-forecast">
          <h2 className="weather-forecast-title">7-Day Forecast</h2>
          <div className="weather-forecast-scroll">
            {forecast.map((day) => {
              const date = parseISO(day.datetime);
              const dayName = format(date, 'EEE');
              const dateLabel = format(date, 'MMM d');
              const isSelected = selectedDay === day.datetime;
              return (
                <button
                  key={day.datetime}
                  type="button"
                  className={`weather-forecast-card${isSelected ? ' weather-forecast-card--selected' : ''}`}
                  onClick={() => handleDayClick(day.datetime)}
                  aria-expanded={isSelected}
                >
                  <span className="weather-forecast-day">{dayName}</span>
                  <span className="weather-forecast-date">{dateLabel}</span>
                  <span className="weather-forecast-icon">
                    {weatherIcon(day.condition)}
                  </span>
                  <div className="weather-forecast-temps">
                    <span className="weather-forecast-high">{Math.round(day.temperature)}°</span>
                    <span className="weather-forecast-low">{Math.round(day.templow)}°</span>
                  </div>
                  {day.precipitation_probability != null && (
                    <span className="weather-forecast-precip">
                      {day.precipitation_probability}%
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`weather-forecast-chevron${isSelected ? ' weather-forecast-chevron--open' : ''}`}
                  />
                </button>
              );
            })}
          </div>

          {/* Hourly detail for selected day */}
          {selectedDay && (
            <div className="weather-hourly">
              <div className="weather-hourly-header">
                <h3 className="weather-hourly-title">
                  Hourly — {format(parseISO(selectedDay), 'EEEE, MMM d')}
                </h3>
                <button
                  type="button"
                  className="weather-hourly-close"
                  onClick={() => setSelectedDay(null)}
                  aria-label="Close hourly forecast"
                >
                  Collapse
                </button>
              </div>
              {hourlyLoading ? (
                <div className="weather-hourly-loading">Loading hourly data...</div>
              ) : hoursForSelectedDay.length === 0 ? (
                <div className="weather-hourly-empty">No hourly data available for this day.</div>
              ) : (
                <div className="weather-hourly-scroll">
                  {hoursForSelectedDay.map((hour) => {
                    const time = parseISO(hour.datetime);
                    return (
                      <div key={hour.datetime} className="weather-hourly-card">
                        <span className="weather-hourly-time">{format(time, 'h a')}</span>
                        <span className="weather-hourly-icon">{weatherIcon(hour.condition)}</span>
                        <span className="weather-hourly-temp">{Math.round(hour.temperature)}°</span>
                        {hour.precipitation_probability != null && (
                          <span className="weather-hourly-precip">
                            <Droplets size={12} /> {hour.precipitation_probability}%
                          </span>
                        )}
                        {hour.wind_speed != null && (
                          <span className="weather-hourly-wind">
                            <Wind size={12} /> {Math.round(hour.wind_speed)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
