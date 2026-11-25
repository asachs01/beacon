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
 * Guest session for this screen. The expiry and a hash of the guest PIN
 * config live in localStorage. A reload keeps guest mode until the timeout,
 * until someone leaves it, or until the saved guest PIN no longer matches.
 */
export function useGuestMode(timeoutHours: number | null, guestPin: string): GuestMode {
  const [session, setSession] = useState(() => readGuestSession(guestPin));

  useEffect(() => {
    const next = readGuestSession(guestPin);
    setSession((prev) => (
      prev.active === next.active && prev.expiresAt === next.expiresAt ? prev : next
    ));
  }, [guestPin]);

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
    const next = startGuestSession(timeoutHours, guestPin);
    setSession({ active: true, expiresAt: next.expiresAt });
  }, [timeoutHours, guestPin]);

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
