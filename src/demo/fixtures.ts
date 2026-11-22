/**
 * Fictional household used by the docs screenshot build.
 * No real names, photos, or addresses — the Rivera family is invented.
 *
 * The clock is frozen to DEMO_INSTANT (Wednesday 17 June 2026, 10:30
 * America/New_York). Keep scripts/capture-docs-screenshots.mjs in sync
 * with DEMO_INSTANT and DEMO_TIME_ZONE.
 */
import type { BeaconSettings } from '../hooks/useSettings';
import type { CalendarEvent, CalendarInfo, ForecastDay, WeatherData } from '../types';
import type {
  Chore,
  ChoreCompletion,
  FamilyMember,
  Routine,
  RoutineTaskCompletion,
  Streak,
} from '../types/family';
import type { MealPlanEntry } from '../types/meals';
import type { Photo } from '../types/photos';

export const DEMO_INSTANT = '2026-06-17T10:30:00-04:00';
export const DEMO_TIME_ZONE = 'America/New_York';
export const DEMO_DAY = '2026-06-17';

const ZONE = '-04:00';

function at(day: string, hour: number, minute = 0): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `2026-06-${day}T${hh}:${mm}:00${ZONE}`;
}

export const DEMO_MEMBERS: FamilyMember[] = [
  {
    id: 'alex-rivera',
    name: 'Alex',
    avatar: '👨',
    color: '#3b82f6',
    role: 'parent',
    calendar_entity: 'cal-alex',
  },
  {
    id: 'jordan-rivera',
    name: 'Jordan',
    avatar: '👩',
    color: '#a855f7',
    role: 'parent',
    calendar_entity: 'cal-jordan',
  },
  {
    id: 'sam-rivera',
    name: 'Sam',
    avatar: '🧒',
    color: '#22c55e',
    role: 'child',
    calendar_entity: 'cal-sam',
  },
  {
    id: 'riley-rivera',
    name: 'Riley',
    avatar: '👧',
    color: '#f97316',
    role: 'child',
    calendar_entity: 'cal-riley',
  },
];

export const DEMO_CALENDARS: CalendarInfo[] = [
  { id: 'cal-alex', name: 'Alex', color: '#3b82f6' },
  { id: 'cal-jordan', name: 'Jordan', color: '#a855f7' },
  { id: 'cal-sam', name: 'Sam', color: '#22c55e' },
  { id: 'cal-riley', name: 'Riley', color: '#f97316' },
  { id: 'cal-family', name: 'Family', color: '#14b8a6' },
];

const calendarName = new Map(DEMO_CALENDARS.map((calendar) => [calendar.id, calendar]));

function event(
  id: string,
  calendarId: string,
  title: string,
  start: string,
  end: string,
  allDay = false,
): CalendarEvent {
  const calendar = calendarName.get(calendarId);
  return {
    id,
    title,
    start,
    end,
    allDay,
    calendarId,
    calendarName: calendar?.name ?? calendarId,
    color: calendar?.color ?? '#6366f1',
  };
}

export const DEMO_EVENTS: CalendarEvent[] = [
  event('evt-school-sam', 'cal-sam', 'School', at('15', 0), at('20', 0), true),
  event('evt-school-riley', 'cal-riley', 'School', at('15', 0), at('20', 0), true),
  event('evt-market', 'cal-jordan', 'Farmers market', at('14', 9), at('14', 11)),
  event('evt-dentist', 'cal-alex', 'Dentist', at('16', 13), at('16', 14)),
  event('evt-standup', 'cal-alex', 'Team standup', at('17', 9), at('17', 10)),
  event('evt-library', 'cal-jordan', 'Library volunteering', at('17', 10, 30), at('17', 11, 30)),
  event('evt-piano', 'cal-riley', 'Piano lesson', at('17', 14), at('17', 14, 45)),
  event('evt-errands', 'cal-alex', 'Grocery run', at('17', 15, 30), at('17', 16, 30)),
  event('evt-soccer', 'cal-sam', 'Soccer practice', at('17', 16), at('17', 17, 30)),
  event('evt-meeting', 'cal-family', 'Family meeting', at('17', 19), at('17', 19, 30)),
  event('evt-dance', 'cal-riley', 'Dance class', at('18', 16), at('18', 17)),
  event('evt-books', 'cal-jordan', 'Book club', at('18', 18), at('18', 19, 30)),
  event('evt-pizza', 'cal-family', 'Pizza night', at('19', 18), at('19', 20)),
  event('evt-game', 'cal-sam', 'Soccer game', at('20', 10), at('20', 12)),
  event('evt-hike', 'cal-family', 'Park hike', at('21', 10), at('21', 12)),
  event('evt-checkup', 'cal-alex', 'Checkup', at('24', 11), at('24', 12)),
  event('evt-birthday', 'cal-family', 'Birthday dinner', at('28', 17), at('28', 19)),
].sort((a, b) => a.start.localeCompare(b.start));

export const DEMO_CHORES: Chore[] = [
  { id: 'chore-bed', name: 'Make the bed', assigned_to: ['sam-rivera'], frequency: 'daily', value_cents: 50, icon: '🛏️' },
  { id: 'chore-dog', name: 'Feed the dog', assigned_to: ['sam-rivera'], frequency: 'daily', value_cents: 100, icon: '🐕' },
  { id: 'chore-homework', name: 'Homework', assigned_to: ['sam-rivera'], frequency: 'daily', value_cents: 0, icon: '📚' },
  { id: 'chore-table', name: 'Set the table', assigned_to: ['riley-rivera'], frequency: 'daily', value_cents: 50, icon: '🍽️' },
  { id: 'chore-toys', name: 'Put away toys', assigned_to: ['riley-rivera'], frequency: 'daily', value_cents: 50, icon: '🧺' },
  { id: 'chore-trash', name: 'Take out trash', assigned_to: ['alex-rivera'], frequency: 'weekly', value_cents: 0, icon: '🗑️' },
  { id: 'chore-plants', name: 'Water the plants', assigned_to: ['jordan-rivera'], frequency: 'weekly', value_cents: 0, icon: '🌱' },
];

export const DEMO_COMPLETIONS: ChoreCompletion[] = [
  { chore_id: 'chore-bed', member_id: 'sam-rivera', completed_at: '2026-06-17T14:00:00.000Z' },
  { chore_id: 'chore-toys', member_id: 'riley-rivera', completed_at: '2026-06-17T14:05:00.000Z' },
];

export const DEMO_STREAKS: Streak[] = [
  { member_id: 'sam-rivera', current: 4, longest: 6, last_completed: '2026-06-17T14:00:00.000Z' },
  { member_id: 'riley-rivera', current: 2, longest: 5, last_completed: '2026-06-17T14:05:00.000Z' },
];

export const DEMO_ROUTINES: Routine[] = [
  {
    id: 'routine-sam-morning',
    name: 'Morning routine',
    member_id: 'sam-rivera',
    time_of_day: 'morning',
    tasks: [
      { id: 'task-brush', name: 'Brush teeth', order: 0 },
      { id: 'task-dress', name: 'Get dressed', order: 1 },
      { id: 'task-pack', name: 'Pack backpack', order: 2 },
    ],
  },
  {
    id: 'routine-riley-evening',
    name: 'Bedtime routine',
    member_id: 'riley-rivera',
    time_of_day: 'evening',
    tasks: [
      { id: 'task-pajamas', name: 'Pajamas on', order: 0 },
      { id: 'task-story', name: 'Pick a story', order: 1 },
    ],
  },
];

export const DEMO_ROUTINE_COMPLETIONS: RoutineTaskCompletion[] = [
  {
    routine_id: 'routine-sam-morning',
    task_id: 'task-brush',
    member_id: 'sam-rivera',
    completed_at: '2026-06-17T14:10:00.000Z',
  },
];

export const DEMO_MEALS: MealPlanEntry[] = [
  { date: '2026-06-15', meal_type: 'Dinner', name: 'Sheet-pan chicken' },
  { date: '2026-06-16', meal_type: 'Dinner', name: 'Bean chili' },
  { date: '2026-06-17', meal_type: 'Breakfast', name: 'Blueberry pancakes' },
  { date: '2026-06-17', meal_type: 'Lunch', name: 'Turkey sandwiches' },
  { date: '2026-06-17', meal_type: 'Dinner', name: 'Veggie tacos' },
  { date: '2026-06-17', meal_type: 'Snack', name: 'Apple slices' },
  { date: '2026-06-18', meal_type: 'Dinner', name: 'Baked potatoes' },
  { date: '2026-06-19', meal_type: 'Dinner', name: 'Homemade pizza' },
  { date: '2026-06-20', meal_type: 'Lunch', name: 'Picnic wraps' },
];

export interface DemoTask {
  id: string;
  summary: string;
  status: 'needs_action' | 'completed';
  listId: string;
  createdAt: string;
}

export const DEMO_GROCERY: DemoTask[] = [
  { id: 'item-milk', summary: 'Milk', status: 'needs_action', listId: 'beacon-shopping', createdAt: DEMO_INSTANT },
  { id: 'item-eggs', summary: 'Eggs', status: 'needs_action', listId: 'beacon-shopping', createdAt: DEMO_INSTANT },
  { id: 'item-bananas', summary: 'Bananas', status: 'needs_action', listId: 'beacon-shopping', createdAt: DEMO_INSTANT },
  { id: 'item-bread', summary: 'Whole wheat bread', status: 'needs_action', listId: 'beacon-shopping', createdAt: DEMO_INSTANT },
  { id: 'item-pasta', summary: 'Pasta', status: 'needs_action', listId: 'beacon-shopping', createdAt: DEMO_INSTANT },
  { id: 'item-sauce', summary: 'Marinara sauce', status: 'needs_action', listId: 'beacon-shopping', createdAt: DEMO_INSTANT },
  { id: 'item-spinach', summary: 'Spinach', status: 'completed', listId: 'beacon-shopping', createdAt: DEMO_INSTANT },
  { id: 'item-yogurt', summary: 'Yogurt', status: 'completed', listId: 'beacon-shopping', createdAt: DEMO_INSTANT },
];

export const DEMO_PHOTOS: Photo[] = [
  {
    url: '/demo/photo-placeholder.svg',
    caption: 'Photo placeholder',
    source: 'local',
  },
];

export const DEMO_WEATHER: WeatherData = {
  temperature: 74,
  temperatureUnit: '°F',
  condition: 'partlycloudy',
  humidity: 48,
  windSpeed: 8,
  forecast: [],
};

export const DEMO_FORECAST: ForecastDay[] = [
  { date: '2026-06-14', condition: 'sunny', tempHigh: 78, tempLow: 61 },
  { date: '2026-06-15', condition: 'partlycloudy', tempHigh: 76, tempLow: 60 },
  { date: '2026-06-16', condition: 'rainy', tempHigh: 70, tempLow: 58 },
  { date: '2026-06-17', condition: 'partlycloudy', tempHigh: 74, tempLow: 59 },
  { date: '2026-06-18', condition: 'sunny', tempHigh: 80, tempLow: 62 },
  { date: '2026-06-19', condition: 'cloudy', tempHigh: 73, tempLow: 60 },
  { date: '2026-06-20', condition: 'sunny', tempHigh: 81, tempLow: 63 },
];

/** Partial settings merged over the real defaults so lead times and the rest stay accurate. */
export const DEMO_SETTINGS: Partial<BeaconSettings> = {
  familyName: 'Rivera',
  themeId: 'skylight',
  autoDarkMode: false,
  screenSaverEnabled: false,
  defaultGroceryList: 'beacon-shopping',
  locale: 'en-US',
  timeFormat: '12h',
  weekStartsOn: 0,
  choresEnabled: true,
  kioskMode: false,
  dashboardLayout: 'default',
};
