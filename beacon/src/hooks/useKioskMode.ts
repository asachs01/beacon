import { useEffect, useRef, useCallback, useState } from 'react';
import type { SidebarView } from '../components/Sidebar';

/** Views that kiosk mode cycles through automatically. */
const CYCLE_VIEWS: SidebarView[] = ['dashboard', 'calendar', 'photos'];
const CYCLE_INTERVAL_MS = 30_000; // 30 seconds per view
const CURSOR_HIDE_MS = 5_000;     // hide cursor after 5s of no movement
const EXIT_TAP_COUNT = 5;
const EXIT_TAP_WINDOW_MS = 3_000; // 5 taps within 3 seconds
const EXIT_CORNER_SIZE = 60;      // px from top-left corner
const EXIT_HINT_DURATION_MS = 5_000; // show exit hint for 5 seconds

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
 * - Auto-cycles views on a timer (resets on user interaction)
 * - Provides a "tap 5 times in the corner" escape hatch
 * - Shows an auto-hiding exit hint on entry
 */
export function useKioskMode({ enabled, onChangeView, onExit }: UseKioskModeOptions) {
  const cycleIndexRef = useRef(0);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cycleTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastInteractionRef = useRef(Date.now());
  const [cursorHidden, setCursorHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExitHint, setShowExitHint] = useState(false);

  // Track corner taps for the escape hatch
  const cornerTapsRef = useRef<number[]>([]);

  // ---- Fullscreen ----
  useEffect(() => {
    if (!enabled) return;

    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {
          // Fullscreen may be blocked by browser policy (e.g. iOS Safari)
          setIsFullscreen(false);
        });
    } else if (document.fullscreenElement) {
      setIsFullscreen(true);
    }

    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [enabled]);

  // ---- Exit hint overlay (auto-hides after 5s) ----
  useEffect(() => {
    if (!enabled) {
      setShowExitHint(false);
      return;
    }

    setShowExitHint(true);
    const timer = setTimeout(() => setShowExitHint(false), EXIT_HINT_DURATION_MS);
    return () => clearTimeout(timer);
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

  // ---- Auto-cycle views (resets on user interaction) ----
  const resetCycleTimer = useCallback(() => {
    if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    cycleTimerRef.current = setInterval(() => {
      cycleIndexRef.current = (cycleIndexRef.current + 1) % CYCLE_VIEWS.length;
      onChangeView(CYCLE_VIEWS[cycleIndexRef.current]);
    }, CYCLE_INTERVAL_MS);
  }, [onChangeView]);

  useEffect(() => {
    if (!enabled) return;

    cycleIndexRef.current = 0;
    onChangeView(CYCLE_VIEWS[0]);
    resetCycleTimer();

    // Reset auto-cycle timer on any user interaction
    const handleInteraction = () => {
      lastInteractionRef.current = Date.now();
      resetCycleTimer();
    };

    window.addEventListener('mousedown', handleInteraction, { passive: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true });
    window.addEventListener('keydown', handleInteraction, { passive: true });

    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [enabled, onChangeView, resetCycleTimer]);

  // ---- Escape hatch: tap 5 times in top-left corner ----
  useEffect(() => {
    if (!enabled) return;

    const handleTap = (e: MouseEvent | TouchEvent) => {
      let x: number, y: number;
      if ('touches' in e) {
        // Only count single-finger touches to prevent multi-touch false positives
        if (e.touches.length !== 1) return;
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

  return { cursorHidden, isFullscreen, showExitHint };
}
