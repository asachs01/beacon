/**
 * Calendar dates in a named IANA zone.
 *
 * Beacon has no separate timezone setting. The household zone is the
 * display's zone (the same one "today" uses). Day math stays on the
 * calendar key so an evening in America/Phoenix is not already "tomorrow"
 * just because UTC has rolled over.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface ZonedDay {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

export function householdTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function zonedDay(date: Date, timeZone: string): ZonedDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    weekday: WEEKDAY_INDEX[read('weekday')] ?? 0,
  };
}

export function calendarKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function zonedDayKey(date: Date, timeZone: string): string {
  const day = zonedDay(date, timeZone);
  return calendarKey(day.year, day.month, day.day);
}

export function addCalendarDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function weekdayOfKey(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isCalendarKey(key: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** Soonest occurrence of `weekday` on or after `today`. `strictlyAfter` skips today. */
export function weekdayOnOrAfter(today: string, weekday: number, strictlyAfter: boolean): string {
  const current = weekdayOfKey(today);
  let delta = (weekday - current + 7) % 7;
  if (strictlyAfter && delta === 0) delta = 7;
  return addCalendarDays(today, delta);
}

/**
 * Month/day without a year lands on today or the next future date.
 * An explicit year is kept even when it is in the past.
 */
export function resolveMonthDay(month: number, day: number, year: number | null, today: string): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  if (year != null) {
    if (day > daysInMonth(year, month)) return null;
    return calendarKey(year, month, day);
  }
  const todayYear = Number(today.slice(0, 4));
  for (const candidate of [todayYear, todayYear + 1]) {
    if (day > daysInMonth(candidate, month)) continue;
    const key = calendarKey(candidate, month, day);
    if (key >= today) return key;
  }
  return null;
}

export function addMinutesToClock(date: string, time: string, minutes: number): { date: string; time: string } {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  const dayDelta = Math.floor(total / (24 * 60));
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return {
    date: addCalendarDays(date, dayDelta),
    time: `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`,
  };
}

/** True when the locale writes a numeric date as month/day. en-US is month-first; de-DE is day-first. */
export function monthFirstLocale(locale: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    }).formatToParts(new Date(Date.UTC(2026, 11, 5, 12)));
    const numeric = parts.filter((part) => part.type === 'month' || part.type === 'day');
    return numeric[0]?.type !== 'day';
  } catch {
    return true;
  }
}
