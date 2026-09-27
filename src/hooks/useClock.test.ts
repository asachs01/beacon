import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { format } from 'date-fns';
import { useClock, byDay, bySecond, useSelectedDay } from './useClock';

const hhmm = (d: Date) => format(d, 'HH:mm');
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useClock', () => {
  // For Settings' Show Seconds on Clock.
  it('ticks every second with bySecond', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 14, 5, 30, 250));
    const { result } = renderHook(() => useClock(bySecond));
    expect(format(result.current, 'HH:mm:ss')).toBe('14:05:30');

    advance(750);
    expect(format(result.current, 'HH:mm:ss')).toBe('14:05:31');
    advance(1000);
    expect(format(result.current, 'HH:mm:ss')).toBe('14:05:32');
  });

  it('flips exactly on the minute, and renders nothing in between', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 14, 5, 30, 250));
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useClock();
    });
    expect(hhmm(result.current)).toBe('14:05');

    advance(29_749); // 14:05:59.999
    expect(hhmm(result.current)).toBe('14:05');
    expect(renders).toBe(1);

    advance(1); // 14:06:00.000
    expect(hhmm(result.current)).toBe('14:06');
    expect(renders).toBe(2);

    advance(60_000);
    expect(hhmm(result.current)).toBe('14:07');
    for (let i = 0; i < 10; i++) advance(60_000);
    expect(hhmm(result.current)).toBe('14:17');
    expect(renders).toBe(13); // one per minute
  });

  it('with byDay, stays quiet until midnight', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 23, 57, 10));
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useClock(byDay);
    });

    advance(2 * 60_000); // 23:59:10
    expect(renders).toBe(1);
    expect(result.current.getDate()).toBe(26);

    advance(50_000); // 00:00:00
    expect(renders).toBe(2);
    expect(result.current.getDate()).toBe(27);
  });

  it('catches up at once when the app comes back on screen', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 9, 0, 0));
    const { result } = renderHook(() => useClock());

    // Backgrounded: time moves on but the timer hasn't fired yet.
    vi.setSystemTime(new Date(2026, 8, 26, 9, 42, 5));
    expect(hhmm(result.current)).toBe('09:00');

    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(hhmm(result.current)).toBe('09:42');
  });

  it('leaves no timer running after unmount', () => {
    const { unmount } = renderHook(() => useClock());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useSelectedDay', () => {
  it('moves from today to the new day at midnight', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 23, 59, 30));
    const { result } = renderHook(() => useSelectedDay());
    expect(result.current[0]).toEqual(new Date(2026, 8, 26));

    advance(30_000);
    expect(result.current[0]).toEqual(new Date(2026, 8, 27));
  });

  it('leaves a day picked with the arrows alone', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 23, 59, 30));
    const { result } = renderHook(() => useSelectedDay());
    act(() => { result.current[1](new Date(2026, 8, 25)); });

    advance(30_000);
    expect(result.current[0]).toEqual(new Date(2026, 8, 25));
  });
});
