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
