import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { startOfWeek, addDays, format } from 'date-fns';
import { useHomeAssistant } from './hooks/useHomeAssistant';
import { useCalendarEvents, CalendarNotSupportedError } from './hooks/useCalendarEvents';
import { useFamily } from './hooks/useFamily';
import { useWeather } from './hooks/useWeather';
import { useChores } from './hooks/useChores';
import { useChoresSync } from './hooks/useChoresSync';
import { WeekCalendar } from './components/WeekCalendar';
import { DashboardView } from './components/DashboardView';
import { AdvancedDashboard } from './components/lazy-advanced-dashboard';
import { EventModal, EventFormData } from './components/EventModal';
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
import { useHaAuth } from './hooks/useHaAuth';
import { useTheme } from './hooks/useTheme';
import { useWakeLock } from './hooks/useWakeLock';
import { useLocalCalendar } from './hooks/useLocalCalendar';
import { useDashboardTasks } from './hooks/useDashboardTasks';
import { LazyBoundary } from './components/LazyBoundary';
import { lazyNamed } from './utils/lazy-screen';
import { useSelectedDay } from './hooks/useClock';
import { getFocusMemberId, clearFocusMode, setDeviceFocusMember } from './focus';
import { CalendarEvent, resolveCalendarColor } from './types';
import { getConfig } from './config';
import { setHaKioskMode } from './utils/ha-kiosk';
import { applyFontScale } from './utils/font-scale';
import { formToPayload, movedPayload, occurrenceTarget, type EditScope, type EventPayload, type OccurrenceTarget } from './utils/calendar-edits';
import { SaveFailedNotice } from './components/SaveFailedNotice';
import { onDataChanged, watchDataChanges } from './api/data-changes';
import { FAMILY_COLLECTIONS, notifyFamilyDataChanged } from './api/family';
import { clearSensitiveCache, enterDisplay, getBeaconSession, type BeaconSession } from './api/beacon-auth';
import { ParentUnlock } from './components/ParentUnlock';
import { isAddOn } from './utils/ha-env';

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

function DashboardApp({ onEnterDisplay }: { onEnterDisplay?: (memberId: string) => Promise<void> }) {
  const auth = useHaAuth();
  const { client, connected } = useHomeAssistant();
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
    if (onEnterDisplay) return onEnterDisplay(memberId);
    setDeviceFocusMember(memberId);
    setFocusMemberId(memberId);
  }, [onEnterDisplay]);

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

  const { weather } = useWeather(client, fullAppShown, settings.weatherEntity);
  const music = useMusic(client, connected, fullAppShown, settings.musicDefaultPlayer);
  const {
    chores,
    currentCompletions,
    completeChore,
    uncompleteChore,
    isChoreDone,
  } = useChores(fullAppShown);

  // Keeps running on the Kid Display: the sync itself runs in the add-on,
  // and this status check is what shows a chore ticked in Google Tasks on
  // the child's screen within 30s.
  const {
    status: choresSyncStatus,
    runSync: runChoresSync,
    available: choresSyncAvailable,
  } = useChoresSync(settings.choresSyncEnabled);

  // What another display (or the Google Tasks sync) changes shows here
  // within seconds: chores, completions, members and routines are loaded
  // again by every screen showing them, and settings, lists and the
  // built-in calendar watch their own keys (useStoredData).
  useEffect(() => {
    const stopWatching = watchDataChanges();
    const stopFamily = onDataChanged(FAMILY_COLLECTIONS, () => notifyFamilyDataChanged());
    return () => {
      stopFamily();
      stopWatching();
    };
  }, []);

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

  // Apply theme at App level so it stays active regardless of which view is
  // shown, dark by night with Auto Dark Mode on.
  useTheme(settings.themeId, settings);

  // Settings > Display > Always-On Display
  useWakeLock(settings.alwaysOnDisplay);

  useEffect(() => {
    applyFontScale(settings.fontScale);
  }, [settings.fontScale]);

  useEffect(() => {
    setHaKioskMode(settings.hideHaHeader);
  }, [settings.hideHaHeader]);

  // Calendars turned off in Settings → Calendar. (The Calendar screen had
  // pills above it that toggled the same list; they were removed.)
  const hiddenCalendars = useMemo(
    () => new Set(settings.permanentlyHiddenCalendars),
    [settings.permanentlyHiddenCalendars],
  );

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

  // The week the Calendar screen shows (it reports it as it changes)
  const [visibleWeekStart, setVisibleWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: settings.weekStartsOn }),
  );

  // Day currently selected on the Dashboard's day view (moves on at midnight while on today)
  const [dashboardDate, setDashboardDate] = useSelectedDay();

  // The week whose events are loaded: the Calendar screen's while it's open,
  // otherwise the week of the dashboard's day, which moves on at midnight.
  // Only the Calendar screen used to set it, so a display left on the
  // dashboard kept the week it was opened in (and showed no events from the
  // next Monday on), and one back from another week on the Calendar showed
  // that week's. Kept by its time, as a new Date each render would refetch.
  const fetchWeekStartMs = (activeView === 'calendar'
    ? visibleWeekStart
    : startOfWeek(dashboardDate, { weekStartsOn: settings.weekStartsOn })).getTime();
  const fetchWeekStart = useMemo(() => new Date(fetchWeekStartMs), [fetchWeekStartMs]);

  // Helper: refetch events for a given week, with one extra day before and a
  // second week after. The extra day catches multi-day events bleeding in; the
  // extra week covers the dashboard's "This Week" column, which runs 7 days
  // past the viewed day and so can reach the day after next week's start.
  const refetchEventsForWeek = useCallback(
    async (weekStart: Date) => {
      const rangeStart = addDays(weekStart, -1);
      const rangeEnd = addDays(weekStart, 15);
      await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString());
    },
    [fetchEvents],
  );

  // Event notifications (browser + HA mobile_app), not for calendars turned
  // off in Settings (they used to remind of those too)
  useNotifications(visibleEvents, client, fullAppShown, settings.notificationMinutes);

  // Leaderboard is still a slide-over panel (not a full view); Chores is now
  // a real full-screen activeView (see PRD: dedicated chores screen).
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  // Not mounted (so not downloaded, and not fetching its data) until first opened.
  const [leaderboardOpened, setLeaderboardOpened] = useState(false);
  // The Timer screen isn't mounted until first opened either, then stays,
  // hidden behind other screens, so its timers keep counting and ring there.
  const [timerOpened, setTimerOpened] = useState(activeView === 'timer');

  // Fetch data when connected, or when the user navigates to a different week.
  useEffect(() => {
    if (!connected || !fullAppShown) return;

    const loadData = async () => {
      await fetchCalendars();
      await refetchEventsForWeek(fetchWeekStart);
    };

    loadData();

    // Refresh every 5 minutes for that week (the list of
    // calendars is asked for again once it's CALENDAR_LIST_MAX_AGE_MS old)
    const interval = setInterval(loadData, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [connected, fullAppShown, fetchCalendars, refetchEventsForWeek, fetchWeekStart]);

  // Re-fetch when calendar colors or family members change so colors update
  // immediately, without recreating the 5-minute polling interval above.
  // Colors by content: every settings reload (now whenever any setting
  // changes on any display) brings a new colors object.
  const calendarColorsKey = JSON.stringify(settings.calendarColors);
  const colorRefreshRef = useRef({ connected, fullAppShown, fetchCalendars, refetchEventsForWeek, fetchWeekStart });
  colorRefreshRef.current = { connected, fullAppShown, fetchCalendars, refetchEventsForWeek, fetchWeekStart };
  const didColorRefreshMount = useRef(false);
  useEffect(() => {
    if (!didColorRefreshMount.current) {
      didColorRefreshMount.current = true;
      return;
    }
    // Paused: the fetch above runs with the latest colors when it resumes.
    if (!colorRefreshRef.current.connected || !colorRefreshRef.current.fullAppShown) return;
    colorRefreshRef.current.fetchCalendars();
    colorRefreshRef.current.refetchEventsForWeek(colorRefreshRef.current.fetchWeekStart);
  }, [calendarColorsKey, members]);

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

      await refetchEventsForWeek(fetchWeekStart);

      handleCloseModal();
    } catch (err) {
      console.error('Failed to save event:', err);
      // Re-throw so EventModal can surface an inline error to the user
      // instead of the save silently appearing to do nothing.
      throw err;
    }
  }, [selectedEvent, createEvent, updateEvent, deleteEvent, refetchEventsForWeek, fetchWeekStart, handleCloseModal, settings.lastEventCalendar, updateSettings]);

  const handleDeleteEvent = useCallback(async (event: CalendarEvent, scope: EditScope) => {
    try {
      if (event.hasStableId === false) {
        throw new Error("This event can't be deleted — it has no stable ID from its calendar provider.");
      }
      await deleteEvent(event.calendarId, event.uid ?? event.id, occurrenceTarget(event, scope));

      await refetchEventsForWeek(fetchWeekStart);

      handleCloseModal();
    } catch (err) {
      console.error('Failed to delete event:', err);
      throw err instanceof CalendarNotSupportedError
        ? new Error('This calendar does not support deleting events.')
        : err;
    }
  }, [deleteEvent, refetchEventsForWeek, fetchWeekStart, handleCloseModal]);

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

      await refetchEventsForWeek(fetchWeekStart);
    } catch (err) {
      console.error('Failed to reschedule event:', err);
    }
  }, [updateEvent, deleteEvent, createEvent, refetchEventsForWeek, fetchWeekStart]);

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
      if (view === 'timer') setTimerOpened(true);
      setActiveView(view);
    },
    [],
  );

  const handleClosePanel = useCallback(() => {
    setShowLeaderboard(false);
  }, []);

  // The dashboard's and Calendar screen's chore checklists tick a chore for
  // one person. (Every tick used to go to the first family member, whoever
  // the chore was for: they got its pay and streak.)
  const handleToggleChore = useCallback(
    (choreId: string, memberId: string) => {
      if (isChoreDone(choreId, memberId)) {
        uncompleteChore(choreId, memberId);
      } else {
        completeChore(choreId, memberId);
      }
    },
    [isChoreDone, completeChore, uncompleteChore]
  );

  // Handle onboarding completion. After the reload, main.tsx puts the saved
  // login into the config (applySavedLogin) before the HA client starts.
  const handleOnboardingComplete = useCallback(async (haUrl: string, haToken: string) => {
    await auth.saveManualToken(haUrl, haToken);
    window.location.reload();
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
  // The server injects runtime config in ingress and standalone Docker.
  // An arbitrary embedding page is not proof of HA authentication.
  const isHaManaged = !!window.__BEACON_CONFIG__;
  if (!isHaManaged && !auth.state.isOnboarded) {
    return (
      <LazyBoundary fallback={<LoadingScreen />}>
        <OnboardingView onComplete={handleOnboardingComplete} />
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
    <div className={`beacon beacon--sidebar-${sidebarPos} ${showNowPlaying ? 'beacon--now-playing' : ''}`}>
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
              choreCompletions={currentCompletions}
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
              showSeconds={settings.showSeconds}
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
              onNavigateTimer={() => handleChangeView('timer')}
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
              players={music.players}
              selectedPlayerId={music.selectedPlayerId}
              onPlay={music.play}
              onPause={music.pause}
              onNext={music.next}
              onPrevious={music.previous}
              onSetVolume={music.setVolume}
              onSeek={music.seek}
              onStepVolume={music.stepVolume}
              onSetShuffle={music.setShuffle}
              onSetRepeat={music.setRepeat}
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
          null // shown below, and kept once opened
        ) : activeView === 'weather' ? (
          <LazyBoundary>
            <WeatherView />
          </LazyBoundary>
        ) : activeView === 'photos' ? (
          <LazyBoundary>
            <PhotoFrame
              intervalSeconds={settings.photoInterval}
              transition={settings.photoTransition}
              timeFormat={settings.timeFormat}
              musicPlayer={music.activePlayer}
              onMusicPlay={() => music.activePlayer && music.play(music.activePlayer.entity_id)}
              onMusicPause={() => music.activePlayer && music.pause(music.activePlayer.entity_id)}
              onMusicNext={() => music.activePlayer && music.next(music.activePlayer.entity_id)}
              onMusicPrevious={() => music.activePlayer && music.previous(music.activePlayer.entity_id)}
              onMusicSetVolume={(v) => music.activePlayer && music.setVolume(v, music.activePlayer.entity_id)}
              onMusicToggleMute={(m) => music.activePlayer && music.setMuted(m, music.activePlayer.entity_id)}
              onBack={() => setActiveView('dashboard')}
            />
          </LazyBoundary>
        ) : (
          <>
            {/* A note above the calendar while HA is unreachable. (The
                header and calendar pills that sat here were removed.) */}
            {!connected && (
              <div className="calendar-status connection-status" role="status">
                <span className="connection-dot" />
                Connecting...
              </div>
            )}

            {/* Calendar Body — two-column on desktop */}
            <div className="beacon-body beacon-body--two-col">
              <div className="beacon-body-calendar">
                <WeekCalendar
                  events={events}
                  weekStartsOn={settings.weekStartsOn}
                  timeFormat={settings.timeFormat}
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
                choreCompletions={currentCompletions}
                onToggleChore={handleToggleChore}
                todoItems={dashboardTasks.items}
                onToggleTodo={dashboardTasks.toggleItem}
                members={members}
                timeFormat={settings.timeFormat}
              />
            </div>

            {/* Omni-Add FAB */}
            <OmniAdd
              onAddEvent={handleAddEvent}
              onAddGroceryItem={() => setActiveView('grocery')}
              onAddChore={() => handleChangeView('chores')}
              onNavigateTimer={() => handleChangeView('timer')}
              sidebarPosition={sidebarPos}
            />
          </>
        )}
        {timerOpened && (
          <div
            style={{ display: activeView === 'timer' ? 'flex' : 'none', height: '100%' }}
          >
            <LazyBoundary>
              <Timer shown={activeView === 'timer'} onShow={() => handleChangeView('timer')} />
            </LazyBoundary>
          </div>
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
          onToggleMute={(m) => music.setMuted(m, music.activePlayer!.entity_id)}
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
        timeFormat={settings.timeFormat}
      />

      {/* Demo indicator — only show outside of add-on ingress */}
      {!connected && !isHaManaged && (
        <div className="demo-badge">Demo Mode</div>
      )}
    </div>
  );
}

function FocusShell({ memberId, onExit }: { memberId: string; onExit: () => void }) {
  const { settings } = useSettings();
  useChoresSync(settings.choresSyncEnabled);
  useEffect(() => {
    const stopWatching = watchDataChanges();
    const stopFamily = onDataChanged(FAMILY_COLLECTIONS, () => notifyFamilyDataChanged());
    return () => {
      stopFamily();
      stopWatching();
    };
  }, []);
  return (
    <LazyBoundary fallback={<LoadingScreen />}>
      <FocusView memberId={memberId} settings={settings} onExit={onExit} />
    </LazyBoundary>
  );
}

export function App() {
  const [focusId, setFocusId] = useState<string | null>(() => getFocusMemberId());
  const [session, setSession] = useState<BeaconSession | null>(null);
  const clearedDisplayCache = useRef<string | null>(null);
  const [authorizationError, setAuthorizationError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!isAddOn()) return;
    let active = true;
    const refresh = async () => {
      try {
        const next = await getBeaconSession(focusId);
        if (!active) return;
        if (next.role === 'display' && clearedDisplayCache.current !== next.memberId) {
          clearSensitiveCache();
          clearedDisplayCache.current = next.memberId;
        } else if (next.role !== 'display') {
          clearedDisplayCache.current = null;
        }
        setSession(next);
        setAuthorizationError('');
      } catch (err) {
        if (!active) return;
        console.error('Family authorization failed:', err);
        setAuthorizationError(err instanceof Error ? err.message : 'Cannot verify Family session');
        setSession(null);
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [focusId, retry]);

  if (!isAddOn()) return <DashboardApp />;
  if (authorizationError) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <p role="alert">{authorizationError}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
          {focusId && (
            <button type="button" onClick={() => { clearFocusMode(); setFocusId(null); }}>
              Return to parent access
            </button>
          )}
        </div>
      </main>
    );
  }
  if (!session) return <LoadingScreen />;

  if (focusId && session.role === 'display' && session.memberId === focusId) {
    return <FocusShell memberId={focusId} onExit={() => {
      clearFocusMode();
      setFocusId(null);
      setSession({ role: 'parent' });
    }} />;
  }

  if (focusId && session.role === 'none' && session.requiresPin) {
    return <ParentUnlock mode="display" memberId={focusId} onUnlocked={setSession} />;
  }

  if (session.role !== 'parent') {
    return <ParentUnlock mode="parent" onUnlocked={setSession} />;
  }

  const startDisplay = async (memberId: string) => {
    clearSensitiveCache();
    clearedDisplayCache.current = memberId;
    const next = await enterDisplay(memberId);
    if (next.role !== 'display' || next.memberId !== memberId) {
      throw new Error('Family did not authorize this display');
    }
    setDeviceFocusMember(memberId);
    setFocusId(memberId);
    setSession(next);
  };
  return <DashboardApp onEnterDisplay={startDisplay} />;
}
