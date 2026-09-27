import { format } from 'date-fns';
import { DashboardCardProps } from '../../types/dashboard-cards';
import { weatherIcon, conditionLabel } from '../../types/weather-icons';
import { useClock, byMinute, bySecond } from '../../hooks/useClock';
import { formatClockTime } from '../../utils/time-format';

export function ClockWeatherCard({ context }: DashboardCardProps) {
  const { showSeconds } = context;
  // Its own clock, so only this card re-renders when the minute (or, with
  // Settings' Show Seconds, the second) changes.
  const now = useClock(showSeconds ? bySecond : byMinute);
  const {
    timeFormat,
    weather,
    onWeatherClick,
    selectedDate,
    isViewingToday,
    goToPreviousDay,
    goToNextDay,
    goToToday,
  } = context;
  const timeString = formatClockTime(now, timeFormat, showSeconds);
  const dateString = format(now, 'EEEE, MMMM d');

  return (
    <header className="dash-topbar">
      <div className="dash-topbar-left">
        <span className="dash-topbar-time">{timeString}</span>
        <div className="dash-topbar-date-nav">
          <button
            type="button"
            className="dash-day-nav-btn"
            onClick={goToPreviousDay}
            aria-label="Previous day"
          >
            ‹
          </button>
          <span className="dash-topbar-date">
            {isViewingToday ? dateString : format(selectedDate, 'EEEE, MMMM d')}
          </span>
          <button
            type="button"
            className="dash-day-nav-btn"
            onClick={goToNextDay}
            aria-label="Next day"
          >
            ›
          </button>
          {!isViewingToday && (
            <button type="button" className="dash-day-nav-today" onClick={goToToday}>
              Today
            </button>
          )}
        </div>
      </div>
      {weather && (
        <div
          className={`dash-topbar-weather ${onWeatherClick ? 'dash-topbar-weather--clickable' : ''}`}
          onClick={onWeatherClick}
          role={onWeatherClick ? 'button' : undefined}
          tabIndex={onWeatherClick ? 0 : undefined}
          onKeyDown={onWeatherClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onWeatherClick(); } : undefined}
        >
          <span className="dash-topbar-weather-icon">{weatherIcon(weather.condition)}</span>
          <span className="dash-topbar-weather-temp">{Math.round(weather.temperature)}°</span>
          <span className="dash-topbar-weather-cond">{conditionLabel(weather.condition)}</span>
        </div>
      )}
    </header>
  );
}
