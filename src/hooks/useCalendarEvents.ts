import { useState, useCallback } from 'react';
import { HomeAssistantClient } from '../api/homeassistant';
import { CalendarEvent, CalendarInfo, getCalendarColor } from '../types';

export function useCalendarEvents(getClient: () => HomeAssistantClient | null) {
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCalendars = useCallback(async () => {
    const client = getClient();
    if (!client?.isConnected) return;

    try {
      const cals = await client.getCalendars();
      setCalendars(cals);
      return cals;
    } catch (err) {
      console.error('Failed to fetch calendars:', err);
      return [];
    }
  }, [getClient]);

  const fetchEvents = useCallback(async (start: string, end: string) => {
    const client = getClient();
    if (!client?.isConnected) return;

    setLoading(true);
    try {
      let cals = calendars;
      if (cals.length === 0) {
        cals = (await fetchCalendars()) || [];
      }

      const allEvents: CalendarEvent[] = [];
      for (const cal of cals) {
        try {
          const calEvents = await client.getEvents(cal.id, start, end);
          const colorIndex = cals.findIndex(c => c.id === cal.id);
          for (const ev of calEvents) {
            ev.color = getCalendarColor(colorIndex);
            ev.calendarName = cal.name;
          }
          allEvents.push(...calEvents);
        } catch (err) {
          console.error(`Failed to fetch events for ${cal.name}:`, err);
        }
      }

      allEvents.sort((a, b) => a.start.localeCompare(b.start));
      setEvents(allEvents);
    } finally {
      setLoading(false);
    }
  }, [getClient, calendars, fetchCalendars]);

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
    const client = getClient();
    if (!client?.isConnected) return;
    await client.createEvent(calendarId, event);
  }, [getClient]);

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
    const client = getClient();
    if (!client?.isConnected) return;
    await client.updateEvent(calendarId, uid, event);
  }, [getClient]);

  const deleteEvent = useCallback(async (calendarId: string, uid: string) => {
    const client = getClient();
    if (!client?.isConnected) return;
    await client.deleteEvent(calendarId, uid);
  }, [getClient]);

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
