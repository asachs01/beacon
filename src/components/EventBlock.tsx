import { format, parseISO } from 'date-fns';
import { CalendarEvent } from '../types';
import { getPastelColor, getFullColor } from '../types';

interface EventBlockProps {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
  style?: React.CSSProperties;
  allDay?: boolean;
}

export function EventBlock({ event, onClick, style, allDay }: EventBlockProps) {
  const pastel = getPastelColor(event.color);
  const full = getFullColor(event.color);

  const timeLabel = event.allDay
    ? 'All day'
    : `${format(parseISO(event.start), 'h:mm')} - ${format(parseISO(event.end), 'h:mm a')}`;

  return (
    <button
      className={`event-block ${allDay ? 'event-block--allday' : ''}`}
      style={{
        ...style,
        backgroundColor: pastel,
      }}
      onClick={() => onClick(event)}
      type="button"
      title={`${event.title} (${timeLabel})`}
    >
      <div className="event-block-stripe" style={{ backgroundColor: full }} />
      <div className="event-block-content">
        <span className="event-block-title">{event.title}</span>
        {!allDay && (
          <span className="event-block-time">{timeLabel}</span>
        )}
      </div>
    </button>
  );
}
