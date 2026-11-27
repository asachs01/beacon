/**
 * Deep links used only by the docs screenshot build (`VITE_DEMO=true`).
 * Production navigates with the sidebar, so these query params are ignored
 * unless that build flag is set.
 */

const VIEWS = [
  'dashboard',
  'calendar',
  'chores',
  'grocery',
  'tasks',
  'music',
  'photos',
  'timer',
  'weather',
  'settings',
] as const;

const SECTIONS = [
  'general',
  'appearance',
  'family',
  'calendar',
  'integrations',
  'display',
  'devices',
  'chores',
  'about',
] as const;

export type DemoView = (typeof VIEWS)[number];
export type DemoSettingsSection = (typeof SECTIONS)[number];

function demoParam(name: string): string | null {
  if (import.meta.env.VITE_DEMO !== 'true') return null;
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function demoInitialView<T extends string>(fallback: T): T {
  const view = demoParam('view');
  if (view && (VIEWS as readonly string[]).includes(view)) return view as T;
  return fallback;
}

export function demoSettingsSection<T extends string>(fallback: T): T {
  const section = demoParam('section');
  if (section && (SECTIONS as readonly string[]).includes(section)) return section as T;
  return fallback;
}

export function demoThemeOverride(): string | null {
  return demoParam('theme');
}

export function demoLayoutOverride(): 'default' | 'classic' | 'compact' | null {
  const layout = demoParam('layout');
  if (layout === 'default' || layout === 'classic' || layout === 'compact') return layout;
  return null;
}
