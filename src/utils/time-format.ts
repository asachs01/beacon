import { format } from 'date-fns';

/** Settings > General > Time Format. */
export type TimeFormat = '12h' | '24h';

/** A time of day: "3:05 PM" or "15:05", with seconds when asked ("3:05:09 PM"). */
export function formatClockTime(date: Date, timeFormat: TimeFormat = '12h', seconds = false): string {
  const s = seconds ? ':ss' : '';
  return format(date, timeFormat === '24h' ? `HH:mm${s}` : `h:mm${s} a`);
}

/** An hour on a calendar's time axis: "3 PM" or "15:00". */
export function formatHourLabel(hour: number, timeFormat: TimeFormat = '12h'): string {
  if (timeFormat === '24h') return `${String(hour).padStart(2, '0')}:00`;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h} ${ampm}`;
}
