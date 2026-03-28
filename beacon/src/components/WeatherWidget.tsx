import { useState, useRef, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { WeatherData } from '../types';

const WEATHER_ICONS: Record<string, string> = {
  'clear-night': '\uD83C\uDF19',
  'cloudy': '\u2601\uFE0F',
  'fog': '\uD83C\uDF2B\uFE0F',
  'hail': '\uD83C\uDF28\uFE0F',
  'lightning': '\u26A1',
  'lightning-rainy': '\u26C8\uFE0F',
  'partlycloudy': '\u26C5',
  'pouring': '\uD83C\uDF27\uFE0F',
  'rainy': '\uD83C\uDF26\uFE0F',
  'snowy': '\u2744\uFE0F',
  'snowy-rainy': '\uD83C\uDF28\uFE0F',
  'sunny': '\u2600\uFE0F',
  'windy': '\uD83D\uDCA8',
  'windy-variant': '\uD83D\uDCA8',
  'exceptional': '\u26A0\uFE0F',
};

function weatherIcon(condition: string): string {
  return WEATHER_ICONS[condition] || '\uD83C\uDF24\uFE0F';
}

function conditionLabel(condition: string): string {
  return condition
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

interface WeatherWidgetProps {
  weather: WeatherData | null;
  error?: string | null;
}

export function WeatherWidget({ weather, error }: WeatherWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close popup on outside click
  useEffect(() => {
    if (!expanded) return;

    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  if (error || !weather) {
    return null; // Stay silent in the header when unavailable
  }

  return (
    <div className="weather-widget" ref={popupRef}>
      <button
        type="button"
        className="weather-widget-btn"
        onClick={() => setExpanded(prev => !prev)}
        aria-label={`Weather: ${Math.round(weather.temperature)}°, ${conditionLabel(weather.condition)}`}
      >
        <span className="weather-widget-icon">{weatherIcon(weather.condition)}</span>
        <span className="weather-widget-temp">{Math.round(weather.temperature)}°</span>
        <span className="weather-widget-condition">{conditionLabel(weather.condition)}</span>
      </button>

      {expanded && weather.forecast.length > 0 && (
        <div className="weather-widget-popup">
          <div className="weather-widget-popup-header">
            <span className="weather-widget-popup-title">5-Day Forecast</span>
          </div>
          <div className="weather-widget-forecast">
            {weather.forecast.map((day) => (
              <div key={day.date} className="weather-widget-forecast-day">
                <span className="weather-widget-forecast-label">
                  {format(parseISO(day.date), 'EEE')}
                </span>
                <span className="weather-widget-forecast-icon">{weatherIcon(day.condition)}</span>
                <span className="weather-widget-forecast-high">{Math.round(day.tempHigh)}°</span>
                <span className="weather-widget-forecast-low">{Math.round(day.tempLow)}°</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
