import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO } from 'date-fns';
import { CalendarEvent, getFullColor } from '../types';

interface EventDetailsPopoverProps {
  event: CalendarEvent;
  anchor: DOMRect;
  onClose: () => void;
  onEdit: () => void;
}

const POPOVER_WIDTH = 320;
const POPOVER_MARGIN = 8;
const VIEWPORT_PAD = 16;
const ESTIMATED_HEIGHT = 240;

export function EventDetailsPopover({ event, anchor, onClose, onEdit }: EventDetailsPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>(() => computePosition(anchor, ESTIMATED_HEIGHT));

  // Recompute once we have actual rendered height
  useLayoutEffect(() => {
    if (!ref.current) return;
    const h = ref.current.getBoundingClientRect().height;
    setPos(computePosition(anchor, h));
  }, [anchor]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const accent = getFullColor(event.color);

  const startD = parseISO(event.start);
  const endD = parseISO(event.end);
  const sameDay = format(startD, 'yyyy-MM-dd') === format(endD, 'yyyy-MM-dd');
  const fullTime = event.allDay
    ? sameDay
      ? `${format(startD, 'EEE, MMM d')} · All day`
      : `${format(startD, 'MMM d')} – ${format(endD, 'MMM d')} · All day`
    : sameDay
      ? `${format(startD, 'EEE, MMM d')} · ${format(startD, 'h:mm a')} – ${format(endD, 'h:mm a')}`
      : `${format(startD, 'MMM d, h:mm a')} – ${format(endD, 'MMM d, h:mm a')}`;

  return createPortal(
    <div
      ref={ref}
      className="event-details-popover"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: POPOVER_WIDTH,
      }}
      role="dialog"
      aria-label={`Event details: ${event.title}`}
    >
      <div className="event-details-popover-stripe" style={{ backgroundColor: accent }} />
      <div className="event-details-popover-body">
        <div className="event-details-popover-header">
          <h3 className="event-details-popover-title">{event.title}</h3>
          <button
            type="button"
            className="event-details-popover-close"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
        </div>

        <div className="event-details-popover-meta">
          <div className="event-details-popover-time">{fullTime}</div>
          <div className="event-details-popover-calendar">
            <span
              className="event-details-popover-calendar-dot"
              style={{ backgroundColor: accent }}
            />
            <span>{event.calendarName}</span>
          </div>
          {event.recurrence && event.recurrence !== 'none' && (
            <div className="event-details-popover-recurrence">
              Repeats {event.recurrence}
            </div>
          )}
        </div>

        {event.description && (
          <div className="event-details-popover-description">
            {event.description}
          </div>
        )}

        <div className="event-details-popover-actions">
          <button
            type="button"
            className="event-details-popover-btn event-details-popover-btn--primary"
            onClick={onEdit}
          >
            Open / edit
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function computePosition(anchor: DOMRect, height: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer to the right of the event
  let left = anchor.right + POPOVER_MARGIN;
  if (left + POPOVER_WIDTH + VIEWPORT_PAD > vw) {
    // Try to the left
    const leftSide = anchor.left - POPOVER_WIDTH - POPOVER_MARGIN;
    if (leftSide >= VIEWPORT_PAD) {
      left = leftSide;
    } else {
      // Fall back to clamping inside the viewport
      left = Math.max(VIEWPORT_PAD, vw - POPOVER_WIDTH - VIEWPORT_PAD);
    }
  }

  let top = anchor.top;
  if (top + height + VIEWPORT_PAD > vh) {
    top = Math.max(VIEWPORT_PAD, vh - height - VIEWPORT_PAD);
  }
  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;

  return { left, top };
}
