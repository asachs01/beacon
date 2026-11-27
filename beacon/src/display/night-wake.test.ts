import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NIGHT_URGENT_RELEASE_EVENT,
  NIGHT_URGENT_WAKE_EVENT,
  isNightWakeHeld,
  releaseNightWake,
  requestNightWake,
  resetNightWakeForTests,
  useNightWakeHeld,
} from './night-wake';

describe('urgent night wake', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 22, 0, 0));
    resetNightWakeForTests();
  });

  afterEach(() => {
    resetNightWakeForTests();
    vi.useRealTimers();
  });

  it('holds the dashboard until the reason is released, and for at least 60 seconds', () => {
    requestNightWake('timer:a');
    expect(isNightWakeHeld()).toBe(true);

    act(() => { vi.advanceTimersByTime(90_000); });
    expect(isNightWakeHeld()).toBe(true);

    releaseNightWake('timer:a');
    expect(isNightWakeHeld()).toBe(false);
  });

  it('stays up for the rest of the 60 seconds when dismissed early', () => {
    requestNightWake('family-bell');
    act(() => { vi.advanceTimersByTime(10_000); });
    releaseNightWake('family-bell');
    expect(isNightWakeHeld()).toBe(true);

    act(() => { vi.advanceTimersByTime(49_000); });
    expect(isNightWakeHeld()).toBe(true);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(isNightWakeHeld()).toBe(false);
  });

  it('keeps the screen up while a second reason is still active', () => {
    requestNightWake('timer:a');
    requestNightWake('timer:b');
    act(() => { vi.advanceTimersByTime(90_000); });
    releaseNightWake('timer:a');
    expect(isNightWakeHeld()).toBe(true);
    releaseNightWake('timer:b');
    expect(isNightWakeHeld()).toBe(false);
  });

  it('accepts the beacon:urgent-wake event and ignores a missing reason', () => {
    window.dispatchEvent(new CustomEvent(NIGHT_URGENT_WAKE_EVENT, { detail: { reason: 'family-bell' } }));
    expect(isNightWakeHeld()).toBe(true);
    window.dispatchEvent(new CustomEvent(NIGHT_URGENT_WAKE_EVENT, { detail: {} }));
    window.dispatchEvent(new CustomEvent(NIGHT_URGENT_RELEASE_EVENT, { detail: { reason: 'family-bell' } }));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(isNightWakeHeld()).toBe(false);
  });

  it('notifies the hook and drops the hold after the minimum once released', () => {
    const { result } = renderHook(() => useNightWakeHeld());
    expect(result.current).toBe(false);

    act(() => { requestNightWake('timer:a'); });
    expect(result.current).toBe(true);

    act(() => { vi.advanceTimersByTime(15_000); });
    act(() => { releaseNightWake('timer:a'); });
    expect(result.current).toBe(true);

    act(() => { vi.advanceTimersByTime(45_000); });
    expect(result.current).toBe(false);
  });
});
