import { format, parseISO } from 'date-fns';
import { CalendarEvent } from '../types';
import { getPastelColor, getFullColor } from '../types';

interface EventBlockProps {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
  style?: React.CSSProperties;
  allDay?: boolean;
  multiDay?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export function EventBlock({ event, onClick, style, allDay, multiDay, draggable, onDragStart, onDragEnd }: EventBlockProps) {
  const pastel = getPastelColor(event.color);
  const full = getFullColor(event.color);

  const timeLabel = event.allDay
    ? 'All day'
    : `${format(parseISO(event.start), 'h:mm')} - ${format(parseISO(event.end), 'h:mm a')}`;

  // For multi-day bars rendered inside the spanning container,
  // we just render content (the outer button is handled by WeekCalendar)
  if (multiDay) {
    return (
      <div
        className="event-block-inner event-block-inner--multiday"
        style={{ backgroundColor: pastel }}
      >
        <div className="event-block-stripe" style={{ backgroundColor: full }} />
        <div className="event-block-content">
          <span className="event-block-title">{event.title}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      className={`event-block ${allDay ? 'event-block--allday' : ''} ${draggable ? 'event-block--draggable' : ''}`}
      style={{
        ...style,
        backgroundColor: pastel,
      }}
      onClick={() => onClick(event)}
      type="button"
      title={`${event.title} (${timeLabel})`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
