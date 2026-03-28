import { useMemo } from 'react';
import {
  startOfWeek,
  addDays,
  format,
  isSameDay,
  parseISO,
  isWithinInterval,
} from 'date-fns';
import { CalendarEvent } from '../types';

interface WeekViewProps {
  events: CalendarEvent[];
  hiddenCalendars: Set<string>;
  onEventClick: (event: CalendarEvent) => void;
}

export function WeekView({ events, hiddenCalendars, onEventClick }: WeekViewProps) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart.toISOString()]);

  const visibleEvents = useMemo(() => {
    return events.filter(e => !hiddenCalendars.has(e.calendarId));
  }, [events, hiddenCalendars]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      map.set(key, []);
    }

    for (const event of visibleEvents) {
      const eventStart = parseISO(event.start);
      const eventEnd = parseISO(event.end);

      for (const day of days) {
        const dayKey = format(day, 'yyyy-MM-dd');

        if (event.allDay) {
          // All-day events span their range
          const dayEnd = addDays(day, 1);
          if (eventStart < dayEnd && eventEnd > day) {
            map.get(dayKey)?.push(event);
          }
        } else if (
          isSameDay(eventStart, day) ||
          isWithinInterval(day, { start: eventStart, end: eventEnd })
        ) {
          map.get(dayKey)?.push(event);
        }
      }
    }

    return map;
  }, [days, visibleEvents]);

  return (
    <div className="week-view">
      <div className="week-header">
        <h2 className="week-title">This Week</h2>
      </div>
      <div className="week-grid">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const isToday = isSameDay(day, today);
          const dayEvents = eventsByDay.get(key) || [];

          return (
            <div
              key={key}
              className={`week-day ${isToday ? 'week-day--today' : ''}`}
            >
              <div className="week-day-header">
                <span className="week-day-name">{format(day, 'EEE')}</span>
                <span className={`week-day-number ${isToday ? 'week-day-number--today' : ''}`}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="week-day-events">
                {dayEvents.map((event) => (
                  <button
                    key={`${event.id}-${key}`}
                    className="week-event"
                    style={{ '--event-color': event.color } as React.CSSProperties}
                    onClick={() => onEventClick(event)}
                    type="button"
                  >
                    <span className="week-event-time">
                      {event.allDay
                        ? 'All day'
                        : format(parseISO(event.start), 'h:mm a')}
                    </span>
                    <span className="week-event-title">{event.title}</span>
                  </button>
                ))}
                {dayEvents.length === 0 && (
                  <div className="week-day-empty" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
