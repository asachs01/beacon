import { useEffect } from 'react';

/**
 * Keeps the screen on while `enabled` (Settings > Display > Always-On
 * Display), where the browser allows it: the Screen Wake Lock API, in
 * Chrome, Edge and Safari 16.4+ over https or localhost. The browser ends
 * the lock when the page is hidden, so it's asked for again when the page
 * is shown. The setting used to do nothing.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !isWakeLockSupported()) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;

    const request = async () => {
      if (document.hidden || lock) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) {
          void next.release();
          return;
        }
        lock = next;
        lock.addEventListener('release', () => {
          lock = null;
        });
      } catch {
        /* refused, e.g. in battery saver: the screen sleeps as usual */
      }
    };
    const onVisible = () => {
      if (!document.hidden) void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [enabled]);
}

/** Whether this browser can keep the screen on (see useWakeLock). */
export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}
