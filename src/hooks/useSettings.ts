import { useCallback, useMemo } from 'react';
import { getConfig } from '../config';
import { saveDataPatch } from '../api/beacon-store';
import { useStoredData } from './useStoredData';
import { DEFAULT_DARK_END, DEFAULT_DARK_START } from './useTheme';

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
  /** Calendar the last new event went in; new events start there when no default is set. */
  lastEventCalendar: string;
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
  hideLocalGroceryList: boolean;
  hideLocalTaskList: boolean;
  /** Ask HA to hide its top bar and sidebar while Family is open (add-on only) */
  hideHaHeader: boolean;
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
  screenSaverShowPhotos: boolean;
  alwaysOnDisplay: boolean;
  showSeconds: boolean;
  kioskMode: boolean;

  // Chores
  choresEnabled: boolean;
  currencySymbol: string;
  payoutSchedule: 'weekly' | 'monthly';
  choresSyncEnabled: boolean;
  choresSyncListByMember: Record<string, string>; // member id -> HA todo entity_id
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
    darkModeStart: DEFAULT_DARK_START,
    darkModeEnd: DEFAULT_DARK_END,
    fontScale: 'normal',
    sidebarPosition: 'left',

    defaultCalendar: '',
    lastEventCalendar: '',
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
    hideLocalGroceryList: false,
    hideLocalTaskList: false,
    hideHaHeader: false,
    musicDefaultPlayer: '',
    photoDirectory: config.photo_directory,
    photoInterval: config.photo_interval,
    photoTransition: 'fade',

    dashboardLayout: 'default',
    advancedDashboard: false,

    screenSaverEnabled: true,
    dimTimeout: 5,
    screenSaverTimeout: config.screen_saver_timeout,
    screenSaverShowPhotos: false,
    alwaysOnDisplay: false,
    showSeconds: false,
    kioskMode: false,

    choresEnabled: true,
    currencySymbol: '$',
    payoutSchedule: 'weekly',
    choresSyncEnabled: false,
    choresSyncListByMember: {},
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/** Stored settings may predate newer fields; fill those from defaults. */
function withDefaults(stored: Partial<BeaconSettings> | null): BeaconSettings {
  return { ...buildDefaults(), ...stored };
}

const NO_STORED_SETTINGS = {} as BeaconSettings;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSettings() {
  // Loading never saves (see useStoredData); only the updaters below do.
  const [settings, setSettings, refresh] = useStoredData<BeaconSettings>(
    STORAGE_KEY,
    NO_STORED_SETTINGS,
    withDefaults,
  );

  /**
   * Update one or more settings fields. Changes apply immediately. Only the
   * changed fields are sent to the server, which merges them into its copy,
   * so settings changed meanwhile on another device aren't overwritten.
   */
  const updateSettings = useCallback(
    (patch: Partial<BeaconSettings>) => {
      const next = setSettings((prev) => ({ ...prev, ...patch }), false);
      void saveDataPatch(STORAGE_KEY, patch, next);
    },
    [setSettings],
  );

  /** Reset all settings to defaults (merged with config.yaml values). */
  const resetSettings = useCallback(() => {
    setSettings(() => buildDefaults());
  }, [setSettings]);

  /** Export current settings as a JSON string. */
  const exportSettings = useCallback((): string => {
    return JSON.stringify(settings, null, 2);
  }, [settings]);

  /** Import settings from a JSON string. Invalid JSON is silently ignored. */
  const importSettings = useCallback((json: string) => {
    let parsed: Partial<BeaconSettings>;
    try {
      parsed = JSON.parse(json);
    } catch {
      return; // invalid JSON — do nothing
    }
    setSettings(() => withDefaults(parsed));
  }, [setSettings]);

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
    refresh,
  };
}
