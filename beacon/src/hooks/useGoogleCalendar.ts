import { useState, useEffect, useCallback, useRef } from 'react';
import { startOfWeek, endOfWeek, addDays } from 'date-fns';
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
  isGoogleBlockedByIngress,
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
  /** Whether Google OAuth is blocked (e.g. running in HA ingress) */
  blockedByIngress: boolean;
  /** Sign in to Google */
  signIn: () => Promise<void>;
  /** Sign out of Google */
  signOut: () => void;
  /** Fetch events for a time range */
  fetchEvents: (start: string, end: string) => Promise<void>;
}

export function useGoogleCalendar(): GoogleCalendarState {
  const configured = isGoogleConfigured();
  const blockedByIngress = isGoogleBlockedByIngress();
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
      const result = await handleRedirectCallback();

      if (result.error) {
        console.warn(result.error);
      }

      if (!cancelled) {
        const token = getStoredToken();
        if (token && isTokenValid()) {
          setSignedIn(true);
          setEmail(token.email || null);
        } else if (result.ok) {
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

  // Poll Google Calendar events every 5 minutes when signed in
  useEffect(() => {
    if (!signedIn || calendarsRef.current.length === 0) return;

    // Initial fetch
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    const weekEnd = addDays(endOfWeek(new Date(), { weekStartsOn: 0 }), 1);
    fetchEvents(weekStart.toISOString(), weekEnd.toISOString());

    const interval = setInterval(() => {
      const ws = startOfWeek(new Date(), { weekStartsOn: 0 });
      const we = addDays(endOfWeek(new Date(), { weekStartsOn: 0 }), 1);
      fetchEvents(ws.toISOString(), we.toISOString());
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [signedIn, calendars.length, fetchEvents]);

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
    blockedByIngress,
    signIn,
    signOut,
    fetchEvents,
  };
}
