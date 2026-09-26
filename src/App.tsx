import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { startOfWeek, addDays, format } from 'date-fns';
import { useHomeAssistant } from './hooks/useHomeAssistant';
import { useCalendarEvents, CalendarNotSupportedError } from './hooks/useCalendarEvents';
import { useFamily } from './hooks/useFamily';
import { useWeather } from './hooks/useWeather';
import { useChores } from './hooks/useChores';
import { useChoresSync } from './hooks/useChoresSync';
import { Clock } from './components/Clock';
import { WeekCalendar } from './components/WeekCalendar';
import { DashboardView } from './components/DashboardView';
import { AdvancedDashboard } from './components/lazy-advanced-dashboard';
import { EventModal, EventFormData } from './components/EventModal';
import { FamilyFilter } from './components/FamilyFilter';
import { useSettings } from './hooks/useSettings';
import { ChoresView } from './components/ChoresView';
import { Sidebar, SidebarView } from './components/Sidebar';
import { NowPlayingBar } from './components/NowPlayingBar';
import { useMusic } from './hooks/useMusic';
import { useNotifications } from './hooks/useNotifications';
import { ScreenSaver } from './components/ScreenSaver';
import { GroceryView } from './components/GroceryView';
import { OmniAdd } from './components/OmniAdd';
import { CalendarSidebar } from './components/CalendarSidebar';
import { useIngressDetect } from './hooks/useIngressDetect';
import { useHaAuth } from './hooks/useHaAuth';
import { useTheme } from './hooks/useTheme';
import { useLocalCalendar } from './hooks/useLocalCalendar';
import { useDashboardTasks } from './hooks/useDashboardTasks';
import { LazyBoundary } from './components/LazyBoundary';
import { lazyNamed } from './utils/lazy-screen';
import { useSelectedDay } from './hooks/useClock';
import { getFocusMemberId, clearFocusMode, setDeviceFocusMember } from './focus';
import { CalendarEvent, resolveCalendarColor } from './types';
import { getConfig, patchConfig } from './config';
import { setHaKioskMode } from './utils/ha-kiosk';
import { applyFontScale } from './utils/font-scale';
import { formToPayload, movedPayload, occurrenceTarget, type EditScope, type EventPayload, type OccurrenceTarget } from './utils/calendar-edits';
import { SaveFailedNotice } from './components/SaveFailedNotice';

const config = getConfig();

// Screens that aren't needed to show the dashboard are downloaded the first
// time they're opened, which keeps the startup download small.
const SettingsView = lazyNamed(() => import('./components/SettingsView'), 'SettingsView');
const MusicView = lazyNamed(() => import('./components/MusicView'), 'MusicView');
const PhotoFrame = lazyNamed(() => import('./components/PhotoFrame'), 'PhotoFrame');
const WeatherView = lazyNamed(() => import('./components/WeatherView'), 'WeatherView');
const Timer = lazyNamed(() => import('./components/Timer'), 'Timer');
const Leaderboard = lazyNamed(() => import('./components/Leaderboard'), 'Leaderboard');
const OnboardingView = lazyNamed(() => import('./components/OnboardingView'), 'default');
const FocusView = lazyNamed(() => import('./components/focus/FocusView'), 'FocusView');

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
    </div>
  );
}

/**
 * The leaderboard is downloaded the first time it's opened. It mounts closed
 * and opens right after, so it still slides in that first time.
 */
function LeaderboardPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Make the browser lay the panel out closed before it opens, so the
    // opening is animated rather than the panel just appearing.
    void document.body.offsetWidth;
    setReady(true);
  }, []);
  return <Leaderboard open={open && ready} onClose={onClose} />;
}

export function App() {
  const auth = useHaAuth();
  const { client, connected } = useHomeAssistant();
  const { isIngress, compact } = useIngressDetect();
  const {
    settings,
    updateSettings,
    resetSettings,
    exportSettings,
    importSettings,
    clearLocalStorage,
  } = useSettings();

  const {
    members,
    addMember,
    updateMember,
    removeMember,
  } = useFamily();

  // Kid Display (focus) mode — URL param wins, then device-local storage
  const [focusMemberId, setFocusMemberId] = useState<string | null>(() => getFocusMemberId());
  const focusMember = focusMemberId ? members.find((m) => m.id === focusMemberId) : undefined;

  // Escape hatch: if a display is assigned to a member but the family list
  // stays empty (fresh device, stale assignment), stop waiting after 10s and
  // fall through to the invalid-member banner instead of loading forever.
  const [focusLoadTimedOut, setFocusLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!focusMemberId || members.length > 0) {
      setFocusLoadTimedOut(false);
      return;
    }
    const t = setTimeout(() => setFocusLoadTimedOut(true), 10_000);
    return () => clearTimeout(t);
  }, [focusMemberId, members.length]);

  const focusInvalid = !!focusMemberId && !focusMember && (members.length > 0 || focusLoadTimedOut);

  const handleExitFocus = useCallback(() => {
    clearFocusMode();
    setFocusMemberId(null);
  }, []);

  const handleEnterFocusMode = useCallback((memberId: string) => {
    setDeviceFocusMember(memberId);
    setFocusMemberId(memberId);
  }, []);

  // The Kid Display (and its loading screen) replaces the whole app, so the
  // app's own refreshes — calendar, weather, music, tasks, chores — pause
  // while it's up and catch up as soon as it closes.
  const fullAppShown = !focusMemberId || focusInvalid;

  const {
    calendars: haCalendars,
    events: haEvents,
    fetchCalendars,
    fetchEvents,
    createEvent: createHaEvent,
    updateEvent: updateHaEvent,
    deleteEvent: deleteHaEvent,
  } = useCalendarEvents(connected, {
    calendarColors: settings.calendarColors,
    members,
  }, client);

  const localCal = useLocalCalendar();

  // Resolve the local calendar's color the same way everywhere (user override or indigo default).
  const localCalendarColor = resolveCalendarColor(localCal.calendar.id, 0, {
    calendarColors: settings.calendarColors,
    defaultColor: localCal.calendar.color,
  });

  // Merge HA + local calendars and events
  const calendars = useMemo(
    () => [{ ...localCal.calendar, color: localCalendarColor }, ...haCalendars],
    [localCal.calendar, localCalendarColor, haCalendars],
  );
  const events = useMemo(
    () => [
      ...localCal.events.map((ev) => ({ ...ev, color: localCalendarColor })),
      ...haEvents,
    ].sort((a, b) => a.start.localeCompare(b.start)),
    [localCal.events, localCalendarColor, haEvents],
  );

  // Route create/update/delete to local or HA based on calendar ID
  const createEvent = useCallback(async (calendarId: string, eventData: Parameters<typeof createHaEvent>[1]) => {
    if (calendarId === localCal.calendar.id) {
      localCal.createEvent(eventData);
    } else {
      await createHaEvent(calendarId, eventData);
    }
  }, [localCal, createHaEvent]);

  // `target` picks occurrences of a repeating HA event (the built-in
  // calendar has no repeating events).
  const updateEvent = useCallback(async (calendarId: string, uid: string, eventData: EventPayload, target?: OccurrenceTarget) => {
    if (calendarId === localCal.calendar.id) {
      localCal.updateEvent(uid, eventData);
    } else {
      await updateHaEvent(calendarId, uid, eventData, target);
    }
  }, [localCal, updateHaEvent]);

  const deleteEvent = useCallback(async (calendarId: string, uid: string, target?: OccurrenceTarget) => {
    if (calendarId === localCal.calendar.id) {
      localCal.deleteEvent(uid);
    } else {
      await deleteHaEvent(calendarId, uid, target);
    }
  }, [localCal, deleteHaEvent]);

  const { weather } = useWeather(client, fullAppShown);
  const music = useMusic(client, connected, fullAppShown);
  const {
    chores,
    currentCompletions,
    completeChore,
    uncompleteChore,
  } = useChores(fullAppShown);

  // Keeps running on the Kid Display: the sync itself runs in the add-on,
  // and this status check is what shows a chore ticked in Google Tasks on
  // the child's screen within 30s.
  const {
    status: choresSyncStatus,
    runSync: runChoresSync,
    available: choresSyncAvailable,
  } = useChoresSync(settings.choresSyncEnabled);

  // Lists mirrored as chores by the Google Tasks sync already show on the
  // Chores screen, so keep them out of the Tasks screen and dashboard.
  const choreSyncListKey = settings.choresSyncEnabled
    ? Object.values(settings.choresSyncListByMember).filter(Boolean).sort().join(',')
    : '';
  const choreSyncListIds = useMemo(
    () => (choreSyncListKey ? choreSyncListKey.split(',') : []),
    [choreSyncListKey],
  );

  const dashboardTasks = useDashboardTasks(connected, settings.groceryListIds, settings.hideLocalTaskList, choreSyncListIds, fullAppShown);

  // Apply theme at App level so it stays active regardless of which view is shown
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(settings.themeId);
  }, [settings.themeId, setTheme]);

  useEffect(() => {
    applyFontScale(settings.fontScale);
  }, [settings.fontScale]);

  useEffect(() => {
    setHaKioskMode(settings.hideHaHeader);
  }, [settings.hideHaHeader]);

  // Calendar-view visibility state. Seeded from the Settings-level
  // permanentlyHiddenCalendars list (source of truth) so calendars disabled
  // in Settings → Calendar are hidden here too, and kept in sync whenever
  // that setting changes (e.g. edited in another tab/session) rather than
  // only on first mount.
  const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(
    () => new Set(settings.permanentlyHiddenCalendars),
  );

  useEffect(() => {
    setHiddenCalendars(new Set(settings.permanentlyHiddenCalendars));
  }, [settings.permanentlyHiddenCalendars]);

  const visibleEvents = useMemo(
    () => events.filter((event) => !hiddenCalendars.has(event.calendarId)),
    [events, hiddenCalendars],
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [prefillTime, setPrefillTime] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<SidebarView>(
    (settings.defaultView as SidebarView) || 'dashboard'
  );

  // While stored credentials load, start downloading the screen this device
  // opens on if it's one of the on-demand ones, so it's ready sooner.
  useEffect(() => {
    if (focusMemberId) FocusView.preload();
    else if (activeView === 'dashboard' && settings.advancedDashboard) AdvancedDashboard.preload();
    else if (activeView === 'music') MusicView.preload();
    else if (activeView === 'photos') PhotoFrame.preload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the screen shown at startup
  }, []);

  // Visible week shown by the calendar (drives event fetch window)
  const [visibleWeekStart, setVisibleWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: settings.weekStartsOn }),
  );

  // Day currently selected on the Dashboard's day view (moves on at midnight while on today)
  const [dashboardDate, setDashboardDate] = useSelectedDay();

  // Helper: refetch events for a given week, with one extra day on either side
  // so multi-day events that bleed in/out of the visible week still render.
  const refetchEventsForWeek = useCallback(
    async (weekStart: Date) => {
      const rangeStart = addDays(weekStart, -1);
      const rangeEnd = addDays(weekStart, 8);
      await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString());
    },
    [fetchEvents],
  );

  // Event notifications (browser + HA mobile_app)
  useNotifications(events, client, fullAppShown, settings.notificationMinutes);

  // Leaderboard is still a slide-over panel (not a full view); Chores is now
  // a real full-screen activeView (see PRD: dedicated chores screen).
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  // Not mounted (so not downloaded, and not fetching its data) until first opened.
  const [leaderboardOpened, setLeaderboardOpened] = useState(false);

  // Fetch data when connected, or when the user navigates to a different week.
  useEffect(() => {
    if (!connected || !fullAppShown) return;

    const loadData = async () => {
      await fetchCalendars();
      await refetchEventsForWeek(visibleWeekStart);
    };

    loadData();

    // Refresh every 5 minutes for the currently-visible week (the list of
    // calendars is asked for again once it's CALENDAR_LIST_MAX_AGE_MS old)
    const interval = setInterval(loadData, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [connected, fullAppShown, fetchCalendars, refetchEventsForWeek, visibleWeekStart]);

  // Re-fetch when calendar colors or family members change so colors update
  // immediately, without recreating the 5-minute polling interval above.
  const colorRefreshRef = useRef({ connected, fullAppShown, fetchCalendars, refetchEventsForWeek, visibleWeekStart });
  colorRefreshRef.current = { connected, fullAppShown, fetchCalendars, refetchEventsForWeek, visibleWeekStart };
  const didColorRefreshMount = useRef(false);
  useEffect(() => {
    if (!didColorRefreshMount.current) {
      didColorRefreshMount.current = true;
      return;
    }
    // Paused: the fetch above runs with the latest colors when it resumes.
    if (!colorRefreshRef.current.connected || !colorRefreshRef.current.fullAppShown) return;
    colorRefreshRef.current.fetchCalendars();
    colorRefreshRef.current.refetchEventsForWeek(colorRefreshRef.current.visibleWeekStart);
  }, [settings.calendarColors, members]);

  const handleToggleCalendar = useCallback((calendarId: string) => {
    setHiddenCalendars(prev => {
      const next = new Set(prev);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      // Persist to Settings so the Calendar-view selection survives
      // navigation/remount and reload — settings.permanentlyHiddenCalendars
      // is the single source of truth for calendar visibility.
      updateSettings({ permanentlyHiddenCalendars: Array.from(next) });
      return next;
    });
  }, [updateSettings]);

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
    const eventData = formToPayload(data, selectedEvent);

    try {
      if (selectedEvent) {
        if (selectedEvent.hasStableId === false) {
          throw new Error("This event can't be edited — it has no stable ID from its calendar provider.");
        }
        const uid = selectedEvent.uid ?? selectedEvent.id;
        const target = occurrenceTarget(selectedEvent, data.scope);
        // HA's update can't move an event to another calendar, and many
        // calendars (Google via HA, several CalDAV backends) can't update
        // events at all: both are done as create + delete. Create first, so
        // a failure leaves the original where it was.
        const replace = async () => {
          await createEvent(calendarId, eventData);
          await deleteEvent(selectedEvent.calendarId, uid, target);
        };
        if (calendarId !== selectedEvent.calendarId) {
          await replace();
        } else {
          try {
            await updateEvent(calendarId, uid, eventData, target);
          } catch (err) {
            if (!(err instanceof CalendarNotSupportedError)) throw err;
            await replace();
          }
        }
      } else {
        await createEvent(calendarId, eventData);
        // With no default calendar set, the next new event starts here.
        if (calendarId !== settings.lastEventCalendar) updateSettings({ lastEventCalendar: calendarId });
      }

      await refetchEventsForWeek(visibleWeekStart);

      handleCloseModal();
    } catch (err) {
      console.error('Failed to save event:', err);
      // Re-throw so EventModal can surface an inline error to the user
      // instead of the save silently appearing to do nothing.
      throw err;
    }
  }, [selectedEvent, createEvent, updateEvent, deleteEvent, refetchEventsForWeek, visibleWeekStart, handleCloseModal, settings.lastEventCalendar, updateSettings]);

  const handleDeleteEvent = useCallback(async (event: CalendarEvent, scope: EditScope) => {
    try {
      if (event.hasStableId === false) {
        throw new Error("This event can't be deleted — it has no stable ID from its calendar provider.");
      }
      await deleteEvent(event.calendarId, event.uid ?? event.id, occurrenceTarget(event, scope));

      await refetchEventsForWeek(visibleWeekStart);

      handleCloseModal();
    } catch (err) {
      console.error('Failed to delete event:', err);
      throw err instanceof CalendarNotSupportedError
        ? new Error('This calendar does not support deleting events.')
        : err;
    }
  }, [deleteEvent, refetchEventsForWeek, visibleWeekStart, handleCloseModal]);

  const handleEventReschedule = useCallback(async (event: CalendarEvent, newDate: string, newHour: number) => {
    try {
      if (event.hasStableId === false) {
        throw new Error('it has no stable ID from its calendar provider');
      }
      const payload = movedPayload(event, newDate, newHour);
      const uid = event.uid ?? event.id;
      // A dragged occurrence of a repeating event moves on its own.
      const target = occurrenceTarget(event, 'this');

      try {
        await updateEvent(event.calendarId, uid, payload, target);
      } catch (err) {
        // Same fallback as handleSaveEvent: calendars without update
        // support need create + delete, creating first so nothing is lost.
        if (!(err instanceof CalendarNotSupportedError)) throw err;
        await createEvent(event.calendarId, payload);
        await deleteEvent(event.calendarId, uid, target);
      }

      await refetchEventsForWeek(visibleWeekStart);
    } catch (err) {
      console.error('Failed to reschedule event:', err);
    }
  }, [updateEvent, deleteEvent, createEvent, refetchEventsForWeek, visibleWeekStart]);

  const handleAddEvent = useCallback(() => {
    setSelectedEvent(null);
    // Default new events to the day currently selected on the dashboard.
    setPrefillDate(activeView === 'dashboard' ? format(dashboardDate, 'yyyy-MM-dd') : null);
    setPrefillTime(null);
    setShowModal(true);
  }, [activeView, dashboardDate]);

  const handleChangeView = useCallback(
    (view: SidebarView) => {
      // Leaderboard opens as an overlay, doesn't change the main view.
      // Chores is a real activeView now (dedicated full-screen view).
      if (view === 'leaderboard') {
        setLeaderboardOpened(true);
        setShowLeaderboard(true);
        return;
      }
      // All other views: close any open panel and switch view
      setShowLeaderboard(false);
      setActiveView(view);
    },
    [],
  );

  const handleClosePanel = useCallback(() => {
    setShowLeaderboard(false);
  }, []);

  // Build a set of chore IDs completed today (for the dashboard checklist).
  // We use the first member for now; a member-picker could be added later.
  const firstMemberId = members.length > 0 ? members[0].id : '__none__';
  const completedChoreIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of currentCompletions) {
      if (c.member_id === firstMemberId) {
        ids.add(c.chore_id);
      }
    }
    return ids;
  }, [currentCompletions, firstMemberId]);

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

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback(async (haUrl: string, haToken: string) => {
    await auth.saveManualToken(haUrl, haToken);
    patchConfig({ ha_url: haUrl, ha_token: haToken });
    window.location.reload();
  }, [auth]);

  const handleOAuthStart = useCallback((haUrl: string) => {
    auth.startOAuth(haUrl);
  }, [auth]);

  // Keyboard shortcuts for quick view switching
  useEffect(() => {
    const viewMap: Record<string, SidebarView> = {
      '1': 'dashboard',
      '2': 'calendar',
      '3': 'chores',
      '4': 'grocery',
      '5': 'tasks',
      '6': 'leaderboard',
      '7': 'music',
      '8': 'photos',
      '9': 'timer',
      '0': 'settings',
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const view = viewMap[e.key];
      if (view) {
        e.preventDefault();
        // Same as tapping the sidebar, so 6 opens the leaderboard panel.
        handleChangeView(view);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleChangeView]);

  const sidebarPos = settings.sidebarPosition || 'left';
  const showNowPlaying = activeView !== 'music' && activeView !== 'photos' && music.activePlayer?.state === 'playing';

  // Show loading screen while checking stored credentials
  if (auth.state.loading) {
    return <LoadingScreen />;
  }

  // Show onboarding ONLY when running as a standalone app with no HA connection configured.
  // Skip if: __BEACON_CONFIG__ exists (add-on injected it), or env token set, or already onboarded,
  // or running in an iframe (HA ingress), or URL has /ingress/ path.
  const isHaManaged = !!(
    window.__BEACON_CONFIG__ ||
    import.meta.env.VITE_HA_TOKEN ||
    window !== window.parent ||
    window.location.pathname.includes('/ingress/')
  );
  if (!isHaManaged && !auth.state.isOnboarded) {
    return (
      <LazyBoundary fallback={<LoadingScreen />}>
        <OnboardingView
          onComplete={handleOnboardingComplete}
          onOAuthStart={handleOAuthStart}
        />
      </LazyBoundary>
    );
  }

  // Kid Display mode: replace the entire shell (same pattern as onboarding)
  if (focusMember) {
    return (
      <LazyBoundary fallback={<LoadingScreen />}>
        <FocusView
          memberId={focusMember.id}
          settings={settings}
          onExit={handleExitFocus}
        />
      </LazyBoundary>
    );
  }

  // Focus member requested but members not loaded yet (fresh device cache):
  // hold on a lightweight loading screen instead of flashing the full app.
  if (focusMemberId && members.length === 0 && !focusLoadTimedOut) {
    return <LoadingScreen />;
  }

  return (
    <div className={`beacon beacon--sidebar-${sidebarPos} ${isIngress ? 'beacon--ingress' : ''} ${compact ? 'beacon--compact' : ''} ${showNowPlaying ? 'beacon--now-playing' : ''}`}>
      {focusInvalid && (
        <div className="focus-invalid-banner">
          Kid display member not found — showing the full app.
          <button type="button" className="settings-btn" onClick={handleExitFocus}>
            Dismiss
          </button>
        </div>
      )}
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onChangeView={handleChangeView}
        position={sidebarPos}
      />

      {/* Main content area */}
      <div className="beacon-main">
        {activeView === 'dashboard' ? (
          <>
            <DashboardView
              events={visibleEvents}
              weather={weather}
              chores={settings.choresEnabled ? chores : []}
              completedChoreIds={completedChoreIds}
              onToggleChore={handleToggleChore}
              todoItems={dashboardTasks.items}
              onToggleTodo={dashboardTasks.toggleItem}
              onWeatherClick={() => setActiveView('weather')}
              onEventClick={handleEventClick}
              members={members}
              taskmateUsers={dashboardTasks.users}
              layout={settings.dashboardLayout}
              advancedDashboard={settings.advancedDashboard}
              timeFormat={settings.timeFormat}
              selectedDate={dashboardDate}
              onSelectedDateChange={setDashboardDate}
              defaultShoppingList={
                settings.shoppingEntity || settings.defaultGroceryList || settings.groceryListIds[0] || ''
              }
            />
            <OmniAdd
              onAddEvent={handleAddEvent}
              onAddGroceryItem={() => setActiveView('grocery')}
              onAddChore={() => handleChangeView('chores')}
              onNavigateTimer={() => setActiveView('timer')}
              sidebarPosition={sidebarPos}
            />
          </>
        ) : activeView === 'chores' ? (
          settings.choresEnabled ? (
            <ChoresView />
          ) : (
            <div className="chores-empty" style={{ padding: 48 }}>
              Chores are disabled. Enable them in Settings → Chores to use this screen.
            </div>
          )
        ) : activeView === 'music' ? (
          <LazyBoundary>
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
          </LazyBoundary>
        ) : activeView === 'settings' ? (
          <LazyBoundary>
            <SettingsView
              settings={settings}
              onUpdateSettings={updateSettings}
              onResetSettings={resetSettings}
              onRunChoresSync={choresSyncAvailable ? runChoresSync : undefined}
              choresSyncStatus={choresSyncStatus}
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
              onEnterFocusMode={handleEnterFocusMode}
            />
          </LazyBoundary>
        ) : activeView === 'grocery' ? (
          // Separate keys: otherwise React keeps one GroceryView across
          // Shopping ↔ To-Do, along with the other screen's selected list.
          <GroceryView key="grocery" defaultListId={settings.defaultGroceryList || undefined} mode="grocery" groceryListIds={settings.groceryListIds} hideLocalList={settings.hideLocalGroceryList} hiddenListIds={choreSyncListIds} />
        ) : activeView === 'tasks' ? (
          <GroceryView key="tasks" mode="tasks" groceryListIds={settings.groceryListIds} hideLocalList={settings.hideLocalTaskList} hiddenListIds={choreSyncListIds} />
        ) : activeView === 'timer' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24 }}>
            <LazyBoundary>
              <Timer />
            </LazyBoundary>
          </div>
        ) : activeView === 'weather' ? (
          <LazyBoundary>
            <WeatherView />
          </LazyBoundary>
        ) : activeView === 'photos' ? (
          <LazyBoundary>
            <PhotoFrame
              musicPlayer={music.activePlayer}
              onMusicPlay={() => music.activePlayer && music.play(music.activePlayer.entity_id)}
              onMusicPause={() => music.activePlayer && music.pause(music.activePlayer.entity_id)}
              onMusicNext={() => music.activePlayer && music.next(music.activePlayer.entity_id)}
              onMusicPrevious={() => music.activePlayer && music.previous(music.activePlayer.entity_id)}
              onMusicSetVolume={(v) => music.activePlayer && music.setVolume(v, music.activePlayer.entity_id)}
              onBack={() => setActiveView('dashboard')}
            />
          </LazyBoundary>
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

            {/* Calendar Body — two-column on desktop */}
            <div className="beacon-body beacon-body--two-col">
              <div className="beacon-body-calendar">
                <WeekCalendar
                  events={events}
                  weekStartsOn={settings.weekStartsOn}
                  hiddenCalendars={hiddenCalendars}
                  onEventClick={handleEventClick}
                  onSlotClick={handleSlotClick}
                  onEventReschedule={handleEventReschedule}
                  onVisibleWeekChange={setVisibleWeekStart}
                />
              </div>
              <CalendarSidebar
                events={visibleEvents}
                chores={settings.choresEnabled ? chores : []}
                completedChoreIds={completedChoreIds}
                onToggleChore={handleToggleChore}
                todoItems={dashboardTasks.items}
                onToggleTodo={dashboardTasks.toggleItem}
                members={members}
              />
            </div>

            {/* Omni-Add FAB */}
            <OmniAdd
              onAddEvent={handleAddEvent}
              onAddGroceryItem={() => setActiveView('grocery')}
              onAddChore={() => handleChangeView('chores')}
              onNavigateTimer={() => setActiveView('timer')}
              sidebarPosition={sidebarPos}
            />
          </>
        )}
      </div>

      {/* Event Modal */}
      {showModal && (
        <EventModal
          event={selectedEvent}
          calendars={calendars}
          defaultCalendarId={settings.defaultCalendar || settings.lastEventCalendar}
          defaultDurationMinutes={settings.defaultEventDuration}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={handleCloseModal}
          prefillDate={prefillDate}
          prefillTime={prefillTime}
        />
      )}

      {/* Leaderboard Slide Panel */}
      {leaderboardOpened && (
        <LazyBoundary fallback={null}>
          <LeaderboardPanel open={showLeaderboard} onClose={handleClosePanel} />
        </LazyBoundary>
      )}
      {showLeaderboard && (
        <div
          className="slide-panel-backdrop"
          onClick={handleClosePanel}
        />
      )}

      {/* GroceryView is now rendered as a full view above */}

      {/* Now Playing Bar — shows when music is playing, hidden in photo/music views */}
      {showNowPlaying && (
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

      <SaveFailedNotice />

      {/* Screen saver / dim mode */}
      <ScreenSaver
        enabled={settings.screenSaverEnabled}
        dimTimeoutMin={settings.dimTimeout}
        screenSaverTimeoutMin={settings.screenSaverTimeout}
        showPhotos={settings.screenSaverShowPhotos}
        photoIntervalSeconds={settings.photoInterval}
      />

      {/* Demo indicator — only show outside of add-on ingress */}
      {!connected && !isHaManaged && (
        <div className="demo-badge">Demo Mode</div>
      )}
    </div>
  );
}
