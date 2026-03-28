import { useState, useEffect, useCallback } from 'react';
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns';
import { useHomeAssistant } from './hooks/useHomeAssistant';
import { useCalendarEvents } from './hooks/useCalendarEvents';
import { useFamily } from './hooks/useFamily';
import { Clock } from './components/Clock';
import { WeekCalendar } from './components/WeekCalendar';
import { EventModal, EventFormData } from './components/EventModal';
import { FamilyFilter } from './components/FamilyFilter';
import { FamilyManager } from './components/FamilyManager';
import { ChoresPanel } from './components/ChoresPanel';
import { Leaderboard } from './components/Leaderboard';
import { Sidebar, SidebarView } from './components/Sidebar';
import { CalendarEvent } from './types';

const FAMILY_NAME = import.meta.env.VITE_FAMILY_NAME || 'Sachs Family';

export function App() {
  const { client, connected } = useHomeAssistant();
  const {
    calendars,
    events,
    fetchCalendars,
    fetchEvents,
    createEvent,
    deleteEvent,
  } = useCalendarEvents(client);

  const {
    members,
    addMember,
    updateMember,
    removeMember,
  } = useFamily(client);

  const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [prefillTime, setPrefillTime] = useState<string | null>(null);
  const [showFamilyManager, setShowFamilyManager] = useState(false);
  const [activeView, setActiveView] = useState<SidebarView>('calendar');

  // Chores and leaderboard are now slide-over panels triggered from sidebar
  const showChoresPanel = activeView === 'chores';
  const showLeaderboard = activeView === 'leaderboard';

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
    setPrefillDate(null);
    setPrefillTime(null);
    setShowModal(true);
  }, []);

  const handleSlotClick = useCallback((date: string, hour: number) => {
    setSelectedEvent(null);
    setPrefillDate(date);
    setPrefillTime(`${String(hour).padStart(2, '0')}:00`);
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setSelectedEvent(null);
    setPrefillDate(null);
    setPrefillTime(null);
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
    setPrefillDate(null);
    setPrefillTime(null);
    setShowModal(true);
  }, []);

  const handleChangeView = useCallback((view: SidebarView) => {
    setActiveView(view);
  }, []);

  const handleClosePanel = useCallback(() => {
    setActiveView('calendar');
  }, []);

  return (
    <div className="beacon">
      {/* Left Sidebar */}
      <Sidebar
        activeView={activeView}
        onChangeView={handleChangeView}
        onOpenSettings={() => setShowFamilyManager(true)}
      />

      {/* Main content area */}
      <div className="beacon-main">
        {/* Header */}
        <header className="beacon-header">
          <div className="header-left">
            <span className="header-family-name">{FAMILY_NAME}</span>
            <span className="header-separator" />
            <span className="header-date">{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
            {!connected && (
              <div className="connection-status">
                <span className="connection-dot" />
                Connecting...
              </div>
            )}
          </div>
          <div className="header-right">
            <Clock />
          </div>
        </header>

        {/* Family filter pills — above the calendar */}
        <div className="filter-bar">
          <FamilyFilter
            calendars={calendars}
            hiddenCalendars={hiddenCalendars}
            onToggle={handleToggleCalendar}
          />
        </div>

        {/* Calendar Body */}
        <div className="beacon-body">
          <WeekCalendar
            events={events}
            hiddenCalendars={hiddenCalendars}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
          />
        </div>

        {/* FAB */}
        <button
          type="button"
          className="btn--fab"
          onClick={handleAddEvent}
          aria-label="Add event"
        >
          +
        </button>
      </div>

      {/* Event Modal */}
      {showModal && (
        <EventModal
          event={selectedEvent}
          calendars={calendars}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={handleCloseModal}
          prefillDate={prefillDate}
          prefillTime={prefillTime}
        />
      )}

      {/* Family Manager Modal */}
      {showFamilyManager && (
        <FamilyManager
          members={members}
          onAddMember={addMember}
          onUpdateMember={updateMember}
          onRemoveMember={removeMember}
          onClose={() => setShowFamilyManager(false)}
        />
      )}

      {/* Chores Slide Panel */}
      <ChoresPanel
        open={showChoresPanel}
        onClose={handleClosePanel}
        haClient={client}
      />
      {showChoresPanel && (
        <div
          className="slide-panel-backdrop"
          onClick={handleClosePanel}
        />
      )}

      {/* Leaderboard Slide Panel */}
      <Leaderboard
        open={showLeaderboard}
        onClose={handleClosePanel}
        haClient={client}
      />
      {showLeaderboard && (
        <div
          className="slide-panel-backdrop"
          onClick={handleClosePanel}
        />
      )}

      {/* Demo indicator */}
      {!connected && (
        <div className="demo-badge">Demo Mode</div>
      )}
    </div>
  );
}
