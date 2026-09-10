export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string;
  calendarId: string;
  calendarName: string;
  color: string;
  recurrence?: RecurrenceFrequency;
  recurrenceEnd?: string;
  /**
   * Whether this event has a real, stable UID from its calendar provider
   * (HA's `uid` or `recurrence_id`), as opposed to a synthetic composite
   * fallback id assigned client-side when the provider didn't return one.
   * `undefined` means "not applicable" (e.g. locally-stored Beacon events,
   * which always have a real, stable id). Only ever explicitly `false` for
   * HA-backed events without a usable uid — edit/delete should be blocked
   * against HA's calendar services in that case, since the fallback id
   * isn't a real event uid the service will recognize.
   */
  hasStableId?: boolean;
}

export interface CalendarInfo {
  id: string;
  name: string;
  color: string;
}

export interface WeatherData {
  temperature: number;
  temperatureUnit: string;
  condition: string;
  humidity?: number;
  windSpeed?: number;
  forecast: ForecastDay[];
}

export interface ForecastDay {
  date: string;
  condition: string;
  tempHigh: number;
  tempLow: number;
}

/* 4-category color set (Sage/Lavender/Coral/Teal) — see docs/design-tokens.md.
   Rose was cut (least distinguishable from Coral); Ocean/Soft-Blue merged into
   the primary accent, so it's not part of the category rotation. */
export const CALENDAR_COLORS: Record<number, string> = {
  0: '#10b981', // sage
  1: '#8b5cf6', // lavender
  2: '#f97316', // coral
  3: '#14b8a6', // teal
};

/* Picker swatches, also the positional auto-assignment order (first four keep
   the original category colors; extra hues stop early collisions). */
export const CALENDAR_COLOR_PRESETS: string[] = [
  '#10b981', // sage    (category)
  '#8b5cf6', // lavender (category)
  '#f97316', // coral   (category)
  '#14b8a6', // teal    (category)
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#ef4444', // red
  '#f43f5e', // rose
  '#ec4899', // pink
  '#a855f7', // purple
  '#eab308', // yellow
  '#22c55e', // green
];

export function getCalendarColor(index: number): string {
  return CALENDAR_COLOR_PRESETS[index % CALENDAR_COLOR_PRESETS.length];
}

/**
 * Minimal shape needed from a FamilyMember to resolve a calendar's color.
 * Kept structural (not imported from types/family.ts) to avoid a circular
 * import between types.ts and types/family.ts.
 */
export interface CalendarColorMember {
  color: string;
  calendar_entity?: string;
  additional_calendar_entities?: string[];
}

/**
 * Picks a calendar's display color: user override > linked family member >
 * defaultColor > positional preset. Single source of truth so every view
 * (Dashboard, Calendar, Settings) agrees.
 */
export function resolveCalendarColor(
  calendarId: string,
  index: number,
  options?: {
    calendarColors?: Record<string, string>;
    members?: CalendarColorMember[];
    defaultColor?: string;
  },
): string {
  const userColor = options?.calendarColors?.[calendarId];
  if (userColor) return userColor;

  const members = options?.members || [];
  const linkedMember = members.find(
    (m) =>
      m.calendar_entity === calendarId ||
      m.additional_calendar_entities?.includes(calendarId),
  );
  if (linkedMember?.color) return linkedMember.color;

  return options?.defaultColor ?? getCalendarColor(index);
}

/* Maps a full-saturation calendar color to its pastel variant for event blocks */
const PASTEL_MAP: Record<string, string> = {
  '#10b981': '#bbf7d0', // sage
  '#8b5cf6': '#ddd6fe', // lavender
  '#f97316': '#fed7aa', // coral
  '#14b8a6': '#99f6e4', // teal
};

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;

/**
 * Lightens an arbitrary hex color by mixing it toward white. Used for
 * custom per-calendar colors and family-member colors that fall outside
 * the fixed 4-category palette (which use hand-picked PASTEL_MAP entries
 * instead, since those look better than the generic algorithm).
 */
function lightenHex(hex: string, amount = 0.72): string {
  const match = HEX_COLOR_RE.exec(hex);
  if (!match) return '#e5e7eb';
  const num = parseInt(match[1], 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

export function getPastelColor(fullColor: string): string {
  if (PASTEL_MAP[fullColor]) return PASTEL_MAP[fullColor];
  if (HEX_COLOR_RE.test(fullColor)) return lightenHex(fullColor);
  return '#e5e7eb';
}

export function getFullColor(fullColor: string): string {
  // If the color is already a known full color, return it
  if (PASTEL_MAP[fullColor]) return fullColor;
  // Any other valid hex color (custom calendar color or family-member
  // color) is used as-is so it actually shows up distinctly.
  if (HEX_COLOR_RE.test(fullColor)) return fullColor;
  // Fallback for anything unparseable (empty string, etc.)
  return '#6b7280';
}
