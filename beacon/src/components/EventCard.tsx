import { format, parseISO } from 'date-fns';
import { CalendarEvent, getPastelColor, getFullColor } from '../types';

interface EventCardProps {
  event: CalendarEvent;
  onClick?: (event: CalendarEvent) => void;
}

export function EventCard({ event, onClick }: EventCardProps) {
  const pastel = getPastelColor(event.color);
  const full = getFullColor(event.color);
  const isPast = parseISO(event.end).getTime() < Date.now();

  const timeLabel = event.allDay
    ? 'All day'
    : `${format(parseISO(event.start), 'h:mm a')} - ${format(parseISO(event.end), 'h:mm a')}`;

  return (
    <div
      className={`event-card ${onClick ? 'event-card--clickable' : ''} ${isPast ? 'event-card--past' : ''}`}
      style={{
        backgroundColor: pastel,
        borderLeft: `4px solid ${full}`,
      }}
      onClick={onClick ? () => onClick(event) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(event); } } : undefined}
    >
      <span className="event-card-calendar">{event.calendarName}</span>
      <span className="event-card-title">{event.title}</span>
      {event.location && <span className="event-card-location">{event.location}</span>}
      <span className="event-card-time">{timeLabel}</span>
    </div>
  );
}
