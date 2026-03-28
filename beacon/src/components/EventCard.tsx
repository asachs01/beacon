import { format, parseISO } from 'date-fns';
import { CalendarEvent, getPastelColor, getFullColor } from '../types';

interface EventCardProps {
  event: CalendarEvent;
}

export function EventCard({ event }: EventCardProps) {
  const pastel = getPastelColor(event.color);
  const full = getFullColor(event.color);

  const timeLabel = event.allDay
    ? 'All day'
    : `${format(parseISO(event.start), 'h:mm a')} - ${format(parseISO(event.end), 'h:mm a')}`;

  return (
    <div
      className="event-card"
      style={{
        backgroundColor: pastel,
        borderLeft: `4px solid ${full}`,
      }}
    >
      <span className="event-card-calendar">{event.calendarName}</span>
      <span className="event-card-title">{event.title}</span>
      <span className="event-card-time">{timeLabel}</span>
    </div>
  );
}
