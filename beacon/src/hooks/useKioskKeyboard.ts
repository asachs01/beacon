import { useState, useEffect, useCallback, useRef } from 'react';

const KIOSK_MIN_WIDTH = 1024;

function isKioskDisplay(): boolean {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isLargeScreen = window.innerWidth >= KIOSK_MIN_WIDTH;
  // Kiosk = touch-capable large screen (wall-mounted display)
  // Skip for phones/tablets (touch + small) and desktops (no touch)
  return hasTouch && isLargeScreen;
}

export function useKioskKeyboard() {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeInput, setActiveInput] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [isKiosk, setIsKiosk] = useState(isKioskDisplay);
  const dismissingRef = useRef(false);

  // Re-evaluate on resize (orientation changes, etc.)
  useEffect(() => {
    const handleResize = () => setIsKiosk(isKioskDisplay());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Listen for focus/blur on inputs globally
  useEffect(() => {
    if (!isKiosk) return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        // Skip inputs that shouldn't trigger keyboard (e.g. date, color pickers)
        const skipTypes = ['date', 'time', 'datetime-local', 'color', 'range', 'checkbox', 'radio', 'file'];
        if (target instanceof HTMLInputElement && skipTypes.includes(target.type)) return;

        dismissingRef.current = false;
        setActiveInput(target);
        setShowKeyboard(true);
      }
    };

    const handleFocusOut = (_e: FocusEvent) => {
      // Only dismiss if we're not clicking a keyboard key
      // The keyboard component prevents blur via onMouseDown preventDefault
      // Use a small delay to allow keyboard clicks to cancel the dismiss
      setTimeout(() => {
        if (!dismissingRef.current) return;
        setShowKeyboard(false);
        setActiveInput(null);
      }, 100);
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
    };
  }, [isKiosk]);

  const dismiss = useCallback(() => {
    dismissingRef.current = true;
    setShowKeyboard(false);
    if (activeInput) {
      activeInput.blur();
    }
    setActiveInput(null);
  }, [activeInput]);

  // Mark as dismissing when blur happens (so focusout handler can clean up)
  const markDismissing = useCallback(() => {
    dismissingRef.current = true;
  }, []);

  return { showKeyboard: isKiosk && showKeyboard, activeInput, dismiss, markDismissing };
}
