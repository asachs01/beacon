import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GUEST_SESSION_KEY, startGuestSession } from '../display/guest-mode';
import { useGuestMode } from './useGuestMode';

describe('useGuestMode guest PIN config', () => {
  it('ends a no-timeout session when the guest PIN changes', () => {
    const { result, rerender } = renderHook(
      ({ pin }: { pin: string }) => useGuestMode(null, pin),
      { initialProps: { pin: '9876' } },
    );
    act(() => {
      result.current.enter();
    });
    expect(result.current.active).toBe(true);
    expect(result.current.expiresAt).toBeNull();

    rerender({ pin: '654321' });
    expect(result.current.active).toBe(false);
    expect(localStorage.getItem(GUEST_SESSION_KEY)).toBeNull();
  });

  it('drops a session restored from localStorage when the guest PIN was cleared', () => {
    startGuestSession(null, '9876');
    const { result } = renderHook(() => useGuestMode(null, ''));
    expect(result.current.active).toBe(false);
    expect(localStorage.getItem(GUEST_SESSION_KEY)).toBeNull();
  });

  it('keeps a restored no-timeout session when the guest PIN is unchanged', () => {
    startGuestSession(null, '9876');
    const { result } = renderHook(() => useGuestMode(null, '9876'));
    expect(result.current.active).toBe(true);
    expect(result.current.expiresAt).toBeNull();
  });
});
