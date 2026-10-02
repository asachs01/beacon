import { format } from 'date-fns';
import { DashboardCardProps } from '../../types/dashboard-cards';
import { weatherIcon, conditionLabel } from '../../types/weather-icons';
import { useTranslation } from '../../i18n';

export function ClockWeatherCard({ context }: DashboardCardProps) {
  const { t, dateLocale } = useTranslation();
  const {
    now,
    timeFormat,
    weather,
    onWeatherClick,
    selectedDate,
    isViewingToday,
    goToPreviousDay,
    goToNextDay,
    goToToday,
  } = context;
  const timeString = format(now, timeFormat === '24h' ? 'HH:mm' : 'h:mm a', { locale: dateLocale });
  const dateString = format(now, 'EEEE, MMMM d', { locale: dateLocale });

  return (
    <header className="dash-topbar">
      <div className="dash-topbar-left">
        <span className="dash-topbar-time">{timeString}</span>
        <div className="dash-topbar-date-nav">
          <button
            type="button"
            className="dash-day-nav-btn"
            onClick={goToPreviousDay}
            aria-label={t('dashboard.previousDay')}
          >
            ‹
          </button>
          <span className="dash-topbar-date">
            {isViewingToday ? dateString : format(selectedDate, 'EEEE, MMMM d', { locale: dateLocale })}
          </span>
          <button
            type="button"
            className="dash-day-nav-btn"
            onClick={goToNextDay}
            aria-label={t('dashboard.nextDay')}
          >
            ›
          </button>
          {!isViewingToday && (
            <button type="button" className="dash-day-nav-today" onClick={goToToday}>
              {t('common.today')}
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
          <span className="dash-topbar-weather-cond">{conditionLabel(weather.condition, t)}</span>
        </div>
      )}
    </header>
  );
}
