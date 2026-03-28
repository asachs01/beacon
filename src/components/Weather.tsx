import { format, parseISO } from 'date-fns';
import { WeatherData } from '../types';

const WEATHER_ICONS: Record<string, string> = {
  'clear-night': '🌙',
  'cloudy': '☁️',
  'fog': '🌫️',
  'hail': '🌨️',
  'lightning': '⚡',
  'lightning-rainy': '⛈️',
  'partlycloudy': '⛅',
  'pouring': '🌧️',
  'rainy': '🌦️',
  'snowy': '❄️',
  'snowy-rainy': '🌨️',
  'sunny': '☀️',
  'windy': '💨',
  'windy-variant': '💨',
  'exceptional': '⚠️',
};

function weatherIcon(condition: string): string {
  return WEATHER_ICONS[condition] || '🌤️';
}

function conditionLabel(condition: string): string {
  return condition
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

interface WeatherProps {
  weather: WeatherData | null;
  error: string | null;
}

export function Weather({ weather, error }: WeatherProps) {
  if (error) {
    return (
      <div className="weather">
        <div className="weather-error">Unable to load weather</div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="weather">
        <div className="weather-loading">Loading weather...</div>
      </div>
    );
  }

  return (
    <div className="weather">
      <div className="weather-current">
        <span className="weather-icon-large">{weatherIcon(weather.condition)}</span>
        <div className="weather-temp">
          {Math.round(weather.temperature)}°
        </div>
        <div className="weather-condition">{conditionLabel(weather.condition)}</div>
        {weather.humidity !== undefined && (
          <div className="weather-detail">Humidity {weather.humidity}%</div>
        )}
      </div>

      {weather.forecast.length > 0 && (
        <div className="weather-forecast">
          {weather.forecast.map((day) => (
            <div key={day.date} className="forecast-day">
              <div className="forecast-label">
                {format(parseISO(day.date), 'EEE')}
              </div>
              <div className="forecast-icon">{weatherIcon(day.condition)}</div>
              <div className="forecast-temps">
                <span className="forecast-high">{Math.round(day.tempHigh)}°</span>
                <span className="forecast-low">{Math.round(day.tempLow)}°</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
