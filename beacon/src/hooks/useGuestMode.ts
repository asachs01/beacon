import { useCallback, useEffect, useState } from 'react';
import {
  clearGuestSession,
  guestCanSee,
  readGuestSession,
  startGuestSession,
} from '../display/guest-mode';

export interface GuestMode {
  active: boolean;
  /** True when this screen may show or perform `feature`. See `registerGuestFeature`. */
  canSee: (feature: string) => boolean;
  enter: () => void;
  exit: () => void;
  expiresAt: number | null;
}

/**
 * Guest session for this screen. The expiry lives in localStorage so a
 * reload keeps guest mode until the timeout, or until a family PIN leaves it.
 */
export function useGuestMode(timeoutHours: number | null): GuestMode {
  const [session, setSession] = useState(() => readGuestSession());

  useEffect(() => {
    if (!session.active || session.expiresAt == null) return undefined;
    const delay = session.expiresAt - Date.now();
    const id = window.setTimeout(() => {
      clearGuestSession();
      setSession({ active: false, expiresAt: null });
    }, Math.max(0, delay));
    return () => window.clearTimeout(id);
  }, [session.active, session.expiresAt]);

  const enter = useCallback(() => {
    const next = startGuestSession(timeoutHours);
    setSession({ active: true, expiresAt: next.expiresAt });
  }, [timeoutHours]);

  const exit = useCallback(() => {
    clearGuestSession();
    setSession({ active: false, expiresAt: null });
  }, []);

  const canSee = useCallback(
    (feature: string) => guestCanSee(session.active, feature),
    [session.active],
  );

  return {
    active: session.active,
    canSee,
    enter,
    exit,
    expiresAt: session.expiresAt,
  };
}
