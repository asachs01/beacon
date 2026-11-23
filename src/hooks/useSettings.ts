import { useState, useCallback, useEffect, useMemo } from 'react';
import { getConfig } from '../config';
import { loadDataSync, loadServerData, saveData } from '../api/beacon-store';
import {
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_FONT,
  normalizeFontSelection,
  type FontSelection,
} from '../fonts/selection';
import { normalizeCalendarLayout, type CalendarLayout } from '../types';
import { isAddOn } from '../utils/ha-env';
import { publishChoreResetTime } from '../api/chore-reset-time';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BeaconSettings {
  // General
  familyName: string;
  saveConfigInBrowser: boolean;
  defaultView: 'dashboard' | 'calendar' | 'grocery' | 'tasks' | 'music' | 'photos';
  timeFormat: '12h' | '24h';
  weekStartsOn: 0 | 1; // 0 = Sunday, 1 = Monday
  locale: string;

  // Appearance
  themeId: string;
  autoDarkMode: boolean;
  darkModeStart: string; // "HH:mm"
  darkModeEnd: string;   // "HH:mm"
  fontScale: 'normal' | 'large' | 'extra-large';
  /** Heading face. Defaults to Fraunces, the face Beacon shipped with. */
  headingFont: FontSelection;
  /** Body face. Defaults to Inter, the face Beacon shipped with. */
  bodyFont: FontSelection;
  sidebarPosition: 'left' | 'right' | 'bottom';

  // Calendar
  /** Layout shown when the calendar tab opens. The switcher can change it for the session. */
  defaultCalendarView: CalendarLayout;
  defaultCalendar: string;
  permanentlyHiddenCalendars: string[];
  calendarColors: Record<string, string>;
  defaultEventDuration: 30 | 60 | 120;
  notificationMinutes: 5 | 10 | 15 | 30;

  // Integrations
  weatherEntity: string;
  grocyEnabled: boolean;
  anylistEnabled: boolean;
  defaultGroceryList: string;
  groceryListIds: string[];
  shoppingEntity: string;
  musicDefaultPlayer: string;
  photoDirectory: string;
  photoInterval: number;
  photoTransition: 'fade' | 'slide';

  // Dashboard
  dashboardLayout: 'default' | 'classic' | 'compact';
  advancedDashboard: boolean;

  // Display
  screenSaverEnabled: boolean;
  dimTimeout: number;       // minutes
  screenSaverTimeout: number; // minutes
  alwaysOnDisplay: boolean;
  showSeconds: boolean;
  kioskMode: boolean;
  /** When kiosk mode is on, the corner gesture can temporarily reveal navigation. */
  kioskRevealGesture: boolean;
  /**
   * Hold-to-talk button on the wall. The literal default is on. On first
   * load, a standalone browser turns it off until someone enables it; the
   * Home Assistant add-on leaves it on.
   */
  voiceButton: boolean;
  /**
   * Import button on the dashboard and calendar. The literal default is on.
   * On first load, a standalone browser turns it off until someone enables
   * it; the Home Assistant add-on leaves it on. A saved true/false wins.
   */
  magicImport: boolean;
  /**
   * Ask Home Assistant's conversation agent to read pasted text. On by
   * default, including when the key has never been stored. Off forces the
   * local parser. A saved true/false wins and does not rewrite other keys.
   */
  magicImportUseHaAgent: boolean;

  // Chores
  choresEnabled: boolean;
  choresResetTime: string;  // "HH:mm"
  streakDays: number;
  currencySymbol: string;
  payoutSchedule: 'weekly' | 'monthly';
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'beacon-settings';

function buildDefaults(): BeaconSettings {
  const config = getConfig();

  return {
    familyName: config.family_name,
    saveConfigInBrowser: config.save_config_in_browser,
    defaultView: 'dashboard',
    timeFormat: '12h',
    weekStartsOn: 0,
    locale: 'en-US',

    themeId: config.theme,
    autoDarkMode: config.auto_dark_mode,
    darkModeStart: '19:00',
    darkModeEnd: '06:00',
    fontScale: 'normal',
    headingFont: DEFAULT_HEADING_FONT,
    bodyFont: DEFAULT_BODY_FONT,
    sidebarPosition: 'left',

    defaultCalendarView: 'week',
    defaultCalendar: '',
    permanentlyHiddenCalendars: [],
    calendarColors: {},
    defaultEventDuration: 60,
    notificationMinutes: 10,

    weatherEntity: config.weather_entity,
    grocyEnabled: false,
    anylistEnabled: false,
    defaultGroceryList: '',
    groceryListIds: [],
    shoppingEntity: '',
    musicDefaultPlayer: '',
    photoDirectory: config.photo_directory,
    photoInterval: config.photo_interval,
    photoTransition: 'fade',

    dashboardLayout: 'default',
    advancedDashboard: false,

    screenSaverEnabled: true,
    dimTimeout: 5,
    screenSaverTimeout: config.screen_saver_timeout,
    alwaysOnDisplay: false,
    showSeconds: false,
    kioskMode: false,
    kioskRevealGesture: true,
    voiceButton: true,
    magicImport: true,
    magicImportUseHaAgent: true,

    choresEnabled: true,
    choresResetTime: '00:00',
    streakDays: 7,
    currencySymbol: '$',
    payoutSchedule: 'weekly',
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

async function loadSettingsAsync(): Promise<BeaconSettings> {
  const defaults = buildDefaults();
  const configAllowsBrowserStorage = getConfig().save_config_in_browser;
  const serverStored = await loadServerData<Partial<BeaconSettings>>(STORAGE_KEY);
  const stored = serverStored ?? (configAllowsBrowserStorage
    ? loadDataSync<Partial<BeaconSettings>>(STORAGE_KEY, {})
    : {});
  return withUnstoredDefaults(withNormalizedFonts({
    ...defaults,
    ...stored,
    // The add-on configuration is authoritative: it can disable browser
    // storage, while the user preference can opt out when config allows it.
    saveConfigInBrowser: configAllowsBrowserStorage && (stored.saveConfigInBrowser ?? true),
  }), stored);
}

/**
 * A saved true/false wins. When the key has never been stored, the add-on
 * shows the button and a standalone browser hides it.
 */
export function withVoiceButtonDefault(
  settings: BeaconSettings,
  stored: Partial<BeaconSettings> | null | undefined,
): BeaconSettings {
  if (stored && typeof stored.voiceButton === 'boolean') return settings;
  let addOn = false;
  try {
    addOn = isAddOn();
  } catch {
    addOn = false;
  }
  return { ...settings, voiceButton: addOn };
}

/**
 * A saved true/false wins. When the key has never been stored, the add-on
 * shows Import and a standalone browser hides it.
 */
export function withMagicImportDefault(
  settings: BeaconSettings,
  stored: Partial<BeaconSettings> | null | undefined,
): BeaconSettings {
  if (stored && typeof stored.magicImport === 'boolean') return settings;
  let addOn = false;
  try {
    addOn = isAddOn();
  } catch {
    addOn = false;
  }
  return { ...settings, magicImport: addOn };
}

function withUnstoredDefaults(
  settings: BeaconSettings,
  stored: Partial<BeaconSettings> | null | undefined,
): BeaconSettings {
  return withMagicImportDefault(withVoiceButtonDefault(settings, stored), stored);
}

function withNormalizedFonts(settings: BeaconSettings): BeaconSettings {
  return {
    ...settings,
    headingFont: normalizeFontSelection(settings.headingFont, DEFAULT_HEADING_FONT),
    bodyFont: normalizeFontSelection(settings.bodyFont, DEFAULT_BODY_FONT),
    defaultCalendarView: normalizeCalendarLayout(settings.defaultCalendarView),
  };
}

/** Last saved calendar layout, read synchronously so the first paint can match it. */
export function readStoredCalendarLayout(): CalendarLayout {
  const stored = loadDataSync<Partial<BeaconSettings>>(STORAGE_KEY, {});
  return normalizeCalendarLayout(stored.defaultCalendarView);
}

function persistSettings(settings: BeaconSettings): void {
  const browserStorage = getConfig().save_config_in_browser && settings.saveConfigInBrowser;
  if (!browserStorage) {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  saveData(STORAGE_KEY, settings, { browserStorage });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function initialSettings(): BeaconSettings {
  const defaults = buildDefaults();
  // The screenshot build writes fixtures before React starts. Read them on
  // the first paint so views don't flash the empty defaults.
  if (import.meta.env.VITE_DEMO !== 'true') return withUnstoredDefaults(defaults, null);
  const stored = loadDataSync<Partial<BeaconSettings>>(STORAGE_KEY, {});
  return withUnstoredDefaults(withNormalizedFonts({ ...defaults, ...stored }), stored);
}

export function useSettings() {
  const [settings, setSettingsState] = useState<BeaconSettings>(initialSettings);
  const [loaded, setLoaded] = useState(false);

  /** Re-fetch settings from server. */
  const refresh = useCallback(async () => {
    const serverSettings = await loadSettingsAsync();
    setSettingsState(serverSettings);
    setLoaded(true);
  }, []);

  // Fetch from server on mount, update if server has newer data
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch when the app becomes visible (mirror ha-entity-store pattern)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  // Persist whenever settings change, and publish the reset time the
  // chore chart and privilege switches read.
  useEffect(() => {
    if (loaded) persistSettings(settings);
  }, [settings, loaded]);

  useEffect(() => {
    if (!loaded) return;
    publishChoreResetTime(settings.choresResetTime);
  }, [loaded, settings.choresResetTime]);

  /** Update one or more settings fields. Changes apply immediately. */
  const updateSettings = useCallback(
    (patch: Partial<BeaconSettings>) => {
      setSettingsState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  /** Reset all settings to defaults (merged with config.yaml values). */
  const resetSettings = useCallback(() => {
    const defaults = withUnstoredDefaults(buildDefaults(), null);
    setSettingsState(defaults);
    persistSettings(defaults);
  }, []);

  /** Export current settings as a JSON string. */
  const exportSettings = useCallback((): string => {
    return JSON.stringify(settings, null, 2);
  }, [settings]);

  /** Import settings from a JSON string. Invalid JSON is silently ignored. */
  const importSettings = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      const defaults = buildDefaults();
      setSettingsState(withUnstoredDefaults(withNormalizedFonts({ ...defaults, ...parsed }), parsed));
    } catch {
      // invalid JSON — do nothing
    }
  }, []);

  /** Clear all Beacon data from localStorage. */
  const clearLocalStorage = useCallback(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('beacon')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }, []);

  const defaults = useMemo(() => buildDefaults(), []);

  return {
    settings,
    /** False until the first server/cache read finishes. */
    loaded,
    defaults,
    updateSettings,
    resetSettings,
    exportSettings,
    importSettings,
    clearLocalStorage,
    refresh,
  };
}
