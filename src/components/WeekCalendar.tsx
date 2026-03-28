import { useMemo, useRef, useEffect } from 'react';
import {
  startOfWeek,
  addDays,
  format,
  isSameDay,
  parseISO,

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
}

const START_HOUR = 7;
const END_HOUR = 21; // 9 PM
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h} ${ampm}`;
}

export function WeekCalendar({ events, hiddenCalendars, onEventClick, onSlotClick }: WeekCalendarProps) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.toISOString()]);

  const visibleEvents = useMemo(() => {
    return events.filter(e => !hiddenCalendars.has(e.calendarId));
  }, [events, hiddenCalendars]);

  // Separate all-day and timed events per day
  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDay = new Map<string, CalendarEvent[]>();
    const timed = new Map<string, CalendarEvent[]>();

    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      allDay.set(key, []);
      timed.set(key, []);
    }

    for (const event of visibleEvents) {
      const eventStart = parseISO(event.start);
      const eventEnd = parseISO(event.end);

      for (const day of days) {
        const dayKey = format(day, 'yyyy-MM-dd');
        const dayEnd = addDays(day, 1);

        if (event.allDay) {
          if (eventStart < dayEnd && eventEnd > day) {
            allDay.get(dayKey)?.push(event);
          }
        } else {
          // Check if event overlaps with this day
          if (eventStart < dayEnd && eventEnd > day) {
            timed.get(dayKey)?.push(event);
          }
        }
      }
    }

    return { allDayByDay: allDay, timedByDay: timed };
  }, [days, visibleEvents]);

  const hasAnyAllDay = useMemo(() => {
    for (const evts of allDayByDay.values()) {
      if (evts.length > 0) return true;
    }
    return false;
  }, [allDayByDay]);

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

      {/* All-day events row */}
      {hasAnyAllDay && (
        <div className="week-allday-row">
          <div className="week-allday-label">All day</div>
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayAllDay = allDayByDay.get(key) || [];
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
                {/* Hour cells (for grid lines and click targets) */}
                {HOURS.map((hour) => (
                  <div key={`cell-${hour}`} className="week-hour-cell">
                    <button
                      className="week-hour-cell-btn"
                      type="button"
                      onClick={() => onSlotClick(key, hour)}
                      aria-label={`Add event on ${format(day, 'EEEE')} at ${formatHour(hour)}`}
                    />
                  </div>
                ))}

                {/* Events positioned absolutely */}
                {dayEvents.map((event) => (
                  <EventBlock
                    key={`${event.id}-${key}`}
                    event={event}
                    onClick={onEventClick}
                    style={getEventStyle(event)}
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
