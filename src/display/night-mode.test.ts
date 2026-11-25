import { describe, expect, it } from 'vitest';
import {
  isNightModeActive,
  isWithinNightWindow,
  nightDimOpacity,
  type NightModeSchedule,
} from './night-mode';

function at(hours: number, minutes: number, seconds = 0): Date {
  return new Date(2026, 10, 23, hours, minutes, seconds);
}

const overnight: NightModeSchedule = {
  enabled: true,
  start: '21:00',
  end: '06:30',
  override: 'schedule',
};

describe('night window', () => {
  it('includes an overnight range from the start minute up to but not including the end', () => {
    expect(isWithinNightWindow(at(20, 59), '21:00', '06:30')).toBe(false);
    expect(isWithinNightWindow(at(21, 0), '21:00', '06:30')).toBe(true);
    expect(isWithinNightWindow(at(23, 59), '21:00', '06:30')).toBe(true);
    expect(isWithinNightWindow(at(0, 0), '21:00', '06:30')).toBe(true);
    expect(isWithinNightWindow(at(6, 29, 59), '21:00', '06:30')).toBe(true);
    expect(isWithinNightWindow(at(6, 30), '21:00', '06:30')).toBe(false);
    expect(isWithinNightWindow(at(12, 0), '21:00', '06:30')).toBe(false);
  });

  it('includes a same-day range from the start minute up to but not including the end', () => {
    expect(isWithinNightWindow(at(8, 59), '09:00', '17:00')).toBe(false);
    expect(isWithinNightWindow(at(9, 0), '09:00', '17:00')).toBe(true);
    expect(isWithinNightWindow(at(16, 59), '09:00', '17:00')).toBe(true);
    expect(isWithinNightWindow(at(17, 0), '09:00', '17:00')).toBe(false);
  });

  it('accepts HH:mm:ss and rejects an empty or invalid window', () => {
    expect(isWithinNightWindow(at(21, 0), '21:00:00', '06:30:00')).toBe(true);
    expect(isWithinNightWindow(at(12, 0), '09:00', '09:00')).toBe(false);
    expect(isWithinNightWindow(at(22, 0), 'sunset', '06:30')).toBe(false);
    expect(isWithinNightWindow(at(22, 0), '24:00', '06:30')).toBe(false);
  });
});

describe('night mode schedule', () => {
  it('stays off when the feature is disabled, even inside the window or forced on', () => {
    expect(isNightModeActive({ ...overnight, enabled: false }, at(22, 0))).toBe(false);
    expect(isNightModeActive({ ...overnight, enabled: false, override: 'on' }, at(22, 0))).toBe(false);
  });

  it('follows the clock when the override is schedule', () => {
    expect(isNightModeActive(overnight, at(22, 0))).toBe(true);
    expect(isNightModeActive(overnight, at(12, 0))).toBe(false);
    expect(isNightModeActive({ ...overnight, override: 'schedule' }, at(6, 30))).toBe(false);
    expect(isNightModeActive({ ...overnight, override: 'schedule' }, at(21, 0))).toBe(true);
  });

  it('lets a manual on override ignore the clock', () => {
    expect(isNightModeActive({ ...overnight, override: 'on' }, at(12, 0))).toBe(true);
    expect(isNightModeActive({ ...overnight, override: 'on' }, at(6, 30))).toBe(true);
  });

  it('lets a manual off override ignore the clock', () => {
    expect(isNightModeActive({ ...overnight, override: 'off' }, at(22, 0))).toBe(false);
    expect(isNightModeActive({ ...overnight, override: 'off' }, at(21, 0))).toBe(false);
  });

  it('treats an unknown override as the schedule', () => {
    const schedule = { ...overnight, override: 'later' as NightModeSchedule['override'] };
    expect(isNightModeActive(schedule, at(22, 0))).toBe(true);
    expect(isNightModeActive(schedule, at(12, 0))).toBe(false);
  });
});

describe('night dim opacity', () => {
  it('maps 30% brightness to a 70% black overlay', () => {
    expect(nightDimOpacity(30)).toBeCloseTo(0.7);
    expect(nightDimOpacity(100)).toBe(0);
    expect(nightDimOpacity(0)).toBe(1);
  });
});
