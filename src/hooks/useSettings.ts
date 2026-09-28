import { useCallback, useMemo } from 'react';
import { getConfig } from '../config';
import { useStoredData } from './useStoredData';
import { DEFAULT_DARK_END, DEFAULT_DARK_START } from './useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BeaconSettings {
  // General
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Fill missing fields and repair malformed legacy data loaded from storage. */
function withDefaults(stored: unknown): BeaconSettings {
  const settings = buildDefaults();
  if (!isRecord(stored)) return settings;

  const strings = [
    'locale', 'themeId', 'defaultCalendar', 'lastEventCalendar',
    'weatherEntity', 'defaultGroceryList', 'shoppingEntity',
    'musicDefaultPlayer', 'photoDirectory', 'currencySymbol',
  ] as const;
  for (const field of strings) {
    if (typeof stored[field] === 'string') settings[field] = stored[field];
  }

  for (const field of ['darkModeStart', 'darkModeEnd'] as const) {
    const value = stored[field];
    if (typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) settings[field] = value;
  }

  const booleans = [
    'autoDarkMode', 'grocyEnabled', 'anylistEnabled', 'hideLocalGroceryList',
    'hideLocalTaskList', 'hideHaHeader', 'advancedDashboard',
    'screenSaverEnabled', 'screenSaverShowPhotos', 'alwaysOnDisplay',
    'showSeconds', 'kioskMode', 'choresEnabled', 'choresSyncEnabled',
  ] as const;
  for (const field of booleans) {
    if (typeof stored[field] === 'boolean') settings[field] = stored[field];
  }

  for (const field of ['photoInterval', 'dimTimeout', 'screenSaverTimeout'] as const) {
    const value = stored[field];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) settings[field] = value;
  }

  for (const field of ['permanentlyHiddenCalendars', 'groceryListIds'] as const) {
    const value = stored[field];
    if (Array.isArray(value)) settings[field] = value.filter((item): item is string => typeof item === 'string');
  }

  for (const field of ['calendarColors', 'choresSyncListByMember'] as const) {
    const value = stored[field];
    if (isRecord(value)) {
      settings[field] = Object.fromEntries(
        Object.entries(value).filter(([, item]) => typeof item === 'string'),
      ) as Record<string, string>;
    }
  }

  const oneOf = <T extends string | number>(value: unknown, choices: readonly T[], fallback: T): T =>
    choices.includes(value as T) ? value as T : fallback;

  settings.defaultView = oneOf(stored.defaultView, ['dashboard', 'calendar', 'grocery', 'tasks', 'music', 'photos'], settings.defaultView);
  settings.timeFormat = oneOf(stored.timeFormat, ['12h', '24h'], settings.timeFormat);
  settings.weekStartsOn = oneOf(stored.weekStartsOn, [0, 1], settings.weekStartsOn);
  settings.fontScale = oneOf(stored.fontScale, ['normal', 'large', 'extra-large'], settings.fontScale);
  settings.sidebarPosition = oneOf(stored.sidebarPosition, ['left', 'right', 'bottom'], settings.sidebarPosition);
  settings.defaultEventDuration = oneOf(stored.defaultEventDuration, [30, 60, 120], settings.defaultEventDuration);
  settings.notificationMinutes = oneOf(stored.notificationMinutes, [5, 10, 15, 30], settings.notificationMinutes);
  settings.photoTransition = oneOf(stored.photoTransition, ['fade', 'slide'], settings.photoTransition);
  settings.dashboardLayout = oneOf(stored.dashboardLayout, ['default', 'classic', 'compact'], settings.dashboardLayout);
  settings.payoutSchedule = oneOf(stored.payoutSchedule, ['weekly', 'monthly'], settings.payoutSchedule);

  return settings;
}

function validPatch(patch: Partial<BeaconSettings>): Partial<BeaconSettings> {
  if (!isRecord(patch)) return {};
  const sanitized = withDefaults(patch);
  return Object.fromEntries(
    Object.entries(sanitized).filter(([field]) => Object.prototype.hasOwnProperty.call(patch, field)),
  ) as Partial<BeaconSettings>;
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
      const clean = validPatch(patch);
      if (Object.keys(clean).length) setSettings((prev) => ({ ...prev, ...clean }), true, clean);
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

  /** Reject invalid imports; unlike legacy reads, importing must never silently repair data. */
  const importSettings = useCallback((json: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      window.alert("Couldn't import settings: the file isn't valid JSON. No changes were made.");
      return;
    }
    if (!isRecord(parsed)) {
      window.alert("Couldn't import settings: expected a JSON object. No changes were made.");
      return;
    }

    const sanitized = withDefaults(parsed);
    // JSON imports are serializable: any field the normalizer changed (or
    // didn't recognize) had an invalid value and must not be persisted.
    const invalid = Object.keys(parsed).find((field) =>
      !Object.prototype.hasOwnProperty.call(sanitized, field)
      || JSON.stringify(parsed[field]) !== JSON.stringify(sanitized[field as keyof BeaconSettings]));
    if (invalid) {
      window.alert(`Couldn't import settings: "${invalid}" is unknown or has an invalid value. No changes were made.`);
      return;
    }
    setSettings(() => sanitized);
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
