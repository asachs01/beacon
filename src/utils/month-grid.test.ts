import { describe, it, expect } from 'vitest';
import { addDays } from 'date-fns';
import { localDayKey } from '../api/date-keys';
import type { CalendarEvent } from '../types';
import {
  MONTH_GRID_DAYS,
  bucketEventsByLocalDay,
  buildMonthGrid,
  eventOccupiedDayKeys,
  isInDisplayedMonth,
} from './month-grid';

function keysOf(anchor: Date, weekStartsOn: 0 | 1): string[] {
  return buildMonthGrid(anchor, weekStartsOn).days.map((day) => localDayKey(day));
}

function expectConsecutive(keys: string[]) {
  expect(keys).toHaveLength(MONTH_GRID_DAYS);
  expect(new Set(keys).size).toBe(MONTH_GRID_DAYS);
  for (let index = 1; index < keys.length; index++) {
    const previous = keys[index - 1];
    const [year, month, day] = previous.split('-').map(Number);
    const next = localDayKey(addDays(new Date(year, month - 1, day), 1));
    expect(keys[index]).toBe(next);
  }
}

function event(partial: Pick<CalendarEvent, 'id' | 'title' | 'start' | 'end'> & Partial<CalendarEvent>): CalendarEvent {
  return {
    allDay: false,
    calendarId: 'cal-a',
    calendarName: 'Alex',
    color: '#10b981',
    ...partial,
  };
}

describe('buildMonthGrid', () => {
  it('is always 6 rows by 7 columns', () => {
    const grid = buildMonthGrid(new Date(2026, 9, 15), 0);
    expect(grid.days).toHaveLength(42);
    expect(MONTH_GRID_DAYS).toBe(42);
  });

  it('includes leading and trailing days around a month boundary', () => {
    const sunday = buildMonthGrid(new Date(2026, 9, 15), 0);
    expect(localDayKey(sunday.monthStart)).toBe('2026-10-01');
    expect(localDayKey(sunday.days[0])).toBe('2026-09-27');
    expect(localDayKey(sunday.days[41])).toBe('2026-11-07');
    expect(isInDisplayedMonth(sunday.days[0], sunday.monthStart)).toBe(false);
    expect(isInDisplayedMonth(sunday.days[4], sunday.monthStart)).toBe(true);
    expect(isInDisplayedMonth(sunday.days[41], sunday.monthStart)).toBe(false);

    const monday = buildMonthGrid(new Date(2026, 9, 15), 1);
    expect(localDayKey(monday.days[0])).toBe('2026-09-28');
    expect(localDayKey(monday.days[41])).toBe('2026-11-08');
    expect(monday.days[0].getDay()).toBe(1);
  });

  it('crosses the year boundary when January does not start on the week start', () => {
    expect(keysOf(new Date(2026, 0, 10), 0)[0]).toBe('2025-12-28');
    expect(keysOf(new Date(2026, 0, 10), 1)[0]).toBe('2025-12-29');
    expect(keysOf(new Date(2026, 0, 10), 0).at(-1)).toBe('2026-02-07');
  });

  it('respects week start when the month itself starts on Sunday', () => {
    expect(keysOf(new Date(2026, 2, 8), 0)[0]).toBe('2026-03-01');
    expect(keysOf(new Date(2026, 2, 8), 1)[0]).toBe('2026-02-23');
    expect(keysOf(new Date(2026, 2, 8), 0).at(-1)).toBe('2026-04-11');
  });

  it('includes leap day in February 2024 and omits it in a common February', () => {
    const leap = keysOf(new Date(2024, 1, 10), 0);
    expect(leap).toContain('2024-02-29');
    expect(leap[0]).toBe('2024-01-28');
    expect(leap.at(-1)).toBe('2024-03-09');

    const common = keysOf(new Date(2026, 1, 10), 0);
    expect(common).not.toContain('2026-02-29');
    expect(common).toContain('2026-02-28');
    expect(common).toContain('2026-03-01');
  });

  it('keeps consecutive local dates across US DST spring-forward and fall-back', () => {
    const previousTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const march = buildMonthGrid(new Date(2026, 2, 15), 0);
      const marchKeys = march.days.map((day) => localDayKey(day));
      expectConsecutive(marchKeys);
      expect(marchKeys).toContain('2026-03-08');
      const spring = march.days.find((day) => localDayKey(day) === '2026-03-08')!;
      const springNext = march.days.find((day) => localDayKey(day) === '2026-03-09')!;
      expect(springNext.getTime() - spring.getTime()).toBe(23 * 60 * 60 * 1000);

      const november = buildMonthGrid(new Date(2026, 10, 15), 0);
      const novemberKeys = november.days.map((day) => localDayKey(day));
      expectConsecutive(novemberKeys);
      expect(novemberKeys.filter((key) => key === '2026-11-01')).toEqual(['2026-11-01']);
      const fall = november.days.find((day) => localDayKey(day) === '2026-11-01')!;
      const fallNext = november.days.find((day) => localDayKey(day) === '2026-11-02')!;
      expect(fallNext.getTime() - fall.getTime()).toBe(25 * 60 * 60 * 1000);
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });
});

describe('eventOccupiedDayKeys / bucketEventsByLocalDay', () => {
  const october = buildMonthGrid(new Date(2026, 9, 1), 0);

  it('places an all-day event on every day it spans, treating the end date as exclusive', () => {
    const trip = event({
      id: 'trip',
      title: 'Trip',
      start: '2026-10-13',
      end: '2026-10-16',
      allDay: true,
    });
    expect(eventOccupiedDayKeys(trip)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);

    const buckets = bucketEventsByLocalDay([trip], october.days);
    expect(buckets.get('2026-10-12')).toEqual([]);
    expect(buckets.get('2026-10-13')?.map((item) => item.id)).toEqual(['trip']);
    expect(buckets.get('2026-10-15')?.map((item) => item.id)).toEqual(['trip']);
    expect(buckets.get('2026-10-16')).toEqual([]);
  });

  it('keeps a single-day all-day event on its start day', () => {
    const picnic = event({
      id: 'picnic',
      title: 'Picnic',
      start: '2026-10-15',
      end: '2026-10-16',
      allDay: true,
    });
    expect(eventOccupiedDayKeys(picnic)).toEqual(['2026-10-15']);
  });

  it('shows a timed event that crosses midnight on both local days', () => {
    const late = event({
      id: 'late',
      title: 'Late show',
      start: '2026-10-02T22:00:00',
      end: '2026-10-03T01:00:00',
    });
    expect(eventOccupiedDayKeys(late)).toEqual(['2026-10-02', '2026-10-03']);
  });

  it('does not include the next day when a timed event ends at local midnight', () => {
    const movie = event({
      id: 'movie',
      title: 'Movie',
      start: '2026-10-02T20:00:00',
      end: '2026-10-03T00:00:00',
    });
    expect(eventOccupiedDayKeys(movie)).toEqual(['2026-10-02']);
  });

  it('sorts all-day events ahead of timed ones on a shared day', () => {
    const buckets = bucketEventsByLocalDay([
      event({ id: 'late', title: 'Late', start: '2026-10-15T21:00:00', end: '2026-10-15T22:00:00' }),
      event({ id: 'fair', title: 'Fair', start: '2026-10-15', end: '2026-10-16', allDay: true }),
      event({ id: 'morning', title: 'Morning', start: '2026-10-15T09:00:00', end: '2026-10-15T10:00:00' }),
    ], october.days);
    expect(buckets.get('2026-10-15')?.map((item) => item.id)).toEqual(['fair', 'morning', 'late']);
  });

  it('puts a leap-day all-day event on February 29', () => {
    const leap = buildMonthGrid(new Date(2024, 1, 1), 0);
    const born = event({
      id: 'born',
      title: 'Birthday',
      start: '2024-02-28',
      end: '2024-03-01',
      allDay: true,
    });
    const buckets = bucketEventsByLocalDay([born], leap.days);
    expect(buckets.get('2024-02-28')?.map((item) => item.id)).toEqual(['born']);
    expect(buckets.get('2024-02-29')?.map((item) => item.id)).toEqual(['born']);
    expect(buckets.get('2024-03-01')).toEqual([]);
  });

  it('buckets a multi-day timed event across the America/New_York spring-forward', () => {
    const previousTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const march = buildMonthGrid(new Date(2026, 2, 1), 0);
      const flight = event({
        id: 'flight',
        title: 'Redeye',
        start: '2026-03-08T03:30:00.000Z', // Mar 7, 10:30pm EST
        end: '2026-03-08T15:00:00.000Z', // Mar 8, 11:00am EDT
      });
      expect(eventOccupiedDayKeys(flight)).toEqual(['2026-03-07', '2026-03-08']);
      const buckets = bucketEventsByLocalDay([flight], march.days);
      expect(buckets.get('2026-03-07')?.map((item) => item.id)).toEqual(['flight']);
      expect(buckets.get('2026-03-08')?.map((item) => item.id)).toEqual(['flight']);
      expect(buckets.get('2026-03-09')).toEqual([]);
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });
});
