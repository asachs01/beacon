import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NightModeSchedule } from './night-mode';
import { useNightScheduleActive } from './use-night-schedule';

const overnight: NightModeSchedule = {
  enabled: true,
  start: '21:00',
  end: '06:30',
  override: 'schedule',
};

describe('useNightScheduleActive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns on at the start minute', () => {
    vi.setSystemTime(new Date(2026, 10, 23, 20, 59, 30));
    const { result } = renderHook(() => useNightScheduleActive(overnight, true));
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current).toBe(true);
  });

  it('turns off at the end minute', () => {
    vi.setSystemTime(new Date(2026, 10, 24, 6, 29, 30));
    const { result } = renderHook(() => useNightScheduleActive(overnight, true));
    expect(result.current).toBe(true);

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current).toBe(false);
  });

  it('re-reads the clock when the page becomes visible', () => {
    vi.setSystemTime(new Date(2026, 10, 23, 12, 0, 0));
    const { result } = renderHook(() => useNightScheduleActive(overnight, true));
    expect(result.current).toBe(false);

    vi.setSystemTime(new Date(2026, 10, 23, 22, 0, 0));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(true);
  });

  it('uses a saved schedule before settings have loaded, and stays off when night mode was never saved', () => {
    vi.setSystemTime(new Date(2026, 10, 23, 22, 0, 0));
    localStorage.setItem('beacon-settings', JSON.stringify({
      familyName: 'Sachs',
      nightModeEnabled: true,
      nightModeStart: '21:00',
      nightModeEnd: '06:30',
      nightModeOverride: 'schedule',
    }));
    const off: NightModeSchedule = { ...overnight, enabled: false };
    const { result, rerender } = renderHook(
      ({ ready, schedule }) => useNightScheduleActive(schedule, ready),
      { initialProps: { ready: false, schedule: off } },
    );
    expect(result.current).toBe(true);

    localStorage.clear();
    const fresh = renderHook(() => useNightScheduleActive(off, false));
    expect(fresh.result.current).toBe(false);

    rerender({ ready: true, schedule: off });
    expect(result.current).toBe(false);
  });
});
