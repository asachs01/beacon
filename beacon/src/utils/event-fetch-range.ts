import { addDays, parseISO, startOfDay, startOfWeek } from 'date-fns';

/**
 * How far around a calendar week we ask Home Assistant for events.
 * One day before the week through eight days after the week start
 * (exclusive end) matches the window the week view already used, so
 * multi-day events that bleed across the boundary still render.
 */
export const WEEK_RANGE_LEAD_DAYS = 1;
export const WEEK_RANGE_END_OFFSET_DAYS = 8;

/** Trailing debounce for dashboard/calendar navigation that leaves the cache. */
export const EVENT_FETCH_DEBOUNCE_MS = 300;

/**
 * A cached window stays fresh this long. The dashboard also revalidates the
 * active window on this cadence, so revisiting a week inside the window
 * does not hit the network again.
 */
export const EVENT_RANGE_FRESH_MS = 5 * 60 * 1000;

export interface EventRange {
  /** Inclusive start, epoch ms. */
  startMs: number;
  /** Exclusive end, epoch ms. */
  endMs: number;
}

export interface LoadedEventRange extends EventRange {
  fetchedAt: number;
}

export interface ViewRangeInput {
  activeView: string;
  /** Day the Dashboard is showing. Ignored for the calendar view. */
  dashboardDate: Date;
  /** Week the calendar view is showing. Ignored while the Dashboard is active. */
  visibleWeekStart: Date;
  weekStartsOn: 0 | 1;
}

/** Fetch window for a calendar week, including the bleed padding. */
export function weekEventRange(weekStart: Date): EventRange {
  return {
    startMs: addDays(weekStart, -WEEK_RANGE_LEAD_DAYS).getTime(),
    endMs: addDays(weekStart, WEEK_RANGE_END_OFFSET_DAYS).getTime(),
  };
}

/**
 * The window that must be loaded for the view the user is actually looking at.
 *
 * Dashboard day navigation updates `dashboardDate` and does not move
 * `visibleWeekStart` (that state belongs to the week calendar). Deriving
 * the dashboard window from the week that contains the selected date keeps
 * a day more than a few steps from today inside the fetched range, while
 * days in that same week share one request.
 */
export function rangesForView(input: ViewRangeInput): EventRange[] {
  if (input.activeView === 'dashboard') {
    return [weekEventRange(
      startOfWeek(startOfDay(input.dashboardDate), { weekStartsOn: input.weekStartsOn }),
    )];
  }
  return [weekEventRange(input.visibleWeekStart)];
}

export function isRangeCovered(loaded: EventRange[], needed: EventRange): boolean {
  return loaded.some((range) => range.startMs <= needed.startMs && range.endMs >= needed.endMs);
}

export function isRangeFresh(
  loaded: LoadedEventRange[],
  needed: EventRange,
  nowMs: number,
  freshMs: number = EVENT_RANGE_FRESH_MS,
): boolean {
  return loaded.some(
    (range) => range.fetchedAt >= nowMs - freshMs
      && range.startMs <= needed.startMs
      && range.endMs >= needed.endMs,
  );
}

/** True when `instant`'s calendar day falls inside some loaded window. */
export function isInstantCovered(loaded: EventRange[], instant: Date): boolean {
  const day = startOfDay(instant).getTime();
  return loaded.some((range) => range.startMs <= day && day < range.endMs);
}

export function recordLoadedRange(
  loaded: LoadedEventRange[],
  range: EventRange,
  fetchedAt: number,
): LoadedEventRange[] {
  const next = loaded.filter((existing) => existing.startMs !== range.startMs || existing.endMs !== range.endMs);
  next.push({ startMs: range.startMs, endMs: range.endMs, fetchedAt });
  return next;
}

/**
 * Replace events that overlap `range` with `incoming`, and keep everything
 * outside it. A fetch for a newly selected week must not wipe events the
 * dashboard already has for today.
 */
export function mergeEventsForRange<T extends { id: string; start: string; end: string }>(
  existing: T[],
  incoming: T[],
  range: EventRange,
): T[] {
  const incomingIds = new Set(incoming.map((event) => event.id));
  const kept = existing.filter((event) => !incomingIds.has(event.id) && !eventOverlapsRange(event, range));
  return [...kept, ...incoming].sort((a, b) => a.start.localeCompare(b.start));
}

function eventOverlapsRange(event: { start: string; end: string }, range: EventRange): boolean {
  const start = parseISO(event.start).getTime();
  if (Number.isNaN(start)) return true;
  let end = parseISO(event.end).getTime();
  if (Number.isNaN(end)) end = start;
  return start < range.endMs && end > range.startMs;
}
