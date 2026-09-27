import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

let hidden = false;
const released = vi.fn();
const request = vi.fn(async () => {
  const listeners: (() => void)[] = [];
  return {
    addEventListener: (_type: string, listener: () => void) => { listeners.push(listener); },
    release: async () => { released(); listeners.forEach((l) => l()); },
  };
});

beforeEach(() => {
  hidden = false;
  request.mockClear();
  released.mockClear();
  vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const flush = () => act(async () => { await Promise.resolve(); });

describe('useWakeLock', () => {
  // Settings' Always-On Display used to do nothing.
  it('keeps the screen on while turned on, and lets it sleep once off', async () => {
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await flush();
    expect(request).toHaveBeenCalledWith('screen');

    rerender({ on: false });
    await flush();
    expect(released).toHaveBeenCalled();
  });

  it('asks again when the page is shown, as the browser ended the lock when it was hidden', async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    const lock = await request.mock.results[0].value;

    hidden = true;
    await act(async () => { await lock.release(); document.dispatchEvent(new Event('visibilitychange')); });
    hidden = false;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does nothing while turned off', async () => {
    renderHook(() => useWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });
});
