import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  startOfWeek,
  addDays,
  addWeeks,
  format,
  isSameDay,
  parseISO,
  differenceInCalendarDays,
  getHours,
  getMinutes,
} from 'date-fns';
import { CalendarEvent } from '../types';
import { computeRangeLayout, type OverlapLayout } from '../utils/overlap-layout';
import { EventBlock } from './EventBlock';
import { EventDetailsPopover } from './EventDetailsPopover';
import { useWeatherForecast } from '../hooks/useWeatherForecast';
import { weatherIcon } from '../types/weather-icons';
import { formatHourLabel, type TimeFormat } from '../utils/time-format';

interface WeekCalendarProps {
  events: CalendarEvent[];
  hiddenCalendars: Set<string>;
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: string, hour: number) => void;
  onEventReschedule?: (event: CalendarEvent, newDate: string, newHour: number) => void;
  onVisibleWeekChange?: (weekStart: Date) => void;
  /** First day of the week: 0 = Sunday, 1 = Monday. */
  weekStartsOn?: 0 | 1;
  timeFormat?: TimeFormat;
}

const START_HOUR = 7;
const END_HOUR = 21; // 9 PM
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

/** Height of an event pinned to the top or bottom edge of the hour grid. */
const PINNED_EVENT_PX = 22;

/**
 * The hours of `day` (0–24, wall clock) a timed event takes up. The event
 * must overlap the day; one that started earlier counts from 0, one that
 * runs on past midnight up to 24.
 */
function hoursOnDay(event: CalendarEvent, day: Date): { from: number; to: number } {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  return {
    from: isSameDay(start, day) ? getHours(start) + getMinutes(start) / 60 : 0,
    to: isSameDay(end, day) ? getHours(end) + getMinutes(end) / 60 : 24,
  };
}

/**
 * The least an event takes up in the hour grid, in hours: PINNED_EVENT_PX
 * at the shortest hour rows (52px, on phones).
 */
const MIN_DRAWN_HOURS = PINNED_EVENT_PX / 52;

/**
 * Where a timed event is drawn on `day`, in hours from midnight: its part
 * of the day clipped to the grid's hours, pinned to the grid's edge when
 * wholly outside them, and never shorter than it's drawn. Side-by-side
 * layout uses this; using the event's own times put events that are drawn
 * over each other (an overnight one, two pinned ones) in one column.
 */
function drawnHours(event: CalendarEvent, day: Date): { top: number; bottom: number } {
  const { from, to } = hoursOnDay(event, day);
  if (from >= END_HOUR) return { top: END_HOUR - MIN_DRAWN_HOURS, bottom: END_HOUR };
  const top = Math.max(from, START_HOUR);
  return { top, bottom: Math.max(Math.min(to, END_HOUR), top + MIN_DRAWN_HOURS) };
}

/** Timed events this long or longer show as bars in the all-day row. */
const TIMED_BAR_MIN_MS = 24 * 60 * 60 * 1000;

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

export function WeekCalendar({ events, hiddenCalendars, onEventClick, onSlotClick, onEventReschedule, onVisibleWeekChange, weekStartsOn = 0, timeFormat = '12h' }: WeekCalendarProps) {
  const today = new Date();
  const todayWeekStart = startOfWeek(today, { weekStartsOn });
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const forecast = useWeatherForecast();

  // Week navigation: offset in weeks from today's week (0 = current, +1 = next, -1 = prev)
  const [weekOffset, setWeekOffset] = useState(0);
  // Keyed on today's week (as a number, since `today` is a new Date every
  // render) so a wall display left running past Saturday midnight moves on
  // to the new week at its next re-render instead of staying on the old one.
  const todayWeekStartMs = todayWeekStart.getTime();
  const weekStart = useMemo(
    () => addWeeks(new Date(todayWeekStartMs), weekOffset),
    [todayWeekStartMs, weekOffset],
  );

  // Notify parent so it can refetch events for the visible week if needed
  useEffect(() => {
    onVisibleWeekChange?.(weekStart);
  }, [weekStart, onVisibleWeekChange]);

  // Drag state
  const [dragEvent, setDragEvent] = useState<CalendarEvent | null>(null);
  const [dragGhost, setDragGhost] = useState<{ date: string; hour: number } | null>(null);

  // Inline event-detail expansion
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedAnchor, setExpandedAnchor] = useState<DOMRect | null>(null);

  // Mobile 3-day view: which group of days to show (0-based index into day groups)
  const todayDayIndex = differenceInCalendarDays(today, todayWeekStart);
  const initialGroup = Math.min(Math.floor(todayDayIndex / MOBILE_DAYS), Math.floor(6 / MOBILE_DAYS));
  const [mobileGroupIndex, setMobileGroupIndex] = useState(initialGroup);

  // When jumping to a different week, reset to the first mobile day-group
  useEffect(() => {
    if (weekOffset !== 0) setMobileGroupIndex(0);
  }, [weekOffset]);

  // Swipe state
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const allDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // On mobile show a 3-day slice, on desktop show all 7
  const days = useMemo(() => {
    if (!isMobile) return allDays;
    const start = mobileGroupIndex * MOBILE_DAYS;
    return allDays.slice(start, Math.min(start + MOBILE_DAYS, 7));
  }, [isMobile, allDays, mobileGroupIndex]);

  const dayCount = days.length;
  const maxMobileGroup = Math.ceil(7 / MOBILE_DAYS) - 1;

  // Build date→forecast lookup for quick access in header
  const forecastByDate = useMemo(() => {
    const map = new Map<string, { condition: string; high: number; low: number }>();
    for (const f of forecast) {
      map.set(f.date, { condition: f.condition, high: f.tempHigh, low: f.tempLow });
    }
    return map;
  }, [forecast]);

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
      } else if (eventEnd.getTime() - eventStart.getTime() >= TIMED_BAR_MIN_MS) {
        multiDayEvents.push(event);
      } else {
        // Shorter timed events stay in the hour grid, overnight ones too:
        // on each day whose visible hours they reach, or — when they reach
        // none, like a 10pm–1am movie — on the day they start, pinned to
        // the grid's edge.
        for (const day of days) {
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayEnd = addDays(day, 1);
          if (!(eventStart < dayEnd && eventEnd > day)) continue;
          const { from, to } = hoursOnDay(event, day);
          if ((to > START_HOUR && from < END_HOUR) || isSameDay(eventStart, day)) {
            timed.get(dayKey)?.push(event);
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

      // Clamp to the week. Columns count from the week's first day even on
      // mobile, where `days` is only a slice of it — the bars below map
      // them onto the visible slice.
      const weekStartDate = allDays[0];
      const visStart = eventStart < weekStartDate ? weekStartDate : eventStart;
      const weekEndDate = addDays(allDays[6], 1);
      const visEnd = eventEnd > weekEndDate ? weekEndDate : eventEnd;

      const startCol = Math.max(0, differenceInCalendarDays(visStart, weekStartDate));
      const endCol = Math.min(7, differenceInCalendarDays(visEnd, weekStartDate));
      const span = endCol - startCol;

      if (span <= 0) continue;

      // Find first available lane
      let lane = 0;
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
  }, [days, allDays, visibleEvents]);

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
      const currentHour = getHours(new Date());
      const scrollToHour = Math.max(currentHour - 1, START_HOUR);
      const hourHeight = parseFloat(getComputedStyle(scrollRef.current).getPropertyValue('--hour-height')) || 72;
      scrollRef.current.scrollTop = (scrollToHour - START_HOUR) * hourHeight;
    }
  }, []);

  // --- Inline event-detail handlers ---
  const handleEventBlockClick = useCallback(
    (event: CalendarEvent, e?: React.MouseEvent<HTMLElement>) => {
      if (expandedEventId === event.id) {
        setExpandedEventId(null);
        setExpandedAnchor(null);
        return;
      }
      const rect = e?.currentTarget?.getBoundingClientRect();
      setExpandedEventId(event.id);
      setExpandedAnchor(rect ?? null);
    },
    [expandedEventId],
  );

  const closeExpanded = useCallback(() => {
    setExpandedEventId(null);
    setExpandedAnchor(null);
  }, []);

  // When events list changes (e.g. refetch on week change), clear expansion
  useEffect(() => {
    setExpandedEventId(null);
    setExpandedAnchor(null);
  }, [weekOffset]);

  const expandedEvent = useMemo(
    () => (expandedEventId ? events.find((ev) => ev.id === expandedEventId) ?? null : null),
    [expandedEventId, events],
  );

  // Week label for header ("Week of Jun 8" or "Jun 8 – 14, 2026")
  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    const sameMonth = format(weekStart, 'MMM') === format(end, 'MMM');
    if (sameMonth) {
      return `${format(weekStart, 'MMM d')} – ${format(end, 'd, yyyy')}`;
    }
    return `${format(weekStart, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }, [weekStart]);

  const isCurrentWeek = weekOffset === 0;

  // Calculate position and height for a timed event on `day`
  function getEventStyle(event: CalendarEvent, day: Date, layout?: OverlapLayout): React.CSSProperties {
    const { from, to } = hoursOnDay(event, day);

    // Hour rows are var(--hour-height) tall, which the stylesheet shrinks
    // on smaller screens (72px down to 52px), so place events in units of
    // it rather than a fixed pixel height. Events wholly outside the grid's
    // hours are pinned to its top or bottom edge.
    let style: React.CSSProperties;
    if (from >= END_HOUR) {
      style = {
        top: `calc(var(--hour-height) * ${END_HOUR - START_HOUR} - ${PINNED_EVENT_PX}px)`,
        height: `${PINNED_EVENT_PX}px`,
      };
    } else {
      const clampedStart = Math.max(from, START_HOUR);
      const clampedEnd = Math.min(to, END_HOUR);
      style = {
        top: `calc(var(--hour-height) * ${clampedStart - START_HOUR})`,
        height: `max(${PINNED_EVENT_PX}px, calc(var(--hour-height) * ${Math.max(clampedEnd - clampedStart, 0)}))`,
      };
    }

    // Side-by-side columns for overlapping events
    if (layout && layout.width < 1) {
      style.left = `calc(${layout.left * 100}% + 1px)`;
      style.width = `calc(${layout.width * 100}% - 2px)`;
      style.zIndex = layout.level + 2;
    }

    return style;
  }

  // Current time indicator position (in hours below the grid's top) —
  // updates every 30s so the red line moves
  const [currentTimeOffset, setCurrentTimeOffset] = useState<number | null>(() => {
    const now = new Date();
    const h = getHours(now) + getMinutes(now) / 60;
    if (h < START_HOUR || h > END_HOUR) return null;
    return h - START_HOUR;
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = getHours(now) + getMinutes(now) / 60;
      setCurrentTimeOffset(h < START_HOUR || h > END_HOUR ? null : h - START_HOUR);
    };
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
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
      {/* Week navigation header */}
      <div className="week-nav">
        <div className="week-nav-controls">
          <button
            type="button"
            className="week-nav-btn"
            onClick={() => setWeekOffset((o) => o - 1)}
            aria-label="Previous week"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            className={`week-nav-today ${isCurrentWeek ? 'week-nav-today--active' : ''}`}
            onClick={() => setWeekOffset(0)}
            disabled={isCurrentWeek}
            aria-label="Jump to current week"
          >
            Today
          </button>
          <button
            type="button"
            className="week-nav-btn"
            onClick={() => setWeekOffset((o) => o + 1)}
            aria-label="Next week"
          >
            &rsaquo;
          </button>
        </div>
        <div className="week-nav-label">{weekLabel}</div>
        <div className="week-nav-jump">
          <button
            type="button"
            className="week-nav-jump-btn"
            onClick={() => setWeekOffset((o) => o - 4)}
            aria-label="Back 4 weeks"
            title="Back 4 weeks"
          >
            -4w
          </button>
          <button
            type="button"
            className="week-nav-jump-btn"
            onClick={() => setWeekOffset((o) => o + 4)}
            aria-label="Forward 4 weeks"
            title="Forward 4 weeks"
          >
            +4w
          </button>
        </div>
      </div>

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
          const dayKey = format(day, 'yyyy-MM-dd');
          const wx = forecastByDate.get(dayKey);
          return (
            <div
              key={dayKey}
              className={`week-header-day ${isToday ? 'week-header-day--today' : ''}`}
            >
              <span className="week-header-day-name">{format(day, 'EEE')}</span>
              <span className="week-header-day-number">{format(day, 'd')}</span>
              {wx && (
                <span className="week-header-weather">
                  <span className="week-header-weather-icon">{weatherIcon(wx.condition)}</span>
                  <span className="week-header-weather-temps">
                    {Math.round(wx.high)}° / {Math.round(wx.low)}°
                  </span>
                </span>
              )}
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
                        className={`event-block event-block--multiday ${expandedEventId === mds.event.id ? 'event-block--expanded' : ''}`}
                        style={{
                          left: `calc(${(clampedStart / dayCount) * 100}% + 2px)`,
                          width: `calc(${(visibleSpan / dayCount) * 100}% - 4px)`,
                          top: `${mds.lane * 26 + 2}px`,
                        }}
                        onClick={(e) => handleEventBlockClick(mds.event, e)}
                        type="button"
                        title={mds.event.title}
                        data-event-id={mds.event.id}
                      >
                        <EventBlock
                          event={mds.event}
                          onClick={handleEventBlockClick}
                          allDay
                          multiDay
                          expanded={expandedEventId === mds.event.id}
                          timeFormat={timeFormat}
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
                      onClick={handleEventBlockClick}
                      allDay
                      expanded={expandedEventId === event.id}
                      timeFormat={timeFormat}
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
              <span className="week-time-label">{formatHourLabel(hour, timeFormat)}</span>
            </div>
          ))}

          {/* Day columns */}
          {days.map((day, dayIndex) => {
            const key = format(day, 'yyyy-MM-dd');
            const isToday = isSameDay(day, today);
            const dayEvents = timedByDay.get(key) || [];
            const overlapLayout = computeRangeLayout(dayEvents.map((event) => {
              const { top, bottom } = drawnHours(event, day);
              return { id: event.id, top: top * 60, bottom: bottom * 60 };
            }));

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
                        aria-label={`Add event on ${format(day, 'EEEE')} at ${formatHourLabel(hour, timeFormat)}`}
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

                {/* Events positioned absolutely (with overlap column splitting) */}
                {dayEvents.map((event) => (
                  <EventBlock
                    key={`${event.id}-${key}`}
                    event={event}
                    onClick={handleEventBlockClick}
                    style={getEventStyle(event, day, overlapLayout.get(event.id))}
                    draggable
                    expanded={expandedEventId === event.id}
                    timeFormat={timeFormat}
                    onDragStart={(e) => handleDragStart(event, e)}
                    onDragEnd={handleDragEnd}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && currentTimeOffset !== null && (
                  <div
                    className="current-time-line"
                    style={{ top: `calc(var(--hour-height) * ${currentTimeOffset})` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inline event details popover */}
      {expandedEvent && expandedAnchor && (
        <EventDetailsPopover
          event={expandedEvent}
          anchor={expandedAnchor}
          onClose={closeExpanded}
          timeFormat={timeFormat}
          onEdit={() => {
            const ev = expandedEvent;
            closeExpanded();
            onEventClick(ev);
          }}
        />
      )}
    </div>
  );
}
