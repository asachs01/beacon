import { format } from 'date-fns';
import { DashboardCardProps } from '../../types/dashboard-cards';
import { EventCard } from '../EventCard';

/** Classic layout's "This Week" agenda column. */
export function AgendaWeekCard({ context }: DashboardCardProps) {
  const { weekEvents, onEventClick } = context;

  return (
    <section className="dash-classic-col">
      <h2 className="dashboard-section-title">This Week</h2>
      <div className="dashboard-events-scroll">
        {weekEvents.map(({ day, events: dayEvents }) => (
          <div key={day.toISOString()} className="dash-week-day">
            <div className="dash-week-day-label">{format(day, 'EEE d')}</div>
            {dayEvents.length === 0 ? (
              <div className="dash-week-empty">—</div>
            ) : (
              <div className="dashboard-events-list">
                {dayEvents.map((event) => (
                  <EventCard key={event.id} event={event} onClick={onEventClick} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
