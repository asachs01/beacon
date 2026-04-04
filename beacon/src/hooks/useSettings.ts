import { useState, useCallback, useEffect, useMemo } from 'react';
import { getConfig } from '../config';
import { loadData, loadDataSync, saveData } from '../api/beacon-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BeaconSettings {
  // General
  familyName: string;
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
  sidebarPosition: 'left' | 'right' | 'bottom';

  // Calendar
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
  musicDefaultPlayer: string;
  photoDirectory: string;
  photoInterval: number;
  photoTransition: 'fade' | 'slide';

  // Dashboard
  dashboardLayout: 'default' | 'classic' | 'compact';

  // Display
  screenSaverEnabled: boolean;
  screenSaverMode: 'clock' | 'photos' | 'both';
  dimTimeout: number;       // minutes
  screenSaverTimeout: number; // minutes
  alwaysOnDisplay: boolean;
  showSeconds: boolean;
  kioskMode: boolean;

  // Photos / Screensaver sources
  photoSource: 'google_photos' | 'immich' | 'local' | 'none';
  immichUrl: string;
  immichApiKey: string;

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
    defaultView: 'dashboard',
    timeFormat: '12h',
    weekStartsOn: 0,
    locale: 'en-US',

    themeId: config.theme,
    autoDarkMode: config.auto_dark_mode,
    darkModeStart: '19:00',
    darkModeEnd: '06:00',
    fontScale: 'normal',
    sidebarPosition: 'left',

    defaultCalendar: '',
    permanentlyHiddenCalendars: [],
    calendarColors: {},
    defaultEventDuration: 60,
    notificationMinutes: 10,

    weatherEntity: config.weather_entity,
    grocyEnabled: false,
    anylistEnabled: false,
    defaultGroceryList: '',
    musicDefaultPlayer: '',
    photoDirectory: config.photo_directory,
    photoInterval: config.photo_interval,
    photoTransition: 'fade',

    dashboardLayout: 'default',

    screenSaverEnabled: true,
    screenSaverMode: 'clock',
    dimTimeout: 5,
    screenSaverTimeout: config.screen_saver_timeout,
    alwaysOnDisplay: false,
    showSeconds: false,
    kioskMode: false,

    photoSource: 'none',
    immichUrl: '',
    immichApiKey: '',

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

function loadSettingsSync(): BeaconSettings {
  const defaults = buildDefaults();
  const stored = loadDataSync<Partial<BeaconSettings>>(STORAGE_KEY, {});
  return { ...defaults, ...stored };
}

async function loadSettingsAsync(): Promise<BeaconSettings> {
  const defaults = buildDefaults();
  const stored = await loadData<Partial<BeaconSettings>>(STORAGE_KEY, {});
  return { ...defaults, ...stored };
}

function persistSettings(settings: BeaconSettings): void {
  saveData(STORAGE_KEY, settings);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSettings() {
  // Initialize with localStorage data immediately
  const [settings, setSettingsState] = useState<BeaconSettings>(loadSettingsSync);

  // Fetch from server on mount, update if server has newer data
  useEffect(() => {
    loadSettingsAsync().then((serverSettings) => {
      setSettingsState(serverSettings);
    });
  }, []);

  // Persist whenever settings change
  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  /** Update one or more settings fields. Changes apply immediately. */
  const updateSettings = useCallback(
    (patch: Partial<BeaconSettings>) => {
      setSettingsState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  /** Reset all settings to defaults (merged with config.yaml values). */
  const resetSettings = useCallback(() => {
    const defaults = buildDefaults();
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
      setSettingsState({ ...defaults, ...parsed });
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
    defaults,
    updateSettings,
    resetSettings,
    exportSettings,
    importSettings,
    clearLocalStorage,
  };
}
