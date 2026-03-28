import { useMemo } from 'react';
import { format, parseISO, isSameDay } from 'date-fns';
import { CalendarEvent } from '../types';

interface TodayAgendaProps {
  events: CalendarEvent[];
  hiddenCalendars: Set<string>;
  onEventClick: (event: CalendarEvent) => void;
}

export function TodayAgenda({ events, hiddenCalendars, onEventClick }: TodayAgendaProps) {
  const today = new Date();

  const todayEvents = useMemo(() => {
    return events
      .filter(e => !hiddenCalendars.has(e.calendarId))
      .filter(e => {
        const start = parseISO(e.start);
        const end = parseISO(e.end);
        return isSameDay(start, today) || isSameDay(end, today) || (start < today && end > today);
      })
      .sort((a, b) => {
        // All-day events first
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return a.start.localeCompare(b.start);
      });
  }, [events, hiddenCalendars, today.toDateString()]);

  const upcomingEvents = useMemo(() => {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return events
      .filter(e => !hiddenCalendars.has(e.calendarId))
      .filter(e => {
        const start = parseISO(e.start);
        return start > today && !isSameDay(start, today);
      })
      .slice(0, 5);
  }, [events, hiddenCalendars, today.toDateString()]);

  return (
    <div className="today-agenda">
      <div className="agenda-section">
        <h2 className="agenda-title">Today</h2>
        {todayEvents.length === 0 ? (
          <div className="agenda-empty">No events today</div>
        ) : (
          <div className="agenda-list">
            {todayEvents.map((event) => (
              <button
                key={event.id}
                className="agenda-item"
                onClick={() => onEventClick(event)}
                type="button"
              >
                <span
                  className="agenda-dot"
                  style={{ backgroundColor: event.color }}
                />
                <div className="agenda-item-content">
                  <span className="agenda-item-time">
                    {event.allDay
                      ? 'All day'
                      : format(parseISO(event.start), 'h:mm a')}
                  </span>
                  <span className="agenda-item-title">{event.title}</span>
                  <span className="agenda-item-calendar">{event.calendarName}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {upcomingEvents.length > 0 && (
        <div className="agenda-section">
          <h2 className="agenda-title agenda-title--upcoming">Upcoming</h2>
          <div className="agenda-list">
            {upcomingEvents.map((event) => (
              <button
                key={event.id}
                className="agenda-item agenda-item--upcoming"
                onClick={() => onEventClick(event)}
                type="button"
              >
                <span
                  className="agenda-dot"
                  style={{ backgroundColor: event.color }}
                />
                <div className="agenda-item-content">
                  <span className="agenda-item-time">
                    {format(parseISO(event.start), 'EEE, MMM d')}
                    {!event.allDay && ` · ${format(parseISO(event.start), 'h:mm a')}`}
                  </span>
                  <span className="agenda-item-title">{event.title}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
