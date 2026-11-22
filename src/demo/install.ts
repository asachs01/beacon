import {
  DEMO_CHORES,
  DEMO_COMPLETIONS,
  DEMO_GROCERY,
  DEMO_MEALS,
  DEMO_MEMBERS,
  DEMO_ROUTINE_COMPLETIONS,
  DEMO_ROUTINES,
  DEMO_SETTINGS,
  DEMO_STREAKS,
} from './fixtures';
import { demoLayoutOverride, demoThemeOverride } from './location';
import type { BeaconSettings } from '../hooks/useSettings';

/**
 * Seed localStorage before React renders. The screenshot build calls this
 * from main.tsx; production builds tree-shake the call site.
 */
export function installDemo(): void {
  if (typeof localStorage === 'undefined') return;

  const settings: Partial<BeaconSettings> = { ...DEMO_SETTINGS };
  const theme = demoThemeOverride();
  const layout = demoLayoutOverride();
  if (theme) settings.themeId = theme;
  if (layout) settings.dashboardLayout = layout;

  const entries: Record<string, unknown> = {
    beacon_family_members: DEMO_MEMBERS,
    beacon_chores: DEMO_CHORES,
    beacon_completions: DEMO_COMPLETIONS,
    beacon_streaks: DEMO_STREAKS,
    beacon_routines: DEMO_ROUTINES,
    beacon_routine_completions: DEMO_ROUTINE_COMPLETIONS,
    beacon_meal_plans: DEMO_MEALS,
    'beacon-local-tasks': DEMO_GROCERY,
    'beacon-settings': settings,
  };

  for (const [key, value] of Object.entries(entries)) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  if (settings.themeId) localStorage.setItem('beacon-theme', settings.themeId);
}
