import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { startOfWeek, startOfDay, addDays, format } from 'date-fns';
import { useHomeAssistant } from './hooks/useHomeAssistant';
import { useCalendarEvents, CalendarNotSupportedError } from './hooks/useCalendarEvents';
import { useEnsureEventRange } from './hooks/useEnsureEventRange';
import { rangesForView } from './utils/event-fetch-range';
import { useFamily } from './hooks/useFamily';
import { useWeather } from './hooks/useWeather';
import { useChores } from './hooks/useChores';
import { useChorePrivileges } from './hooks/useChorePrivileges';
import { Clock } from './components/Clock';
import { WeekCalendar } from './components/WeekCalendar';
import { MonthCalendar } from './components/MonthCalendar';
import { DashboardView } from './components/DashboardView';
import { EventModal, EventFormData } from './components/EventModal';
import { FamilyFilter } from './components/FamilyFilter';
import { SettingsView } from './components/SettingsView';
import { readStoredCalendarLayout, useSettings } from './hooks/useSettings';
import { useAppliedFonts } from './hooks/useAppliedFonts';
import { ChoresView } from './components/ChoresView';
import { Leaderboard } from './components/Leaderboard';
import { Sidebar, SidebarView } from './components/Sidebar';
import { MusicView } from './components/MusicView';
import { PhotoFrame } from './components/PhotoFrame';
import { NowPlayingBar } from './components/NowPlayingBar';
import { useMusic } from './hooks/useMusic';
import { useNotifications } from './hooks/useNotifications';
import { ScreenSaver } from './components/ScreenSaver';
import { GroceryView } from './components/GroceryView';
import { OmniAdd } from './components/OmniAdd';
import { VoiceAssist } from './components/VoiceAssist';
import { MagicImportModal } from './components/MagicImportModal';
import { CalendarSidebar } from './components/CalendarSidebar';
import { Timer } from './components/Timer';
import { WeatherView } from './components/WeatherView';
import { useIngressDetect } from './hooks/useIngressDetect';
import { useHaAuth } from './hooks/useHaAuth';
import { useTheme } from './hooks/useTheme';
import { useLocalCalendar } from './hooks/useLocalCalendar';
import { useDashboardTasks } from './hooks/useDashboardTasks';
import OnboardingView from './components/OnboardingView';
import { FocusView } from './components/focus/FocusView';
import { getFocusMemberId, clearFocusMode, setDeviceFocusMember } from './focus';
import { CalendarEvent, resolveCalendarColor, normalizeCalendarLayout, type CalendarLayout } from './types';
import { buildMonthGrid } from './utils/month-grid';
import { getConfig, patchConfig } from './config';
import { I18nContext, createI18n } from './i18n';
import { HiddenCornerGesture } from './components/HiddenCornerGesture';
import { kioskHotCorner, kioskNavVisible, shouldOfferKioskGesture } from './display/hidden-gesture';
import { DEMO_CALENDARS, DEMO_EVENTS } from './demo/fixtures';
import { demoInitialView } from './demo/location';
import { normalizeNavigateView } from './voice/assist';

const config = getConfig();

export function App() {
  const auth = useHaAuth();
  const { client, connected } = useHomeAssistant();
  const { isIngress, compact } = useIngressDetect();
  const {
    settings,
    loaded: settingsLoaded,
    updateSettings,
    resetSettings,
    exportSettings,
    importSettings,
    clearLocalStorage,
  } = useSettings();
  const fontStatus = useAppliedFonts(settings.headingFont, settings.bodyFont);

  const i18n = useMemo(() => createI18n(settings.locale), [settings.locale]);
  const { t } = i18n;

  const {
    members,
    loaded: familyLoaded,
    addMember,
    updateMember,
    removeMember,
  } = useFamily();

  const {
    calendars: haCalendars,
    events: haEvents,
    loadedRanges,
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

  const demoMode = import.meta.env.VITE_DEMO === 'true';

  // Merge HA + local calendars and events. The screenshot build substitutes
  // the fictional Rivera calendars so each family column has its own color.
  const calendars = useMemo(
    () => (demoMode
      ? DEMO_CALENDARS
      : [{ ...localCal.calendar, color: localCalendarColor }, ...haCalendars]),
    [demoMode, localCal.calendar, localCalendarColor, haCalendars],
  );
  const events = useMemo(
    () => (demoMode
      ? DEMO_EVENTS
      : [
          ...localCal.events.map((ev) => ({ ...ev, color: localCalendarColor })),
          ...haEvents,
        ].sort((a, b) => a.start.localeCompare(b.start))),
    [demoMode, localCal.events, localCalendarColor, haEvents],
  );

  // Route create/update/delete to local or HA based on calendar ID
  const createEvent = useCallback(async (calendarId: string, eventData: Parameters<typeof createHaEvent>[1]) => {
    if (calendarId === localCal.calendar.id) {
      localCal.createEvent(eventData);
    } else {
      await createHaEvent(calendarId, eventData);
    }
  }, [localCal, createHaEvent]);

  const updateEvent = useCallback(async (calendarId: string, uid: string, eventData: Parameters<typeof updateHaEvent>[2]) => {
    if (calendarId === localCal.calendar.id) {
      localCal.updateEvent(uid, eventData);
    } else {
      await updateHaEvent(calendarId, uid, eventData);
    }
  }, [localCal, updateHaEvent]);

  const deleteEvent = useCallback(async (calendarId: string, uid: string) => {
    if (calendarId === localCal.calendar.id) {
      localCal.deleteEvent(uid);
    } else {
      await deleteHaEvent(calendarId, uid);
    }
  }, [localCal, deleteHaEvent]);

  const { weather } = useWeather(client);
  const music = useMusic(client, connected);
  const {
    chores,
    completionsToday,
    loaded: choresLoaded,
    completeChore,
    uncompleteChore,
    refresh: refreshChores,
  } = useChores();

  useChorePrivileges(members, chores, familyLoaded && choresLoaded);

  const dashboardTasks = useDashboardTasks(connected, settings.groceryListIds);

  // Apply theme at App level so it stays active regardless of which view is shown
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(settings.themeId);
  }, [settings.themeId, setTheme]);

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
  const [showImport, setShowImport] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [prefillTime, setPrefillTime] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<SidebarView>(() =>
    demoInitialView((settings.defaultView as SidebarView) || 'dashboard')
  );

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
  const [kioskNavRevealed, setKioskNavRevealed] = useState(false);

  const handleExitFocus = useCallback(() => {
    clearFocusMode();
    setFocusMemberId(null);
  }, []);

  const handleEnterFocusMode = useCallback((memberId: string) => {
    setDeviceFocusMember(memberId);
    setFocusMemberId(memberId);
  }, []);

  // Visible week shown by the calendar. Dashboard day changes do not move
  // this — see eventRanges below.
  const [visibleWeekStart, setVisibleWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: settings.weekStartsOn }),
  );

  // Session calendar layout. Starts from the saved default (read synchronously
  // so the first paint matches) and keeps the last switcher choice until the
  // user changes that default in Settings.
  const [calendarLayout, setCalendarLayout] = useState<CalendarLayout>(() => readStoredCalendarLayout());
  const calendarLayoutTouched = useRef(false);
  const appliedCalendarDefault = useRef<CalendarLayout | null>(null);
  useEffect(() => {
    if (!settingsLoaded) return;
    const next = normalizeCalendarLayout(settings.defaultCalendarView);
    const settingChanged = appliedCalendarDefault.current !== null
      && appliedCalendarDefault.current !== next;
    const firstApply = appliedCalendarDefault.current === null;
    appliedCalendarDefault.current = next;
    if (firstApply && calendarLayoutTouched.current) return;
    if (!calendarLayoutTouched.current || settingChanged) {
      setCalendarLayout(next);
      if (settingChanged) calendarLayoutTouched.current = false;
    }
  }, [settingsLoaded, settings.defaultCalendarView]);

  const handleCalendarLayoutChange = useCallback((layout: CalendarLayout) => {
    calendarLayoutTouched.current = true;
    setCalendarLayout(layout);
  }, []);

  const [visibleMonthStart, setVisibleMonthStart] = useState<Date>(() =>
    buildMonthGrid(new Date(), settings.weekStartsOn).days[0],
  );
  const handleVisibleMonthChange = useCallback((gridStart: Date) => {
    setVisibleMonthStart((current) => (
      current.getTime() === gridStart.getTime() ? current : gridStart
    ));
  }, []);

  // Day currently selected on the Dashboard's day view
  const [dashboardDate, setDashboardDate] = useState<Date>(() => startOfDay(new Date()));

  // Which windows to load. The calendar week follows visibleWeekStart; the
  // month grid follows visibleMonthStart (including adjacent-month days);
  // the dashboard follows dashboardDate.
  const eventRanges = useMemo(
    () => rangesForView({
      activeView,
      dashboardDate,
      visibleWeekStart,
      weekStartsOn: settings.weekStartsOn,
      calendarLayout,
      visibleMonthStart,
    }),
    [activeView, dashboardDate, visibleWeekStart, settings.weekStartsOn, calendarLayout, visibleMonthStart],
  );
  const eventRangeKey = eventRanges.map((range) => `${range.startMs}:${range.endMs}`).join('|');
  const eventRangesRef = useRef(eventRanges);
  eventRangesRef.current = eventRanges;
  const loadedRangesRef = useRef(loadedRanges);
  loadedRangesRef.current = loadedRanges;

  const refetchRanges = useCallback(async (
    ranges: { startMs: number; endMs: number }[],
  ) => {
    const seen = new Set<string>();
    for (const range of ranges) {
      const key = `${range.startMs}:${range.endMs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await fetchEvents(new Date(range.startMs).toISOString(), new Date(range.endMs).toISOString());
    }
  }, [fetchEvents]);

  const refetchActiveRanges = useCallback(
    () => refetchRanges(eventRangesRef.current),
    [refetchRanges],
  );

  const { selectedDayLoading, isDayLoaded } = useEnsureEventRange({
    enabled: connected,
    activeView,
    dashboardDate,
    ranges: eventRanges,
    loadedRanges,
    fetchEvents,
  });

  // Event notifications (browser + HA mobile_app)
  useNotifications(events, client, !focusMemberId, settings.notificationMinutes);

  // Leaderboard is still a slide-over panel (not a full view); Chores is now
  // a real full-screen activeView (see PRD: dedicated chores screen).
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Calendar list on connect. Event windows are loaded by useEnsureEventRange
  // so a dashboard date outside the visible week is fetched too.
  useEffect(() => {
    if (!connected) return;
    void fetchCalendars();
  }, [connected, fetchCalendars]);

  // Revalidate the windows on screen. Cached weeks are left alone until the
  // user comes back to them (useEnsureEventRange treats them as stale then).
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      void refetchActiveRanges();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [connected, refetchActiveRanges, eventRangeKey]);

  // Re-fetch when calendar colors or family members change so colors update
  // immediately, without recreating the 5-minute polling interval above.
  const colorRefreshRef = useRef({ connected, fetchCalendars, refetchRanges });
  colorRefreshRef.current = { connected, fetchCalendars, refetchRanges };
  const didColorRefreshMount = useRef(false);
  useEffect(() => {
    if (!didColorRefreshMount.current) {
      didColorRefreshMount.current = true;
      return;
    }
    if (!colorRefreshRef.current.connected) return;
    void colorRefreshRef.current.fetchCalendars();
    const ranges = loadedRangesRef.current.length > 0
      ? loadedRangesRef.current
      : eventRangesRef.current;
    void colorRefreshRef.current.refetchRanges(ranges);
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
    const eventData = data.allDay
      ? {
          summary: data.summary,
          start_date: data.startDate,
          // HA's calendar API treats dtend as exclusive (the day AFTER the
          // last day of the event) and rejects dtstart === dtend with a
          // "minimum event duration" error. When the user picks the same
          // start/end date for a single-day all-day event, bump end_date to
          // the day after start_date so HA sees a valid >=1-day duration.
          end_date: data.endDate <= data.startDate
            ? format(addDays(new Date(`${data.startDate}T00:00:00`), 1), 'yyyy-MM-dd')
            : data.endDate,
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

    try {
      if (selectedEvent) {
        // Editing an existing event — update in place rather than creating
        // a duplicate. `selectedEvent.calendarId` is the event's original
        // calendar; if the user changed the calendar in the form, move it
        // by deleting from the old calendar and creating on the new one
        // (HA's update_event can't move an event across entities).
        if (selectedEvent.hasStableId === false) {
          throw new Error("This event can't be edited — it has no stable ID from its calendar provider.");
        }
        if (calendarId !== selectedEvent.calendarId) {
          await deleteEvent(selectedEvent.calendarId, selectedEvent.id);
          await createEvent(calendarId, eventData);
        } else {
          try {
            await updateEvent(calendarId, selectedEvent.id, eventData);
          } catch (err) {
            // Many calendar providers (Google Calendar via HA, several
            // CalDAV backends, etc.) don't support in-place event updates
            // at all. Fall back to delete + recreate so editing still
            // works — the event gets a new id, but that's invisible to
            // the user since we refetch right after.
            if (err instanceof CalendarNotSupportedError) {
              await deleteEvent(calendarId, selectedEvent.id);
              await createEvent(calendarId, eventData);
            } else {
              throw err;
            }
          }
        }
      } else {
        await createEvent(calendarId, eventData);
      }

      await refetchActiveRanges();

      handleCloseModal();
    } catch (err) {
      console.error('Failed to save event:', err);
      // Re-throw so EventModal can surface an inline error to the user
      // instead of the save silently appearing to do nothing.
      throw err;
    }
  }, [selectedEvent, createEvent, updateEvent, deleteEvent, refetchActiveRanges, handleCloseModal]);

  const handleDeleteEvent = useCallback(async (calendarId: string, eventId: string) => {
    try {
      if (selectedEvent && selectedEvent.id === eventId && selectedEvent.hasStableId === false) {
        throw new Error("This event can't be deleted — it has no stable ID from its calendar provider.");
      }
      await deleteEvent(calendarId, eventId);

      await refetchActiveRanges();

      handleCloseModal();
    } catch (err) {
      console.error('Failed to delete event:', err);
      throw err instanceof CalendarNotSupportedError
        ? new Error('This calendar does not support deleting events.')
        : err;
    }
  }, [selectedEvent, deleteEvent, refetchActiveRanges, handleCloseModal]);

  const handleEventReschedule = useCallback(async (event: CalendarEvent, newDate: string, newHour: number) => {
    try {
      const oldStart = new Date(event.start);
      const oldEnd = new Date(event.end);
      const durationMs = oldEnd.getTime() - oldStart.getTime();

      const patch = event.allDay
        ? {
            start_date: newDate,
            end_date: format(new Date(new Date(newDate).getTime() + durationMs), 'yyyy-MM-dd'),
          }
        : (() => {
            const pad = (n: number) => String(n).padStart(2, '0');
            const newStartDt = `${newDate}T${pad(newHour)}:00:00`;
            const newEndTime = new Date(new Date(newStartDt).getTime() + durationMs);
            const newEndDt = `${format(newEndTime, 'yyyy-MM-dd')}T${pad(newEndTime.getHours())}:${pad(newEndTime.getMinutes())}:00`;
            return { start_date_time: newStartDt, end_date_time: newEndDt };
          })();

      try {
        await updateEvent(event.calendarId, event.id, patch);
      } catch (err) {
        // Same fallback as handleSaveEvent: calendars without update
        // support need delete + recreate to move an event via drag.
        if (err instanceof CalendarNotSupportedError) {
          await deleteEvent(event.calendarId, event.id);
          await createEvent(event.calendarId, { ...patch, summary: event.title, description: event.description });
        } else {
          throw err;
        }
      }

      await refetchActiveRanges();
    } catch (err) {
      console.error('Failed to reschedule event:', err);
    }
  }, [updateEvent, deleteEvent, createEvent, refetchActiveRanges]);

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
        setShowLeaderboard(true);
        return;
      }
      // All other views: close any open panel and switch view
      setShowLeaderboard(false);
      setActiveView(view);
    },
    [],
  );

  useEffect(() => {
    const ha = client();
    if (!connected || !ha) return undefined;
    let cancelled = false;
    const ids: number[] = [];
    const watch = (eventType: string, handler: (event: { data?: { view?: unknown } }) => void) => {
      ha.subscribeEvents(eventType, (event) => {
        handler(event as { data?: { view?: unknown } });
      }).then((id) => {
        if (cancelled) ha.unsubscribe(id);
        else ids.push(id);
      }).catch((err) => {
        console.warn(`[beacon] ${eventType} subscription failed`, err);
      });
    };
    watch('beacon_navigate', (event) => {
      const view = normalizeNavigateView(event?.data?.view);
      if (view) handleChangeView(view);
    });
    watch('beacon_chore_completed', () => {
      void refreshChores();
    });
    return () => {
      cancelled = true;
      ids.forEach((id) => ha.unsubscribe(id));
    };
  }, [client, connected, handleChangeView, refreshChores]);

  const handleClosePanel = useCallback(() => {
    setShowLeaderboard(false);
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
      // Number keys must not bypass a locked kiosk. Escape hold reveals nav first.
      if (settings.kioskMode && !kioskNavRevealed) return;

      const view = viewMap[e.key];
      if (view) {
        e.preventDefault();
        setActiveView(view);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.kioskMode, kioskNavRevealed]);

  const sidebarPos = settings.sidebarPosition || 'left';
  const showNav = kioskNavVisible(settings.kioskMode, settings.kioskRevealGesture, kioskNavRevealed);
  const offerKioskGesture = shouldOfferKioskGesture(settings.kioskMode, settings.kioskRevealGesture);

  // Show loading screen while checking stored credentials
  if (auth.state.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    );
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
  if (!demoMode && !isHaManaged && !auth.state.isOnboarded) {
    return (
      <OnboardingView
        onComplete={handleOnboardingComplete}
        onOAuthStart={handleOAuthStart}
      />
    );
  }

  // Kid Display mode: replace the entire shell (same pattern as onboarding)
  const voiceControl = settings.voiceButton ? (
    <VoiceAssist
      placement={showNav ? (sidebarPos === 'right' ? 'sidebar-right' : sidebarPos === 'bottom' ? 'sidebar-bottom' : 'sidebar-left') : 'kiosk'}
      getClient={client}
      onNavigate={handleChangeView}
      onRefreshChores={() => { void refreshChores(); }}
    />
  ) : null;

  if (focusMember) {
    return (
      <I18nContext.Provider value={i18n}>
        <FocusView
          memberId={focusMember.id}
          settings={settings}
          onExit={handleExitFocus}
        />
        {settings.voiceButton && (
          <VoiceAssist
            placement="kiosk"
            getClient={client}
            onNavigate={handleChangeView}
            onRefreshChores={() => { void refreshChores(); }}
          />
        )}
      </I18nContext.Provider>
    );
  }

  // Focus member requested but members not loaded yet (fresh device cache):
  // hold on a lightweight loading screen instead of flashing the full app.
  if (focusMemberId && members.length === 0 && !focusLoadTimedOut) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    );
  }

  return (
    <I18nContext.Provider value={i18n}>
    <div className={`beacon ${showNav ? `beacon--sidebar-${sidebarPos}` : 'beacon--kiosk'} ${isIngress ? 'beacon--ingress' : ''} ${compact ? 'beacon--compact' : ''}`}>
      {focusInvalid && (
        <div className="focus-invalid-banner">
          {t('app.kidDisplayNotFound')}
          <button type="button" className="settings-btn" onClick={handleExitFocus}>
            {t('app.dismiss')}
          </button>
        </div>
      )}
      {/* Kiosk hides the sidebar until the corner gesture (or Escape) reveals it. */}
      {offerKioskGesture && (
        <HiddenCornerGesture
          purpose="kiosk"
          corner={kioskHotCorner(sidebarPos)}
          members={members}
          onGrantedChange={setKioskNavRevealed}
        />
      )}
      {showNav && (
        <Sidebar
          activeView={activeView}
          onChangeView={handleChangeView}
          position={sidebarPos}
        />
      )}

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
              eventsLoading={selectedDayLoading}
              isDayLoaded={isDayLoaded}
            />
            <OmniAdd
              onAddEvent={handleAddEvent}
              onAddGroceryItem={() => setActiveView('grocery')}
              onAddChore={() => handleChangeView('chores')}
              onNavigateTimer={() => setActiveView('timer')}
              sidebarPosition={sidebarPos}
            />
            {settings.magicImport && !settings.kioskMode && (
              <button
                type="button"
                className="settings-btn settings-btn--primary magic-import-launch"
                onClick={() => setShowImport(true)}
              >
                {t('import.open')}
              </button>
            )}
          </>
        ) : activeView === 'chores' ? (
          settings.choresEnabled ? (
            <ChoresView />
          ) : (
            <div className="chores-empty" style={{ padding: 48 }}>
              {t('app.choresDisabled')}
            </div>
          )
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
            fontStatus={fontStatus}
            members={members}
            onAddMember={addMember}
            onUpdateMember={updateMember}
            onRemoveMember={removeMember}
            connected={connected}
            haUrl={config.ha_url}
            calendars={calendars}
            onEnterFocusMode={handleEnterFocusMode}
          />
        ) : activeView === 'grocery' ? (
          <GroceryView defaultListId={settings.defaultGroceryList || undefined} mode="grocery" groceryListIds={settings.groceryListIds} />
        ) : activeView === 'tasks' ? (
          <GroceryView mode="tasks" groceryListIds={settings.groceryListIds} />
        ) : activeView === 'timer' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24 }}>
            <Timer />
          </div>
        ) : activeView === 'weather' ? (
          <WeatherView />
        ) : activeView === 'photos' ? (
          <PhotoFrame
            intervalSeconds={settings.photoInterval}
            photoDirectory={settings.photoDirectory}
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
                <span className="header-date">{format(new Date(), 'EEEE, MMMM d, yyyy', { locale: i18n.dateLocale })}</span>
                {!connected && !demoMode && (
                  <div className="connection-status">
                    <span className="connection-dot" />
                    {t('app.connecting')}
                  </div>
                )}
              </div>
              <div className="header-right">
                {settings.magicImport && !settings.kioskMode && (
                  <button
                    type="button"
                    className="settings-btn magic-import-header-btn"
                    onClick={() => setShowImport(true)}
                  >
                    {t('import.open')}
                  </button>
                )}
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
                {calendarLayout === 'month' ? (
                  <MonthCalendar
                    events={events}
                    hiddenCalendars={hiddenCalendars}
                    onEventClick={handleEventClick}
                    onSlotClick={handleSlotClick}
                    onVisibleMonthChange={handleVisibleMonthChange}
                    weekStartsOn={settings.weekStartsOn}
                    calendarLayout={calendarLayout}
                    onCalendarLayoutChange={handleCalendarLayoutChange}
                    isDayLoaded={isDayLoaded}
                  />
                ) : (
                  <WeekCalendar
                    events={events}
                    hiddenCalendars={hiddenCalendars}
                    onEventClick={handleEventClick}
                    onSlotClick={handleSlotClick}
                    onEventReschedule={handleEventReschedule}
                    onVisibleWeekChange={setVisibleWeekStart}
                    weekStartsOn={settings.weekStartsOn}
                    calendarLayout={calendarLayout}
                    onCalendarLayoutChange={handleCalendarLayoutChange}
                  />
                )}
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
          defaultCalendarId={settings.defaultCalendar}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={handleCloseModal}
          prefillDate={prefillDate}
          prefillTime={prefillTime}
        />
      )}

      {showImport && settings.magicImport && !settings.kioskMode && (
        <MagicImportModal
          calendars={calendars}
          members={members}
          defaultCalendarId={settings.defaultCalendar}
          defaultGroceryListId={settings.defaultGroceryList}
          defaultTodoListId="beacon-todo"
          defaultDurationMinutes={settings.defaultEventDuration}
          locale={settings.locale}
          grocyEnabled={settings.grocyEnabled}
          getClient={client}
          onCreateEvent={createEvent}
          onClose={() => setShowImport(false)}
          onCommitted={() => { void refetchActiveRanges(); }}
        />
      )}

      {/* Leaderboard Slide Panel */}
      <Leaderboard
        open={showLeaderboard}
        onClose={handleClosePanel}
      />
      {showLeaderboard && (
        <div
          className="slide-panel-backdrop"
          onClick={handleClosePanel}
        />
      )}

      {/* GroceryView is now rendered as a full view above */}

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
      <ScreenSaver
        enabled={settings.screenSaverEnabled}
        dimTimeoutMin={settings.dimTimeout}
        screenSaverTimeoutMin={settings.screenSaverTimeout}
      />

      {/* Demo indicator — only show outside of add-on ingress */}
      {!connected && !isHaManaged && !demoMode && (
        <div className="demo-badge">{t('app.demoMode')}</div>
      )}
      {voiceControl}
    </div>
    </I18nContext.Provider>
  );
}
