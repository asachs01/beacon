import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { RefreshCw } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!hasToken()) {
      setError('Not connected to Home Assistant');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Discover weather entity
      const configEntity = getConfig().weather_entity;
      let entityId = configEntity;

      if (!entityId) {
        const states = await haFetch('/api/states') as Array<{
          entity_id: string;
          state: string;
          attributes: Record<string, unknown>;
        }>;
        const weatherEntity = states.find(s => s.entity_id.startsWith('weather.'));
        if (!weatherEntity) {
          setError('No weather entity found');
          setLoading(false);
          return;
        }
        entityId = weatherEntity.entity_id;
      }

      // Fetch current state
      const entity = await haFetch(`/api/states/${entityId}`) as {
        entity_id: string;
        state: string;
        attributes: Record<string, unknown>;
      };

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
              return (
                <div key={day.datetime} className="weather-forecast-card">
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
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
