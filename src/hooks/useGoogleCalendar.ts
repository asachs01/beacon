import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarEvent, CalendarInfo } from '../types';
import {
  isGoogleConfigured,
  isTokenValid,
  getStoredToken,
  handleRedirectCallback,
  signIn as googleSignIn,
  signOut as googleSignOut,
  getCalendars,
  getEvents,
} from '../api/google-calendar';

export interface GoogleCalendarState {
  /** Whether VITE_GOOGLE_CLIENT_ID is set */
  configured: boolean;
  /** Whether the user is signed in with a valid token */
  signedIn: boolean;
  /** The signed-in user's email, if available */
  email: string | null;
  /** Google calendars */
  calendars: CalendarInfo[];
  /** Google calendar events (for the current view range) */
  events: CalendarEvent[];
  /** Whether a fetch is in progress */
  loading: boolean;
  /** Sign in to Google */
  signIn: () => Promise<void>;
  /** Sign out of Google */
  signOut: () => void;
  /** Fetch events for a time range */
  fetchEvents: (start: string, end: string) => Promise<void>;
}

export function useGoogleCalendar(): GoogleCalendarState {
  const configured = isGoogleConfigured();
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const calendarsRef = useRef<CalendarInfo[]>([]);

  // On mount, check for OAuth redirect callback and existing token
  useEffect(() => {
    if (!configured) return;

    let cancelled = false;

    const init = async () => {
      // Try to handle OAuth redirect first
      const wasRedirect = await handleRedirectCallback();

      if (!cancelled) {
        const token = getStoredToken();
        if (token && isTokenValid()) {
          setSignedIn(true);
          setEmail(token.email || null);
        } else if (wasRedirect) {
          // Token was just obtained
          const newToken = getStoredToken();
          if (newToken) {
            setSignedIn(true);
            setEmail(newToken.email || null);
          }
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [configured]);

  // Fetch calendars when signed in
  useEffect(() => {
    if (!signedIn) {
      setCalendars([]);
      calendarsRef.current = [];
      return;
    }

    let cancelled = false;

    const loadCalendars = async () => {
      try {
        const cals = await getCalendars();
        if (!cancelled) {
          setCalendars(cals);
          calendarsRef.current = cals;
        }
      } catch (err) {
        console.error('Failed to fetch Google calendars:', err);
      }
    };

    loadCalendars();
    return () => { cancelled = true; };
  }, [signedIn]);

  const fetchEvents = useCallback(async (start: string, end: string) => {
    if (!signedIn || calendarsRef.current.length === 0) return;

    setLoading(true);
    try {
      const allEvents: CalendarEvent[] = [];

      for (const cal of calendarsRef.current) {
        try {
          const calEvents = await getEvents(cal.id, start, end);
          // Apply the calendar's color to each event
          const colored = calEvents.map((ev) => ({ ...ev, color: cal.color }));
          allEvents.push(...colored);
        } catch (err) {
          console.error(`Failed to fetch events for ${cal.name}:`, err);
        }
      }

      setEvents(allEvents);
    } catch (err) {
      console.error('Failed to fetch Google events:', err);
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  const signIn = useCallback(async () => {
    await googleSignIn();
  }, []);

  const signOut = useCallback(() => {
    googleSignOut();
    setSignedIn(false);
    setEmail(null);
    setCalendars([]);
    setEvents([]);
  }, []);

  return {
    configured,
    signedIn,
    email,
    calendars,
    events,
    loading,
    signIn,
    signOut,
    fetchEvents,
  };
}
