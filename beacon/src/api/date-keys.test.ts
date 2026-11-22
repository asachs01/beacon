import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { format, startOfDay } from 'date-fns';
import { localDayKey } from './date-keys';

/**
 * 2026-11-20 18:00 in America/Phoenix (UTC-7, no DST) is 2026-11-21 01:00 UTC.
 * `toISOString().slice(0, 10)` is the next calendar day; the local key is not.
 */
const PHOENIX_EVENING = new Date('2026-11-20T18:00:00-07:00');
const PHOENIX_BEFORE_UTC_ROLLOVER = new Date('2026-11-20T16:59:00-07:00');
/** 23:30 America/New_York (EST, UTC-5) is already the next UTC date. */
const NEW_YORK_LATE = new Date('2026-11-20T23:30:00-05:00');

describe('localDayKey', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Phoenix';
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('uses the local calendar day at 18:00 in America/Phoenix, not the UTC date', () => {
    vi.setSystemTime(PHOENIX_EVENING);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Phoenix');
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-21');
    expect(localDayKey()).toBe('2026-11-20');
    expect(localDayKey(new Date())).toBe('2026-11-20');
  });

  it('uses the local calendar day at 23:30 in America/New_York, not the UTC date', () => {
    process.env.TZ = 'America/New_York';
    vi.setSystemTime(NEW_YORK_LATE);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-21');
    expect(localDayKey()).toBe('2026-11-20');
    expect(localDayKey(new Date())).toBe('2026-11-20');
  });

  it('matches UTC before the local evening crosses midnight UTC', () => {
    vi.setSystemTime(PHOENIX_BEFORE_UTC_ROLLOVER);
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-20');
    expect(localDayKey()).toBe('2026-11-20');
  });

  it('buckets a stored UTC timestamp onto the local day it occurred', () => {
    vi.setSystemTime(PHOENIX_EVENING);
    expect(localDayKey('2026-11-21T01:00:00.000Z')).toBe('2026-11-20');
    expect(localDayKey(Date.parse('2026-11-21T01:00:00.000Z'))).toBe('2026-11-20');
  });

  it('leaves a stored YYYY-MM-DD meal or all-day key unchanged', () => {
    vi.setSystemTime(PHOENIX_EVENING);
    expect(localDayKey('2026-11-20')).toBe('2026-11-20');
    expect(localDayKey('2026-11-21')).toBe('2026-11-21');
  });

  it('returns "" for empty or unparseable values', () => {
    expect(localDayKey('')).toBe('');
    expect(localDayKey('not-a-date')).toBe('');
  });

  it('agrees with the local day used by dashboard today and calendar columns', () => {
    vi.setSystemTime(PHOENIX_EVENING);
    const now = new Date();
    expect(format(startOfDay(now), 'yyyy-MM-dd')).toBe(localDayKey(now));
    expect(format(now, 'yyyy-MM-dd')).toBe('2026-11-20');
  });
});
