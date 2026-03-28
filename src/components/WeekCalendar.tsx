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

/** Number of days to show in mobile 3-day view */
const MOBILE_DAYS = 3;
const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

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
  const isMobile = useIsMobile();

  // Drag state
  const [dragEvent, setDragEvent] = useState<CalendarEvent | null>(null);
  const [dragGhost, setDragGhost] = useState<{ date: string; hour: number } | null>(null);

  // Mobile 3-day view: which group of days to show (0-based index into day groups)
  const todayDayIndex = differenceInCalendarDays(today, weekStart);
  const initialGroup = Math.min(Math.floor(todayDayIndex / MOBILE_DAYS), Math.floor(6 / MOBILE_DAYS));
  const [mobileGroupIndex, setMobileGroupIndex] = useState(initialGroup);

  // Swipe state
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const allDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.toISOString()]);

  // On mobile show a 3-day slice, on desktop show all 7
  const days = useMemo(() => {
    if (!isMobile) return allDays;
    const start = mobileGroupIndex * MOBILE_DAYS;
    return allDays.slice(start, Math.min(start + MOBILE_DAYS, 7));
  }, [isMobile, allDays, mobileGroupIndex]);

  const dayCount = days.length;
  const maxMobileGroup = Math.ceil(7 / MOBILE_DAYS) - 1;

  // Swipe handlers for mobile day navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, [isMobile]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile || !touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Only trigger if horizontal swipe is dominant and long enough
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && mobileGroupIndex < maxMobileGroup) {
        setMobileGroupIndex((prev) => prev + 1);
      } else if (dx > 0 && mobileGroupIndex > 0) {
        setMobileGroupIndex((prev) => prev - 1);
      }
    }
  }, [isMobile, mobileGroupIndex, maxMobileGroup]);

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

  // Dynamic grid columns based on how many days are shown
  const gridCols = `var(--time-axis-width) repeat(${dayCount}, 1fr)`;

  return (
    <div
      className="week-calendar"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile day group navigation dots */}
      {isMobile && (
        <div className="week-mobile-nav">
          <button
            type="button"
            className="week-mobile-nav-btn"
            disabled={mobileGroupIndex === 0}
            onClick={() => setMobileGroupIndex((prev) => Math.max(0, prev - 1))}
            aria-label="Previous days"
          >
            &lsaquo;
          </button>
          <div className="week-mobile-dots">
            {Array.from({ length: maxMobileGroup + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`week-mobile-dot ${i === mobileGroupIndex ? 'week-mobile-dot--active' : ''}`}
                onClick={() => setMobileGroupIndex(i)}
                aria-label={`Day group ${i + 1}`}
              />
            ))}
          </div>
          <button
            type="button"
            className="week-mobile-nav-btn"
            disabled={mobileGroupIndex === maxMobileGroup}
            onClick={() => setMobileGroupIndex((prev) => Math.min(maxMobileGroup, prev + 1))}
            aria-label="Next days"
          >
            &rsaquo;
          </button>
        </div>
      )}

      {/* Column Headers */}
      <div className="week-calendar-header" style={{ gridTemplateColumns: gridCols }}>
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
                {multiDaySpans
                  .filter((mds) => {
                    // On mobile, only show spans that overlap the visible day range
                    if (!isMobile) return true;
                    const visStart = mobileGroupIndex * MOBILE_DAYS;
                    const visEnd = Math.min(visStart + MOBILE_DAYS, 7);
                    return mds.startCol < visEnd && mds.startCol + mds.span > visStart;
                  })
                  .map((mds) => {
                    // Adjust columns for mobile view offset
                    const visStart = isMobile ? mobileGroupIndex * MOBILE_DAYS : 0;
                    const visEnd = isMobile ? Math.min(visStart + MOBILE_DAYS, 7) : 7;
                    const clampedStart = Math.max(mds.startCol - visStart, 0);
                    const clampedEnd = Math.min(mds.startCol + mds.span - visStart, visEnd - visStart);
                    const visibleSpan = clampedEnd - clampedStart;
                    if (visibleSpan <= 0) return null;

                    return (
                      <button
                        key={`multiday-${mds.event.id}`}
                        className="event-block event-block--multiday"
                        style={{
                          left: `calc(${(clampedStart / dayCount) * 100}% + 2px)`,
                          width: `calc(${(visibleSpan / dayCount) * 100}% - 4px)`,
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
                    );
                  })}
              </div>
            </div>
          )}

          {/* Single all-day events row */}
          <div className="week-allday-row" style={{ gridTemplateColumns: gridCols }}>
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
        <div className="week-time-grid" style={{ gridTemplateColumns: gridCols }}>
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
