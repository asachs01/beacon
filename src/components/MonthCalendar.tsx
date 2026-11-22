import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { addMonths, format, isSameDay, parseISO, startOfMonth } from 'date-fns';
import type { Locale } from 'date-fns/locale';
import { CalendarEvent, getFullColor, getPastelColor, type CalendarLayout } from '../types';
import { localDayKey } from '../api/date-keys';
import {
  MONTH_VISIBLE_CHIPS,
  bucketEventsByLocalDay,
  buildMonthGrid,
  isInDisplayedMonth,
} from '../utils/month-grid';
import { useTranslation } from '../i18n';
import { CalendarViewSwitcher } from './CalendarViewSwitcher';

interface MonthCalendarProps {
  events: CalendarEvent[];
  hiddenCalendars: Set<string>;
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: string, hour: number) => void;
  onVisibleMonthChange?: (gridStart: Date) => void;
  weekStartsOn: 0 | 1;
  calendarLayout?: CalendarLayout;
  onCalendarLayoutChange?: (layout: CalendarLayout) => void;
  /** From the shared event cache. Omitted in tests that don't care about loading. */
  isDayLoaded?: (day: Date) => boolean;
}

export function MonthCalendar({
  events,
  hiddenCalendars,
  onEventClick,
  onSlotClick,
  onVisibleMonthChange,
  weekStartsOn,
  calendarLayout = 'month',
  onCalendarLayoutChange,
  isDayLoaded,
}: MonthCalendarProps) {
  const { t, dateLocale } = useTranslation();
  const [monthOffset, setMonthOffset] = useState(0);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);

  const todayKey = localDayKey(new Date());
  const grid = useMemo(() => {
    const anchor = addMonths(startOfMonth(new Date()), monthOffset);
    return buildMonthGrid(anchor, weekStartsOn);
  }, [monthOffset, weekStartsOn, todayKey]);

  const gridStartMs = grid.days[0]?.getTime();
  useLayoutEffect(() => {
    if (grid.days[0]) onVisibleMonthChange?.(grid.days[0]);
    // gridStartMs changes exactly when the first cell changes, including week-start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStartMs, onVisibleMonthChange]);

  useEffect(() => {
    setOpenDayKey(null);
  }, [monthOffset, weekStartsOn]);

  const visibleEvents = useMemo(
    () => events.filter((event) => !hiddenCalendars.has(event.calendarId)),
    [events, hiddenCalendars],
  );

  const buckets = useMemo(
    () => bucketEventsByLocalDay(visibleEvents, grid.days),
    [visibleEvents, grid.days],
  );

  const weekdayLabels = grid.days.slice(0, 7).map((day) => format(day, 'EEE', { locale: dateLocale }));
  const monthLabel = format(grid.monthStart, 'MMMM yyyy', { locale: dateLocale });
  const isCurrentMonth = monthOffset === 0;
  const gridLoading = grid.days.some((day) => isDayLoaded && !isDayLoaded(day));
  const today = new Date();

  const openDay = openDayKey ? grid.days.find((day) => localDayKey(day) === openDayKey) ?? null : null;
  const openEvents = openDayKey ? buckets.get(openDayKey) ?? [] : [];
  const openDayLoaded = !openDay || !isDayLoaded || isDayLoaded(openDay);

  return (
    <div className="month-calendar">
      <div className="week-nav">
        <div className="week-nav-controls">
          <button
            type="button"
            className="week-nav-btn"
            onClick={() => setMonthOffset((offset) => offset - 1)}
            aria-label={t('calendar.previousMonth')}
          >
            &lsaquo;
          </button>
          <button
            type="button"
            className={`week-nav-today ${isCurrentMonth ? 'week-nav-today--active' : ''}`}
            onClick={() => setMonthOffset(0)}
            disabled={isCurrentMonth}
            aria-label={t('calendar.jumpToCurrentMonth')}
          >
            {t('common.today')}
          </button>
          <button
            type="button"
            className="week-nav-btn"
            onClick={() => setMonthOffset((offset) => offset + 1)}
            aria-label={t('calendar.nextMonth')}
          >
            &rsaquo;
          </button>
        </div>
        <div className="week-nav-label">{monthLabel}</div>
        <div className="week-nav-trailing">
          {onCalendarLayoutChange && (
            <CalendarViewSwitcher value={calendarLayout} onChange={onCalendarLayoutChange} />
          )}
        </div>
      </div>

      {gridLoading && (
        <div className="month-loading" role="status">
          {t('dashboard.eventsLoading')}
        </div>
      )}

      <div
        className="month-grid"
        role="grid"
        aria-label={monthLabel}
        aria-busy={gridLoading || undefined}
      >
        <div className="month-weekdays" role="row">
          {weekdayLabels.map((label) => (
            <div key={label} className="month-weekday" role="columnheader">
              {label}
            </div>
          ))}
        </div>

        {Array.from({ length: 6 }, (_, weekIndex) => {
          const weekDays = grid.days.slice(weekIndex * 7, weekIndex * 7 + 7);
          return (
            <div key={localDayKey(weekDays[0])} className="month-week" role="row">
              {weekDays.map((day) => {
                const key = localDayKey(day);
                const inMonth = isInDisplayedMonth(day, grid.monthStart);
                const isToday = isSameDay(day, today);
                const loaded = !isDayLoaded || isDayLoaded(day);
                const dayEvents = buckets.get(key) ?? [];
                const visibleChips = dayEvents.slice(0, MONTH_VISIBLE_CHIPS);
                const extra = dayEvents.length - visibleChips.length;
                const longDate = format(day, 'EEEE, MMMM d', { locale: dateLocale });

                return (
                  <div
                    key={key}
                    className={[
                      'month-day',
                      inMonth ? '' : 'month-day--outside',
                      isToday ? 'month-day--today' : '',
                    ].filter(Boolean).join(' ')}
                    role="gridcell"
                    aria-current={isToday ? 'date' : undefined}
                    aria-busy={!loaded || undefined}
                    onClick={() => {
                      if (loaded && dayEvents.length === 0) onSlotClick(key, 9);
                      else setOpenDayKey(key);
                    }}
                  >
                    <button
                      type="button"
                      className="month-day-number"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenDayKey(key);
                      }}
                      aria-label={t('calendar.showDay', { date: longDate })}
                    >
                      {format(day, 'd')}
                    </button>
                    <div className="month-day-events">
                      {loaded && visibleChips.map((event) => (
                        <EventChip
                          key={event.id}
                          event={event}
                          onClick={() => onEventClick(event)}
                        />
                      ))}
                    </div>
                    {loaded && extra > 0 && (
                      <button
                        type="button"
                        className="month-more"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenDayKey(key);
                        }}
                      >
                        {t('calendar.moreEvents', { count: extra })}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {openDay && openDayKey && createPortal(
        <DayPopover
          day={openDay}
          events={openEvents}
          loaded={openDayLoaded}
          onClose={() => setOpenDayKey(null)}
          onEventClick={(event) => {
            setOpenDayKey(null);
            onEventClick(event);
          }}
          onAdd={() => {
            setOpenDayKey(null);
            onSlotClick(openDayKey, 9);
          }}
        />,
        document.body,
      )}
    </div>
  );
}

function EventChip({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const { t, dateLocale } = useTranslation();
  const pastel = getPastelColor(event.color);
  const full = getFullColor(event.color);
  const timeLabel = eventTimeLabel(event, t('common.allDay'), dateLocale);

  return (
    <button
      type="button"
      className="month-event-chip"
      style={{ backgroundColor: pastel }}
      onClick={(click) => {
        click.stopPropagation();
        onClick();
      }}
      title={`${event.title} (${timeLabel})`}
    >
      <span className="month-event-chip-stripe" style={{ backgroundColor: full }} />
      <span className="month-event-chip-title">{event.title}</span>
    </button>
  );
}

function DayPopover({
  day,
  events,
  loaded,
  onClose,
  onEventClick,
  onAdd,
}: {
  day: Date;
  events: CalendarEvent[];
  loaded: boolean;
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
  onAdd: () => void;
}) {
  const { t, dateLocale } = useTranslation();
  const longDate = format(day, 'EEEE, MMMM d', { locale: dateLocale });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="month-day-popover-backdrop" onClick={onClose}>
      <div
        className="month-day-popover"
        role="dialog"
        aria-modal="true"
        aria-label={t('calendar.dayEvents', { date: longDate })}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="month-day-popover-header">
          <h2>{longDate}</h2>
          <button type="button" className="month-day-popover-close" onClick={onClose} autoFocus>
            {t('common.close')}
          </button>
        </header>
        <ul className="month-day-popover-list">
          {!loaded && (
            <li className="month-day-popover-empty" role="status">{t('dashboard.eventsLoading')}</li>
          )}
          {loaded && events.length === 0 && (
            <li className="month-day-popover-empty">{t('calendarSidebar.nothingScheduled')}</li>
          )}
          {loaded && events.map((event) => {
            const pastel = getPastelColor(event.color);
            const full = getFullColor(event.color);
            return (
              <li key={event.id}>
                <button
                  type="button"
                  className="month-popover-event"
                  style={{ backgroundColor: pastel }}
                  onClick={() => onEventClick(event)}
                >
                  <span className="month-event-chip-stripe" style={{ backgroundColor: full }} />
                  <span className="month-popover-event-text">
                    <span className="month-popover-event-title">{event.title}</span>
                    <span className="month-popover-event-time">
                      {eventTimeLabel(event, t('common.allDay'), dateLocale)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="month-day-popover-add" onClick={onAdd}>
          {t('calendar.addEventOn', { date: longDate })}
        </button>
      </div>
    </div>
  );
}

function eventTimeLabel(event: CalendarEvent, allDayLabel: string, dateLocale: Locale): string {
  if (event.allDay) return allDayLabel;
  try {
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    if (Number.isNaN(start.getTime())) return allDayLabel;
    const startText = format(start, 'h:mm a', { locale: dateLocale });
    if (Number.isNaN(end.getTime())) return startText;
    return `${startText} – ${format(end, 'h:mm a', { locale: dateLocale })}`;
  } catch {
    return allDayLabel;
  }
}
