import { useState, useCallback, useRef } from 'react';
import { CalendarEvent, CalendarInfo, getCalendarColor } from '../types';
import { haFetch, hasToken } from '../api/ha-rest';

/**
 * Calendar events hook — uses HA REST API via haFetch.
 * Works with both direct HA connections and the add-on API proxy.
 * The `connected` flag indicates whether the HA API is reachable.
 */
export function useCalendarEvents(connected: boolean) {
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const calendarsRef = useRef<CalendarInfo[]>([]);

  const fetchCalendars = useCallback(async () => {
    if (!connected && !hasToken()) return [];

    try {
      const data = await haFetch('/api/calendars') as Array<{ entity_id: string; name: string }>;
      const cals = data.map((cal, index) => ({
        id: cal.entity_id,
        name: cal.name,
        color: getCalendarColor(index),
      }));
      calendarsRef.current = cals;
      setCalendars(cals);
      return cals;
    } catch (err) {
      console.error('Failed to fetch calendars:', err);
      return [];
    }
  }, [connected]);

  const fetchEvents = useCallback(async (start: string, end: string) => {
    if (!connected && !hasToken()) return;

    setLoading(true);
    try {
      let cals = calendarsRef.current;
      if (cals.length === 0) {
        cals = (await fetchCalendars()) || [];
      }
      if (cals.length === 0) return;

      const allEvents: CalendarEvent[] = [];
      for (const cal of cals) {
        try {
          const params = new URLSearchParams({ start, end });
          const result = await haFetch(`/api/calendars/${cal.id}?${params}`) as Array<{
            uid?: string;
            summary: string;
            start: string | { dateTime: string; date: string };
            end: string | { dateTime: string; date: string };
            description?: string;
            recurrence_id?: string;
          }>;

          const colorIndex = cals.findIndex(c => c.id === cal.id);
          for (const ev of (result || [])) {
            const startStr = typeof ev.start === 'string' ? ev.start : (ev.start.dateTime || ev.start.date);
            const endStr = typeof ev.end === 'string' ? ev.end : (ev.end.dateTime || ev.end.date);
            const allDay = typeof ev.start === 'string'
              ? ev.start.length === 10
              : !!ev.start.date && !ev.start.dateTime;

            allEvents.push({
              id: ev.uid || ev.recurrence_id || `${cal.id}-${allEvents.length}`,
              title: ev.summary,
              start: startStr,
              end: endStr,
              allDay,
              description: ev.description,
              calendarId: cal.id,
              calendarName: cal.name,
              color: getCalendarColor(colorIndex),
            });
          }
        } catch (err) {
          console.error(`Failed to fetch events for ${cal.name}:`, err);
        }
      }

      allEvents.sort((a, b) => a.start.localeCompare(b.start));
      setEvents(allEvents);
    } finally {
      setLoading(false);
    }
  }, [connected, fetchCalendars]);

  const createEvent = useCallback(async (
    calendarId: string,
    event: {
      summary: string;
      start_date_time?: string;
      end_date_time?: string;
      start_date?: string;
      end_date?: string;
      description?: string;
      rrule?: string;
    }
  ) => {
    await haFetch(`/api/services/calendar/create_event`, {
      method: 'POST',
      body: JSON.stringify({ ...event, entity_id: calendarId }),
    });
  }, []);

  const updateEvent = useCallback(async (
    calendarId: string,
    uid: string,
    event: {
      summary?: string;
      start_date_time?: string;
      end_date_time?: string;
      start_date?: string;
      end_date?: string;
      description?: string;
    }
  ) => {
    await haFetch(`/api/services/calendar/update_event`, {
      method: 'POST',
      body: JSON.stringify({ ...event, entity_id: calendarId, uid }),
    });
  }, []);

  const deleteEvent = useCallback(async (calendarId: string, uid: string) => {
    await haFetch(`/api/services/calendar/delete_event`, {
      method: 'POST',
      body: JSON.stringify({ entity_id: calendarId, uid }),
    });
  }, []);

  return {
    calendars,
    events,
    loading,
    fetchCalendars,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
