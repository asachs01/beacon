import { useState, useEffect, useCallback } from 'react';
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns';
import { useHomeAssistant } from './hooks/useHomeAssistant';
import { useWeather } from './hooks/useWeather';
import { useCalendarEvents } from './hooks/useCalendarEvents';
import { Clock } from './components/Clock';
import { Weather } from './components/Weather';
import { WeekView } from './components/WeekView';
import { TodayAgenda } from './components/TodayAgenda';
import { EventModal, EventFormData } from './components/EventModal';
import { FamilyFilter } from './components/FamilyFilter';
import { CalendarEvent } from './types';

export function App() {
  const { client, connected } = useHomeAssistant();
  const { weather, error: weatherError } = useWeather(client);
  const {
    calendars,
    events,
    fetchCalendars,
    fetchEvents,
    createEvent,
    deleteEvent,
  } = useCalendarEvents(client);

  const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Fetch data when connected
  useEffect(() => {
    if (!connected) return;

    fetchCalendars();

    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    const weekEnd = addDays(endOfWeek(new Date(), { weekStartsOn: 0 }), 1);
    fetchEvents(weekStart.toISOString(), weekEnd.toISOString());

    // Refresh every 5 minutes
    const interval = setInterval(() => {
      const ws = startOfWeek(new Date(), { weekStartsOn: 0 });
      const we = addDays(endOfWeek(new Date(), { weekStartsOn: 0 }), 1);
      fetchEvents(ws.toISOString(), we.toISOString());
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [connected, fetchCalendars, fetchEvents]);

  const handleToggleCalendar = useCallback((calendarId: string) => {
    setHiddenCalendars(prev => {
      const next = new Set(prev);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      return next;
    });
  }, []);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setSelectedEvent(null);
  }, []);

  const handleSaveEvent = useCallback(async (calendarId: string, data: EventFormData) => {
    try {
      const eventData = data.allDay
        ? {
            summary: data.summary,
            start_date: data.startDate,
            end_date: data.endDate,
            description: data.description || undefined,
          }
        : {
            summary: data.summary,
            start_date_time: `${data.startDate}T${data.startTime}:00`,
            end_date_time: `${data.endDate}T${data.endTime}:00`,
            description: data.description || undefined,
          };

      await createEvent(calendarId, eventData);

      // Refresh events
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
      const weekEnd = addDays(endOfWeek(new Date(), { weekStartsOn: 0 }), 1);
      await fetchEvents(weekStart.toISOString(), weekEnd.toISOString());

      handleCloseModal();
    } catch (err) {
      console.error('Failed to save event:', err);
    }
  }, [createEvent, fetchEvents, handleCloseModal]);

  const handleDeleteEvent = useCallback(async (calendarId: string, eventId: string) => {
    try {
      await deleteEvent(calendarId, eventId);

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
      const weekEnd = addDays(endOfWeek(new Date(), { weekStartsOn: 0 }), 1);
      await fetchEvents(weekStart.toISOString(), weekEnd.toISOString());

      handleCloseModal();
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  }, [deleteEvent, fetchEvents, handleCloseModal]);

  const handleAddEvent = useCallback(() => {
    setSelectedEvent(null);
    setShowModal(true);
  }, []);

  return (
    <div className="beacon">
      <div className="beacon-layout">
        {/* Left Panel */}
        <aside className="panel panel--left">
          <Clock />
          <Weather weather={weather} error={weatherError} />
          {!connected && (
            <div className="connection-status">
              <span className="connection-dot" />
              Connecting to Home Assistant...
            </div>
          )}
        </aside>

        {/* Center Panel */}
        <main className="panel panel--center">
          <WeekView
            events={events}
            hiddenCalendars={hiddenCalendars}
            onEventClick={handleEventClick}
          />
          <button
            type="button"
            className="btn btn--fab"
            onClick={handleAddEvent}
            aria-label="Add event"
          >
            +
          </button>
        </main>

        {/* Right Panel */}
        <aside className="panel panel--right">
          <TodayAgenda
            events={events}
            hiddenCalendars={hiddenCalendars}
            onEventClick={handleEventClick}
          />
        </aside>
      </div>

      {/* Bottom Filter Bar */}
      <FamilyFilter
        calendars={calendars}
        hiddenCalendars={hiddenCalendars}
        onToggle={handleToggleCalendar}
      />

      {/* Event Modal */}
      {showModal && (
        <EventModal
          event={selectedEvent}
          calendars={calendars}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={handleCloseModal}
        />
      )}

      {/* Demo indicator when no HA connection */}
      {!connected && (
        <div className="demo-badge" title={`Not connected. Set VITE_HA_URL and VITE_HA_TOKEN. Today: ${format(new Date(), 'PPP')}`}>
          Demo Mode
        </div>
      )}
    </div>
  );
}
