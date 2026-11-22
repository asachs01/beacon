import type { CalendarLayout } from '../types';
import { useTranslation } from '../i18n';

interface CalendarViewSwitcherProps {
  value: CalendarLayout;
  onChange: (layout: CalendarLayout) => void;
}

const LAYOUTS: CalendarLayout[] = ['week', 'month'];

export function CalendarViewSwitcher({ value, onChange }: CalendarViewSwitcherProps) {
  const { t } = useTranslation();

  return (
    <div className="calendar-view-switcher" role="group" aria-label={t('calendar.viewSwitcherLabel')}>
      {LAYOUTS.map((layout) => (
        <button
          key={layout}
          type="button"
          className={`calendar-view-switcher-btn ${value === layout ? 'calendar-view-switcher-btn--active' : ''}`}
          aria-pressed={value === layout}
          onClick={() => onChange(layout)}
        >
          {layout === 'week' ? t('calendar.viewWeek') : t('calendar.viewMonth')}
        </button>
      ))}
    </div>
  );
}
