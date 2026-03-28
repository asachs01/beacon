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

export const CALENDAR_COLORS: Record<number, string> = {
  0: '#3b82f6', // blue
  1: '#22c55e', // green
  2: '#a855f7', // purple
  3: '#f97316', // orange
  4: '#ec4899', // pink
  5: '#14b8a6', // teal
};

export function getCalendarColor(index: number): string {
  return CALENDAR_COLORS[index % Object.keys(CALENDAR_COLORS).length];
}

/* Maps a full-saturation calendar color to its pastel variant for event blocks */
const PASTEL_MAP: Record<string, string> = {
  '#3b82f6': '#bfdbfe', // blue
  '#22c55e': '#bbf7d0', // green
  '#a855f7': '#ddd6fe', // purple
  '#f97316': '#fed7aa', // orange
  '#ec4899': '#fbcfe8', // pink
  '#14b8a6': '#99f6e4', // teal
};

export function getPastelColor(fullColor: string): string {
  return PASTEL_MAP[fullColor] || '#e5e7eb';
}

export function getFullColor(fullColor: string): string {
  // If the color is already a known full color, return it
  if (PASTEL_MAP[fullColor]) return fullColor;
  // Fallback
  return '#6b7280';
}
