import { useEffect } from 'react';
import { getTheme, type Theme } from '../styles/themes';
import { getConfig } from '../config';

const THEME_STORAGE_KEY = 'beacon-theme';
const AUTO_DARK_THEME_KEY = 'beacon-auto-dark-theme';

/** Settings' Dark Mode Starts and Ends until changed (7 PM to 6 AM). */
export const DEFAULT_DARK_START = '19:00';
export const DEFAULT_DARK_END = '06:00';

/** Settings > Appearance > Auto Dark Mode, with its hours ("HH:mm"). */
export interface DarkHours {
  autoDarkMode: boolean;
  darkModeStart: string;
  darkModeEnd: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Whether `now` is within the dark hours, from `start` up to `end` ("HH:mm").
 * They may run past midnight (19:00 to 06:00); equal times mean never.
 */
export function isDarkHours(now: Date, start: string, end: string): boolean {
  const from = minutesOfDay(start);
  const to = minutesOfDay(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/** Apply a Theme's tokens as CSS custom properties on :root */
function applyThemeToDOM(theme: Theme): void {
  const root = document.documentElement;
  const { colors, eventColors, fonts } = theme;

  root.style.setProperty('--bg-primary', colors.background);
  root.style.setProperty('--bg-surface', colors.surface);
  root.style.setProperty('--bg-header', colors.headerBg);
  root.style.setProperty('--bg-sidebar', colors.headerBg);
  root.style.setProperty('--bg-today', colors.todayHighlight);
  root.style.setProperty('--border', colors.gridLines);
  root.style.setProperty('--border-subtle', colors.gridLines);
  root.style.setProperty('--text-primary', colors.text);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--grid-lines', colors.gridLines);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--shadow', colors.shadow);

  eventColors.forEach((color, i) => {
    root.style.setProperty(`--event-${i + 1}`, color);
  });

  root.style.setProperty('--font-display', fonts.display);
  root.style.setProperty('--font-body', fonts.body);
  root.style.setProperty('--font-mono', fonts.mono);

  // Also set data-theme so other CSS can hook into light/dark if needed.
  // Determine light vs dark by checking luminance of background hex.
  const isDark = isColorDark(colors.background);
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

/** Rough luminance check for a hex color */
function isColorDark(hex: string): boolean {
  const cleaned = hex.replace('#', '');
  if (cleaned.length < 6) return false;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  // Perceived brightness formula
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function loadStored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable
  }
}

/**
 * The theme to show at `now` for the one chosen in Settings: "auto" is
 * Skylight by day and the dark theme by night, and with Auto Dark Mode on a
 * light theme turns dark by night too. Night is Settings' dark hours. (The
 * toggle and its hours did nothing, and "auto" switched at fixed hours.)
 */
export function resolveThemeId(themeId: string, dark: DarkHours, now: Date): string {
  const night = isDarkHours(now, dark.darkModeStart || DEFAULT_DARK_START, dark.darkModeEnd || DEFAULT_DARK_END);
  const nightTheme = loadStored(AUTO_DARK_THEME_KEY, 'midnight');
  if (themeId === 'auto') return night ? nightTheme : 'skylight';
  if (night && dark.autoDarkMode && !isColorDark(getTheme(themeId).colors.background)) return nightTheme;
  return themeId;
}

// ---------------------------------------------------------------------------
// Eager theme application (called before React renders to prevent flash)
// ---------------------------------------------------------------------------

export function applyStoredTheme(): void {
  // This display's copy of the settings (useSettings keeps it up to date).
  let stored: Partial<DarkHours & { themeId: string }> = {};
  try {
    stored = JSON.parse(localStorage.getItem('beacon-settings') ?? '{}') ?? {};
  } catch { /* ignore */ }
  const themeId = stored.themeId || loadStored(THEME_STORAGE_KEY, 'skylight');
  applyThemeToDOM(getTheme(resolveThemeId(themeId, {
    autoDarkMode: stored.autoDarkMode ?? getConfig().auto_dark_mode,
    darkModeStart: stored.darkModeStart ?? DEFAULT_DARK_START,
    darkModeEnd: stored.darkModeEnd ?? DEFAULT_DARK_END,
  }, new Date())));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Shows `themeId` (Settings > Theme), dark by night per `dark`. While that
 * depends on the time it's checked at each minute boundary, and applied
 * straight to the page, so the app doesn't re-render every minute.
 */
export function useTheme(themeId: string, dark: DarkHours) {
  const { autoDarkMode, darkModeStart, darkModeEnd } = dark;

  useEffect(() => {
    persist(THEME_STORAGE_KEY, themeId); // for the first paint next time
    let shown = '';
    const apply = () => {
      const id = resolveThemeId(themeId, { autoDarkMode, darkModeStart, darkModeEnd }, new Date());
      if (id === shown) return;
      shown = id;
      applyThemeToDOM(getTheme(id));
    };
    apply();
    if (themeId !== 'auto' && !autoDarkMode) return;

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        apply();
        schedule();
      }, 60_000 - (Date.now() % 60_000));
    };
    // Timers are slowed while the page is hidden; catch up when it's shown.
    const onVisible = () => {
      if (!document.hidden) apply();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [themeId, autoDarkMode, darkModeStart, darkModeEnd]);
}
