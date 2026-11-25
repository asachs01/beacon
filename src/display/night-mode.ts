/**
 * Night mode schedule. Times are device-local HH:mm (seconds optional).
 * The window includes the start minute and excludes the end minute.
 * A start later than the end crosses midnight (21:00–06:30).
 */

export const NIGHT_THEME_ID = 'midnight';
export const NIGHT_WAKE_MS = 60_000;
export const NIGHT_EVAL_MS = 60_000;
export const DEFAULT_NIGHT_START = '21:00';
export const DEFAULT_NIGHT_END = '06:30';
export const DEFAULT_NIGHT_BRIGHTNESS = 30;

export type NightModeOverride = 'schedule' | 'on' | 'off';

export interface NightModeSchedule {
  enabled: boolean;
  start: string;
  end: string;
  override: NightModeOverride;
}

export function normalizeNightOverride(value: unknown): NightModeOverride {
  return value === 'on' || value === 'off' || value === 'schedule' ? value : 'schedule';
}

/** Minutes since local midnight, or null when the string is not a clock time. */
export function minutesOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * True when `now` falls in the local window. Equal start and end is an
 * empty window. Invalid times are outside the window.
 */
export function isWithinNightWindow(now: Date, start: string, end: string): boolean {
  const startMin = minutesOfDay(start);
  const endMin = minutesOfDay(end);
  if (startMin == null || endMin == null || startMin === endMin) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (startMin < endMin) return current >= startMin && current < endMin;
  return current >= startMin || current < endMin;
}

/**
 * Night mode is off unless the feature is enabled. A manual override then
 * forces it on or off. Otherwise the device clock is compared to the window.
 */
export function isNightModeActive(schedule: NightModeSchedule, now: Date): boolean {
  if (!schedule.enabled) return false;
  const override = normalizeNightOverride(schedule.override);
  if (override === 'on') return true;
  if (override === 'off') return false;
  return isWithinNightWindow(now, schedule.start, schedule.end);
}

/** Black-overlay opacity that leaves `brightness` percent of the screen visible. */
export function nightDimOpacity(brightness: number): number {
  if (!Number.isFinite(brightness)) return (100 - DEFAULT_NIGHT_BRIGHTNESS) / 100;
  const pct = Math.min(100, Math.max(0, brightness));
  return (100 - pct) / 100;
}

/**
 * Pull a schedule out of a stored settings blob. Missing night-mode keys
 * mean the feature was never saved, which stays off.
 */
export function nightScheduleFromUnknown(value: unknown): NightModeSchedule | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.nightModeEnabled !== 'boolean') return null;
  return {
    enabled: raw.nightModeEnabled,
    start: typeof raw.nightModeStart === 'string' ? raw.nightModeStart : DEFAULT_NIGHT_START,
    end: typeof raw.nightModeEnd === 'string' ? raw.nightModeEnd : DEFAULT_NIGHT_END,
    override: normalizeNightOverride(raw.nightModeOverride),
  };
}
