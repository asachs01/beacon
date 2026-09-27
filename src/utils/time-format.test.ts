import { describe, it, expect } from 'vitest';
import { formatClockTime, formatHourLabel } from './time-format';

const afternoon = new Date(2026, 8, 27, 15, 5, 9);

describe('time format', () => {
  it('formats a time of day in 12- or 24-hour time', () => {
    expect(formatClockTime(afternoon, '12h')).toBe('3:05 PM');
    expect(formatClockTime(afternoon, '24h')).toBe('15:05');
    expect(formatClockTime(afternoon, '12h', true)).toBe('3:05:09 PM');
    expect(formatClockTime(afternoon, '24h', true)).toBe('15:05:09');
  });

  it("labels the calendar's hours", () => {
    expect(formatHourLabel(7, '12h')).toBe('7 AM');
    expect(formatHourLabel(12, '12h')).toBe('12 PM');
    expect(formatHourLabel(15, '12h')).toBe('3 PM');
    expect(formatHourLabel(7, '24h')).toBe('07:00');
    expect(formatHourLabel(15, '24h')).toBe('15:00');
  });
});
