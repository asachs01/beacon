import { useState, useEffect, useCallback, useMemo } from 'react';
import { themes, getTheme, type Theme } from '../styles/themes';

export type ThemeMode = 'auto' | string; // 'auto' or a theme id

const THEME_STORAGE_KEY = 'beacon-theme';
const AUTO_DARK_THEME_KEY = 'beacon-auto-dark-theme';
const DARK_START_HOUR = 19; // 7 PM
const LIGHT_START_HOUR = 6; // 6 AM

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDaytime(): boolean {
  const hour = new Date().getHours();
  return hour >= LIGHT_START_HOUR && hour < DARK_START_HOUR;
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme() {
  const [themeId, setThemeIdState] = useState<string>(() =>
    loadStored(THEME_STORAGE_KEY, 'skylight'),
  );

  // The dark theme used by auto mode when it switches to night
  const [autoDarkId] = useState<string>(() =>
    loadStored(AUTO_DARK_THEME_KEY, 'midnight'),
  );

  /** Resolve the active theme object based on current mode and time */
  const resolvedTheme = useMemo<Theme>(() => {
    if (themeId === 'auto') {
      return getTheme(isDaytime() ? 'skylight' : autoDarkId);
    }
    return getTheme(themeId);
  }, [themeId, autoDarkId]);

  const setTheme = useCallback((id: string) => {
    setThemeIdState(id);
    persist(THEME_STORAGE_KEY, id);
  }, []);

  // Apply CSS custom properties whenever the resolved theme changes
  useEffect(() => {
    applyThemeToDOM(resolvedTheme);
  }, [resolvedTheme]);

  // For auto mode, re-evaluate every 60 seconds so day/night flips on time
  useEffect(() => {
    if (themeId !== 'auto') return;

    const interval = setInterval(() => {
      const next = getTheme(isDaytime() ? 'skylight' : autoDarkId);
      applyThemeToDOM(next);
    }, 60_000);

    return () => clearInterval(interval);
  }, [themeId, autoDarkId]);

  const availableThemes = useMemo(
    () => themes.map(({ id, name }) => ({ id, name })),
    [],
  );

  return {
    /** The currently resolved full Theme object */
    theme: resolvedTheme,
    /** The stored theme id (may be 'auto') */
    themeId,
    /** Set the theme by id. Pass 'auto' for time-based switching. */
    setTheme,
    /** List of { id, name } for all registered themes */
    availableThemes,
  };
}
