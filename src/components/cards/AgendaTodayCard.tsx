import { DashboardCardProps } from '../../types/dashboard-cards';
import { EventCard } from '../EventCard';
import { useTranslation } from '../../i18n';

/** Classic layout's "Today" agenda column. */
export function AgendaTodayCard({ context }: DashboardCardProps) {
  const { t } = useTranslation();
  const { todayEvents, onEventClick, isViewingToday } = context;

  return (
    <section className="dash-classic-col">
      <div className="dashboard-events-scroll">
        {todayEvents.length === 0 ? (
          <div className="dashboard-empty">
            {isViewingToday ? t('dashboard.nothingScheduledToday') : t('dashboard.nothingScheduledThisDay')}
          </div>
        ) : (
          <div className="dashboard-events-list">
            {todayEvents.map((event) => (
              <EventCard key={event.id} event={event} onClick={onEventClick} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
