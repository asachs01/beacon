import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNotifications } from './useNotifications';
import type { CalendarEvent } from '../types';

function eventIn(minutesFromNow: number, id = 'e1'): CalendarEvent {
  const start = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    id,
    title: 'Test event',
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    calendarId: 'cal-1',
    calendarName: 'Test Calendar',
    color: '#000000',
  };
}

describe('useNotifications', () => {
  let notificationSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    notificationSpy = vi.fn();
    // @ts-expect-error — minimal Notification stub for this test
    globalThis.Notification = Object.assign(notificationSpy, { permission: 'granted' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('respects a configured notifyBeforeMinutes instead of the old hardcoded 15', () => {
    // Event is 10 minutes out. With the previous hardcoded 15-minute
    // window this would already have notified; with the user's actual
    // 5-minute setting it must not have, yet.
    const event = eventIn(10);
    renderHook(() => useNotifications([event], () => null, true, 5));

    expect(notificationSpy).not.toHaveBeenCalled();
  });

  it('fires once the event falls inside the configured window', () => {
    const event = eventIn(10);
    renderHook(() => useNotifications([event], () => null, true, 15));

    expect(notificationSpy).toHaveBeenCalledTimes(1);
    expect(notificationSpy).toHaveBeenCalledWith(
      'Test event',
      expect.objectContaining({ tag: 'beacon-event-e1' }),
    );
  });

  it('defaults to 15 minutes when no setting is passed, matching prior behavior', () => {
    const event = eventIn(10);
    renderHook(() => useNotifications([event], () => null, true));

    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });
});
