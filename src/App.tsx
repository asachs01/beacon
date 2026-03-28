import { useState, useEffect, useCallback, useMemo } from 'react';
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns';
import { useHomeAssistant } from './hooks/useHomeAssistant';
import { useCalendarEvents } from './hooks/useCalendarEvents';
import { useFamily } from './hooks/useFamily';
import { useWeather } from './hooks/useWeather';
import { useChores } from './hooks/useChores';
import { Clock } from './components/Clock';
import { WeekCalendar } from './components/WeekCalendar';
import { DashboardView } from './components/DashboardView';
import { EventModal, EventFormData } from './components/EventModal';
import { FamilyFilter } from './components/FamilyFilter';
import { SettingsView } from './components/SettingsView';
import { useSettings } from './hooks/useSettings';
import { ChoresPanel } from './components/ChoresPanel';
import { Leaderboard } from './components/Leaderboard';
import { Sidebar, SidebarView } from './components/Sidebar';
import { MusicView } from './components/MusicView';
import { PhotoFrame } from './components/PhotoFrame';
import { NowPlayingBar } from './components/NowPlayingBar';
import { useMusic } from './hooks/useMusic';
import { useNotifications } from './hooks/useNotifications';
import { ScreenSaver } from './components/ScreenSaver';
import { GroceryDrawer } from './components/GroceryDrawer';
import { useGrocery } from './hooks/useGrocery';
import { Timer } from './components/Timer';
import { useIngressDetect } from './hooks/useIngressDetect';
import { CalendarEvent } from './types';
import { getConfig } from './config';

const config = getConfig();

export function App() {
  const { client, connected } = useHomeAssistant();
  const { isIngress, compact } = useIngressDetect();
  const {
    calendars,
    events,
    fetchCalendars,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  } = useCalendarEvents(client);

  const {
    members,
    addMember,
    updateMember,
    removeMember,
  } = useFamily(client);

  const { weather } = useWeather(client);
  const music = useMusic(client, connected);
  const {
    chores,
    completionsToday,
    completeChore,
    uncompleteChore,
  } = useChores(client);

  const {
    settings,
    updateSettings,
    resetSettings,
    exportSettings,
    importSettings,
    clearLocalStorage,
  } = useSettings();

  const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [prefillTime, setPrefillTime] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<SidebarView>('dashboard');

  // Event notifications (browser + HA mobile_app)
  useNotifications(events, client);

  // Chores and leaderboard are now slide-over panels triggered from sidebar
  const grocery = useGrocery(connected);
  const showChoresPanel = activeView === 'chores';
  const showLeaderboard = activeView === 'leaderboard';
  const showGrocery = activeView === 'grocery';

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

      // Build rrule if recurrence is set
      if (data.recurrence && data.recurrence !== 'none') {
        const freqMap = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' } as const;
        const freq = freqMap[data.recurrence];
        const until = data.recurrenceEnd.replace(/-/g, '') + 'T235959Z';
        (eventData as Record<string, unknown>).rrule = `FREQ=${freq};UNTIL=${until}`;
      }

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

  const handleEventReschedule = useCallback(async (event: CalendarEvent, newDate: string, newHour: number) => {
    try {
      const oldStart = new Date(event.start);
      const oldEnd = new Date(event.end);
      const durationMs = oldEnd.getTime() - oldStart.getTime();

      if (event.allDay) {
        // For all-day events, move to the new date
        const newEndDate = new Date(new Date(newDate).getTime() + durationMs);
        await updateEvent(event.calendarId, event.id, {
          start_date: newDate,
          end_date: format(newEndDate, 'yyyy-MM-dd'),
        });
      } else {
        const pad = (n: number) => String(n).padStart(2, '0');
        const newStartDt = `${newDate}T${pad(newHour)}:00:00`;
        const newEndTime = new Date(new Date(newStartDt).getTime() + durationMs);
        const newEndDt = `${format(newEndTime, 'yyyy-MM-dd')}T${pad(newEndTime.getHours())}:${pad(newEndTime.getMinutes())}:00`;
        await updateEvent(event.calendarId, event.id, {
          start_date_time: newStartDt,
          end_date_time: newEndDt,
        });
      }

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
      const weekEnd = addDays(endOfWeek(new Date(), { weekStartsOn: 0 }), 1);
      await fetchEvents(weekStart.toISOString(), weekEnd.toISOString());
    } catch (err) {
      console.error('Failed to reschedule event:', err);
    }
  }, [updateEvent, fetchEvents]);

  const handleAddEvent = useCallback(() => {
    setSelectedEvent(null);
    setPrefillDate(null);
    setPrefillTime(null);
    setShowModal(true);
  }, []);

  const handleChangeView = useCallback(
    (view: SidebarView) => setActiveView(view),
    [],
  );

  const handleClosePanel = useCallback(() => {
    setActiveView('calendar');
  }, []);

  // Build a set of chore IDs completed today (for the dashboard checklist).
  // We use the first member for now; a member-picker could be added later.
  const firstMemberId = members.length > 0 ? members[0].id : '__none__';
  const completedChoreIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of completionsToday) {
      if (c.member_id === firstMemberId) {
        ids.add(c.chore_id);
      }
    }
    return ids;
  }, [completionsToday, firstMemberId]);

  const handleToggleChore = useCallback(
    (choreId: string) => {
      if (completedChoreIds.has(choreId)) {
        uncompleteChore(choreId, firstMemberId);
      } else {
        completeChore(choreId, firstMemberId);
      }
    },
    [completedChoreIds, completeChore, uncompleteChore, firstMemberId]
  );

  const sidebarPos = settings.sidebarPosition || 'left';

  return (
    <div className={`beacon beacon--sidebar-${sidebarPos} ${isIngress ? 'beacon--ingress' : ''} ${compact ? 'beacon--compact' : ''}`}>
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onChangeView={handleChangeView}
        position={sidebarPos}
      />

      {/* Main content area */}
      <div className="beacon-main">
        {activeView === 'dashboard' ? (
          <DashboardView
            events={events}
            weather={weather}
            chores={chores}
            completedChoreIds={completedChoreIds}
            onToggleChore={handleToggleChore}
            familyName={settings.familyName}
          />
        ) : activeView === 'music' ? (
          <MusicView
            activePlayer={music.activePlayer}
            players={music.players}
            selectedPlayerId={music.selectedPlayerId}
            onPlay={music.play}
            onPause={music.pause}
            onNext={music.next}
            onPrevious={music.previous}
            onSetVolume={music.setVolume}
            onSelectPlayer={music.selectPlayer}
          />
        ) : activeView === 'settings' ? (
          <SettingsView
            settings={settings}
            onUpdateSettings={updateSettings}
            onResetSettings={resetSettings}
            onExportSettings={exportSettings}
            onImportSettings={importSettings}
            onClearLocalStorage={clearLocalStorage}
            members={members}
            onAddMember={addMember}
            onUpdateMember={updateMember}
            onRemoveMember={removeMember}
            connected={connected}
            haUrl={config.ha_url}
            calendars={calendars}
          />
        ) : activeView === 'timer' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24 }}>
            <Timer />
          </div>
        ) : activeView === 'photos' ? (
          <PhotoFrame
            musicPlayer={music.activePlayer}
            onMusicPlay={() => music.activePlayer && music.play(music.activePlayer.entity_id)}
            onMusicPause={() => music.activePlayer && music.pause(music.activePlayer.entity_id)}
            onMusicNext={() => music.activePlayer && music.next(music.activePlayer.entity_id)}
            onMusicPrevious={() => music.activePlayer && music.previous(music.activePlayer.entity_id)}
            onMusicSetVolume={(v) => music.activePlayer && music.setVolume(v, music.activePlayer.entity_id)}
            onBack={() => setActiveView('dashboard')}
          />
        ) : (
          <>
            {/* Header */}
            <header className="beacon-header">
              <div className="header-left">
                <span className="header-family-name">{settings.familyName}</span>
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
                onEventReschedule={handleEventReschedule}
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
          </>
        )}
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

      {/* Grocery Drawer */}
      <GroceryDrawer
        list={grocery.list}
        source={grocery.source}
        loading={grocery.loading}
        expiringItems={grocery.expiringItems}
        onAddItem={grocery.addItem}
        onCheckItem={grocery.checkItem}
        onUncheckItem={grocery.uncheckItem}
        forceOpen={showGrocery}
      />
      {showGrocery && (
        <div
          className="slide-panel-backdrop"
          onClick={handleClosePanel}
        />
      )}

      {/* Now Playing Bar — shows when music is playing, hidden in photo/music views */}
      {activeView !== 'music' && activeView !== 'photos' && music.activePlayer?.state === 'playing' && (
        <NowPlayingBar
          player={music.activePlayer}
          onPlay={() => music.play(music.activePlayer!.entity_id)}
          onPause={() => music.pause(music.activePlayer!.entity_id)}
          onNext={() => music.next(music.activePlayer!.entity_id)}
          onPrevious={() => music.previous(music.activePlayer!.entity_id)}
          onSetVolume={(v) => music.setVolume(v, music.activePlayer!.entity_id)}
          onExpand={() => setActiveView('music')}
        />
      )}

      {/* Screen saver / dim mode */}
      <ScreenSaver />

      {/* Demo indicator — only show outside of add-on ingress */}
      {!connected && !window.__BEACON_CONFIG__?.ha_token && (
        <div className="demo-badge">Demo Mode</div>
      )}
    </div>
  );
}
