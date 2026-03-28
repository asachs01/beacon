import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  startOfWeek,
  addDays,
  format,
  isSameDay,
  parseISO,
  differenceInCalendarDays,
  getHours,
  getMinutes,
} from 'date-fns';
import { CalendarEvent } from '../types';
import { EventBlock } from './EventBlock';

interface WeekCalendarProps {
  events: CalendarEvent[];
  hiddenCalendars: Set<string>;
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: string, hour: number) => void;
  onEventReschedule?: (event: CalendarEvent, newDate: string, newHour: number) => void;
}

const START_HOUR = 7;
const END_HOUR = 21; // 9 PM
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h} ${ampm}`;
}

/** Describes a multi-day bar segment for the all-day row */
interface MultiDaySpan {
  event: CalendarEvent;
  /** Column index where this bar starts (0-based, relative to week) */
  startCol: number;
  /** How many day columns this bar spans */
  span: number;
  /** Row lane within the all-day area to avoid overlaps */
  lane: number;
}

export function WeekCalendar({ events, hiddenCalendars, onEventClick, onSlotClick, onEventReschedule }: WeekCalendarProps) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [dragEvent, setDragEvent] = useState<CalendarEvent | null>(null);
  const [dragGhost, setDragGhost] = useState<{ date: string; hour: number } | null>(null);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.toISOString()]);

  const visibleEvents = useMemo(() => {
    return events.filter(e => !hiddenCalendars.has(e.calendarId));
  }, [events, hiddenCalendars]);

  // Separate all-day / multi-day and timed events per day
  const { multiDaySpans, singleAllDayByDay, timedByDay, allDayLaneCount } = useMemo(() => {
    const timed = new Map<string, CalendarEvent[]>();
    const singleAllDay = new Map<string, CalendarEvent[]>();

    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      timed.set(key, []);
      singleAllDay.set(key, []);
    }

    const multiDayEvents: CalendarEvent[] = [];

    for (const event of visibleEvents) {
      const eventStart = parseISO(event.start);
      const eventEnd = parseISO(event.end);

      if (event.allDay) {
        // Check if it spans multiple days within the visible week
        const spanDays = differenceInCalendarDays(eventEnd, eventStart);
        if (spanDays > 1) {
          multiDayEvents.push(event);
        } else {
          // Single all-day event
          for (const day of days) {
            const dayKey = format(day, 'yyyy-MM-dd');
            const dayEnd = addDays(day, 1);
            if (eventStart < dayEnd && eventEnd > day) {
              singleAllDay.get(dayKey)?.push(event);
            }
          }
        }
      } else {
        // Check if timed event spans multiple days
        const spanDays = differenceInCalendarDays(eventEnd, eventStart);
        if (spanDays >= 1) {
          multiDayEvents.push(event);
        } else {
          for (const day of days) {
            const dayKey = format(day, 'yyyy-MM-dd');
            const dayEnd = addDays(day, 1);
            if (eventStart < dayEnd && eventEnd > day) {
              timed.get(dayKey)?.push(event);
            }
          }
        }
      }
    }

    // Build multi-day spans with lane assignments
    const spans: MultiDaySpan[] = [];
    // Sort by start date, then by duration (longer first)
    const sorted = [...multiDayEvents].sort((a, b) => {
      const cmp = a.start.localeCompare(b.start);
      if (cmp !== 0) return cmp;
      return differenceInCalendarDays(parseISO(b.end), parseISO(b.start))
        - differenceInCalendarDays(parseISO(a.end), parseISO(a.start));
    });

    // Track which lanes are occupied at each column
    const laneCols: Map<number, Set<number>> = new Map();

    for (const event of sorted) {
      const eventStart = parseISO(event.start);
      const eventEnd = parseISO(event.end);

      // Clamp to visible week
      const visStart = eventStart < days[0] ? days[0] : eventStart;
      const weekEndDate = addDays(days[6], 1);
      const visEnd = eventEnd > weekEndDate ? weekEndDate : eventEnd;

      const startCol = Math.max(0, differenceInCalendarDays(visStart, days[0]));
      const endCol = Math.min(7, differenceInCalendarDays(visEnd, days[0]));
      const span = endCol - startCol;

      if (span <= 0) continue;

      // Find first available lane
      let lane = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let conflict = false;
        for (let c = startCol; c < startCol + span; c++) {
          if (laneCols.get(lane)?.has(c)) {
            conflict = true;
            break;
          }
        }
        if (!conflict) break;
        lane++;
      }

      // Reserve the lane
      if (!laneCols.has(lane)) laneCols.set(lane, new Set());
      for (let c = startCol; c < startCol + span; c++) {
        laneCols.get(lane)!.add(c);
      }

      spans.push({ event, startCol, span, lane });
    }

    const maxLane = spans.length > 0 ? Math.max(...spans.map(s => s.lane)) + 1 : 0;

    return {
      multiDaySpans: spans,
      singleAllDayByDay: singleAllDay,
      timedByDay: timed,
      allDayLaneCount: maxLane,
    };
  }, [days, visibleEvents]);

  const hasAnyAllDay = useMemo(() => {
    if (multiDaySpans.length > 0) return true;
    for (const evts of singleAllDayByDay.values()) {
      if (evts.length > 0) return true;
    }
    return false;
  }, [multiDaySpans, singleAllDayByDay]);

  // Scroll to current hour on mount
  useEffect(() => {
    if (scrollRef.current) {
      const currentHour = getHours(today);
      const scrollToHour = Math.max(currentHour - 1, START_HOUR);
      const hourHeight = 72; // matches --hour-height
      scrollRef.current.scrollTop = (scrollToHour - START_HOUR) * hourHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate position and height for a timed event
  function getEventStyle(event: CalendarEvent): React.CSSProperties {
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    const startHour = getHours(start) + getMinutes(start) / 60;
    const endHour = getHours(end) + getMinutes(end) / 60;

    const clampedStart = Math.max(startHour, START_HOUR);
    const clampedEnd = Math.min(endHour, END_HOUR);

    const topOffset = (clampedStart - START_HOUR) * 72;
    const height = Math.max((clampedEnd - clampedStart) * 72, 22);

    return {
      top: `${topOffset}px`,
      height: `${height}px`,
    };
  }

  // Current time indicator position
  const currentTimeTop = useMemo(() => {
    const now = new Date();
    const h = getHours(now) + getMinutes(now) / 60;
    if (h < START_HOUR || h > END_HOUR) return null;
    return (h - START_HOUR) * 72;
  }, []);

  // --- Drag handlers ---
  const handleDragStart = useCallback((event: CalendarEvent, e: React.DragEvent) => {
    setDragEvent(event);
    e.dataTransfer.effectAllowed = 'move';
    // Set minimal drag image data
    e.dataTransfer.setData('text/plain', event.id);
  }, []);

  const handleDragOver = useCallback((date: string, hour: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragGhost({ date, hour });
  }, []);

  const handleDrop = useCallback((date: string, hour: number, e: React.DragEvent) => {
    e.preventDefault();
    if (dragEvent && onEventReschedule) {
      onEventReschedule(dragEvent, date, hour);
    }
    setDragEvent(null);
    setDragGhost(null);
  }, [dragEvent, onEventReschedule]);

  const handleDragEnd = useCallback(() => {
    setDragEvent(null);
    setDragGhost(null);
  }, []);

  return (
    <div className="week-calendar">
      {/* Column Headers */}
      <div className="week-calendar-header">
        <div className="week-header-spacer" />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={format(day, 'yyyy-MM-dd')}
              className={`week-header-day ${isToday ? 'week-header-day--today' : ''}`}
            >
              <span className="week-header-day-name">{format(day, 'EEE')}</span>
              <span className="week-header-day-number">{format(day, 'd')}</span>
            </div>
          );
        })}
      </div>

      {/* All-day events area (includes multi-day spanning bars) */}
      {hasAnyAllDay && (
        <div className="week-allday-section">
          {/* Multi-day spanning bars (absolutely positioned over day columns) */}
          {multiDaySpans.length > 0 && (
            <div className="week-allday-multiday-wrapper">
              <div className="week-allday-multiday-spacer" />
              <div
                className="week-allday-spans"
                style={{ height: `${allDayLaneCount * 26 + 4}px` }}
              >
                {multiDaySpans.map((mds) => (
                  <button
                    key={`multiday-${mds.event.id}`}
                    className="event-block event-block--multiday"
                    style={{
                      left: `calc(${(mds.startCol / 7) * 100}% + 2px)`,
                      width: `calc(${(mds.span / 7) * 100}% - 4px)`,
                      top: `${mds.lane * 26 + 2}px`,
                    }}
                    onClick={() => onEventClick(mds.event)}
                    type="button"
                    title={mds.event.title}
                  >
                    <EventBlock
                      event={mds.event}
                      onClick={onEventClick}
                      allDay
                      multiDay
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Single all-day events row */}
          <div className="week-allday-row">
            <div className="week-allday-label">All day</div>
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayAllDay = singleAllDayByDay.get(key) || [];
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={key}
                  className={`week-allday-cell ${isToday ? 'week-allday-cell--today' : ''}`}
                >
                  {dayAllDay.map((event) => (
                    <EventBlock
                      key={`${event.id}-${key}`}
                      event={event}
                      onClick={onEventClick}
                      allDay
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Time Grid */}
      <div className="week-grid-scroll" ref={scrollRef}>
        <div className="week-time-grid">
          {/* Time axis labels */}
          {HOURS.map((hour) => (
            <div
              key={`time-${hour}`}
              className="week-time-slot"
              style={{ gridRow: hour - START_HOUR + 1 }}
            >
              <span className="week-time-label">{formatHour(hour)}</span>
            </div>
          ))}

          {/* Day columns */}
          {days.map((day, dayIndex) => {
            const key = format(day, 'yyyy-MM-dd');
            const isToday = isSameDay(day, today);
            const dayEvents = timedByDay.get(key) || [];

            return (
              <div
                key={key}
                className={`week-day-column ${isToday ? 'week-day-column--today' : ''}`}
                style={{
                  gridColumn: dayIndex + 2,
                  gridRow: `1 / ${HOURS.length + 1}`,
                }}
              >
                {/* Hour cells (for grid lines, click targets, and drop targets) */}
                {HOURS.map((hour) => {
                  const isGhostTarget = dragGhost?.date === key && dragGhost?.hour === hour;
                  return (
                    <div key={`cell-${hour}`} className="week-hour-cell">
                      <button
                        className={`week-hour-cell-btn ${isGhostTarget ? 'week-hour-cell-btn--drop-target' : ''}`}
                        type="button"
                        onClick={() => onSlotClick(key, hour)}
                        onDragOver={(e) => handleDragOver(key, hour, e)}
                        onDrop={(e) => handleDrop(key, hour, e)}
                        aria-label={`Add event on ${format(day, 'EEEE')} at ${formatHour(hour)}`}
                      />
                      {/* Ghost preview */}
                      {isGhostTarget && dragEvent && (
                        <div className="drag-ghost-preview">
                          <span className="drag-ghost-title">{dragEvent.title}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Events positioned absolutely */}
                {dayEvents.map((event) => (
                  <EventBlock
                    key={`${event.id}-${key}`}
                    event={event}
                    onClick={onEventClick}
                    style={getEventStyle(event)}
                    draggable
                    onDragStart={(e) => handleDragStart(event, e)}
                    onDragEnd={handleDragEnd}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && currentTimeTop !== null && (
                  <div
                    className="current-time-line"
                    style={{ top: `${currentTimeTop}px` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
