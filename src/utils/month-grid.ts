import { addDays, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { localDayKey } from '../api/date-keys';
import type { CalendarEvent } from '../types';

/** A standard month grid is always 6 weeks, including leading and trailing days. */
export const MONTH_GRID_WEEKS = 6;
export const MONTH_GRID_DAYS = MONTH_GRID_WEEKS * 7;

/** Event chips drawn in a day cell before the "+N more" control. */
export const MONTH_VISIBLE_CHIPS = 3;

const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface MonthGrid {
  /** Local midnight on the first day of the displayed month. */
  monthStart: Date;
  /**
   * 42 local midnights, aligned to `weekStartsOn`.
   * `addDays` steps by calendar date, so a DST spring-forward or fall-back
   * neither skips nor repeats a cell.
   */
  days: Date[];
}

export function buildMonthGrid(anchor: Date, weekStartsOn: 0 | 1): MonthGrid {
  const monthStart = startOfMonth(startOfDay(anchor));
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const days = Array.from({ length: MONTH_GRID_DAYS }, (_, index) => addDays(gridStart, index));
  return { monthStart, days };
}

export function isInDisplayedMonth(day: Date, monthStart: Date): boolean {
  return day.getFullYear() === monthStart.getFullYear() && day.getMonth() === monthStart.getMonth();
}

function dateFromKey(key: string): Date {
  const match = BARE_DATE.exec(key);
  if (!match) return new Date(NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function shiftDayKey(key: string, days: number): string {
  return localDayKey(addDays(dateFromKey(key), days));
}

/**
 * True when `value` falls on local midnight.
 * A bare `YYYY-MM-DD` (how all-day events are stored) counts as midnight
 * without parsing it as a UTC instant.
 */
export function isLocalMidnight(value: string): boolean {
  const trimmed = value.trim();
  if (BARE_DATE.test(trimmed)) return true;
  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) return false;
  return instant.getHours() === 0
    && instant.getMinutes() === 0
    && instant.getSeconds() === 0
    && instant.getMilliseconds() === 0;
}

/**
 * Inclusive local day keys an event occupies.
 *
 * Home Assistant's calendar API stores all-day `end` as exclusive (the day
 * after the last day), and a bare date is local midnight. A timed event
 * includes its end day unless that instant is exactly local midnight, which
 * belongs to the previous day. A zero-length range still occupies the start day.
 */
export function eventOccupiedDayKeys(event: { start: string; end: string; allDay?: boolean }): string[] {
  const startKey = localDayKey(event.start);
  if (!startKey) return [];
  const endKey = localDayKey(event.end);

  let lastInclusive = startKey;
  if (endKey && endKey > startKey) {
    lastInclusive = isLocalMidnight(event.end) ? shiftDayKey(endKey, -1) : endKey;
    if (!lastInclusive || lastInclusive < startKey) lastInclusive = startKey;
  }

  const keys: string[] = [];
  let cursor = startKey;
  for (let guard = 0; guard < 400; guard++) {
    keys.push(cursor);
    if (cursor >= lastInclusive) break;
    const next = shiftDayKey(cursor, 1);
    if (!next || next <= cursor) break;
    cursor = next;
  }
  return keys;
}

/** Bucket events onto the grid's local days. Days outside `days` are dropped. */
export function bucketEventsByLocalDay(
  events: CalendarEvent[],
  days: Date[],
): Map<string, CalendarEvent[]> {
  const buckets = new Map<string, CalendarEvent[]>();
  for (const day of days) {
    const key = localDayKey(day);
    if (key) buckets.set(key, []);
  }

  for (const event of events) {
    for (const key of eventOccupiedDayKeys(event)) {
      buckets.get(key)?.push(event);
    }
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
    });
  }

  return buckets;
}
