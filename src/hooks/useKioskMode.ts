import { useEffect, useRef, useCallback, useState } from 'react';
import type { SidebarView } from '../components/Sidebar';

/** Views that kiosk mode cycles through automatically. */
const CYCLE_VIEWS: SidebarView[] = ['dashboard', 'calendar', 'photos'];
const CYCLE_INTERVAL_MS = 30_000; // 30 seconds per view
const CURSOR_HIDE_MS = 5_000;     // hide cursor after 5s of no movement
const EXIT_TAP_COUNT = 5;
const EXIT_TAP_WINDOW_MS = 3_000; // 5 taps within 3 seconds
const EXIT_CORNER_SIZE = 60;      // px from top-left corner

interface UseKioskModeOptions {
  enabled: boolean;
  onChangeView: (view: SidebarView) => void;
  onExit: () => void;
}

/**
 * Manages kiosk mode behaviour:
 * - Requests fullscreen
 * - Hides cursor after inactivity
 * - Prevents right-click context menu
 * - Auto-cycles views on a timer
 * - Provides a "tap 5 times in the corner" escape hatch
 */
export function useKioskMode({ enabled, onChangeView, onExit }: UseKioskModeOptions) {
  const cycleIndexRef = useRef(0);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [cursorHidden, setCursorHidden] = useState(false);

  // Track corner taps for the escape hatch
  const cornerTapsRef = useRef<number[]>([]);

  // ---- Fullscreen ----
  useEffect(() => {
    if (!enabled) return;

    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {
        // Fullscreen may be blocked by browser policy — that's fine
      });
    }

    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [enabled]);

  // ---- Hide cursor after inactivity ----
  const resetCursorTimer = useCallback(() => {
    setCursorHidden(false);
    if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    cursorTimerRef.current = setTimeout(() => {
      setCursorHidden(true);
    }, CURSOR_HIDE_MS);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCursorHidden(false);
      return;
    }

    resetCursorTimer();
    const onMove = () => resetCursorTimer();
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    };
  }, [enabled, resetCursorTimer]);

  // Apply/remove cursor style on <html>
  useEffect(() => {
    if (cursorHidden && enabled) {
      document.documentElement.style.cursor = 'none';
    } else {
      document.documentElement.style.cursor = '';
    }
    return () => {
      document.documentElement.style.cursor = '';
    };
  }, [cursorHidden, enabled]);

  // ---- Prevent context menu ----
  useEffect(() => {
    if (!enabled) return;
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener('contextmenu', prevent);
    return () => window.removeEventListener('contextmenu', prevent);
  }, [enabled]);

  // ---- Auto-cycle views ----
  useEffect(() => {
    if (!enabled) return;

    cycleIndexRef.current = 0;
    onChangeView(CYCLE_VIEWS[0]);

    const interval = setInterval(() => {
      cycleIndexRef.current = (cycleIndexRef.current + 1) % CYCLE_VIEWS.length;
      onChangeView(CYCLE_VIEWS[cycleIndexRef.current]);
    }, CYCLE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, onChangeView]);

  // ---- Escape hatch: tap 5 times in top-left corner ----
  useEffect(() => {
    if (!enabled) return;

    const handleTap = (e: MouseEvent | TouchEvent) => {
      let x: number, y: number;
      if ('touches' in e) {
        x = e.touches[0]?.clientX ?? 0;
        y = e.touches[0]?.clientY ?? 0;
      } else {
        x = e.clientX;
        y = e.clientY;
      }

      if (x > EXIT_CORNER_SIZE || y > EXIT_CORNER_SIZE) {
        cornerTapsRef.current = [];
        return;
      }

      const now = Date.now();
      cornerTapsRef.current.push(now);
      // Remove taps outside the time window
      cornerTapsRef.current = cornerTapsRef.current.filter(
        (t) => now - t < EXIT_TAP_WINDOW_MS,
      );

      if (cornerTapsRef.current.length >= EXIT_TAP_COUNT) {
        cornerTapsRef.current = [];
        onExit();
      }
    };

    window.addEventListener('mousedown', handleTap, { passive: true });
    window.addEventListener('touchstart', handleTap, { passive: true });
    return () => {
      window.removeEventListener('mousedown', handleTap);
      window.removeEventListener('touchstart', handleTap);
    };
  }, [enabled, onExit]);

  return { cursorHidden };
}
