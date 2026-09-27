import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { startOfDay } from 'date-fns';

// App with Home Assistant connected; calendar fetches are only recorded.
const mocks = vi.hoisted(() => {
  const fetchEvents = vi.fn(async (_start: string, _end: string) => {});
  return {
    fetchEvents,
    calendarEvents: {
      calendars: [],
      events: [] as unknown[],
      loading: false,
      fetchCalendars: async () => [],
      fetchEvents,
      createEvent: async () => {},
      updateEvent: async () => {},
      deleteEvent: async () => {},
    },
    homeAssistant: { client: () => null, connected: true },
    auth: {
      state: { isOnboarded: true, loading: false, haUrl: '', haToken: '' },
      saveManualToken: async () => {},
      logout: async () => {},
    },
    tasks: { items: [], toggleItem: async () => {}, users: [] },
  };
});

vi.mock('./hooks/useHomeAssistant', () => ({ useHomeAssistant: () => mocks.homeAssistant }));
vi.mock('./hooks/useHaAuth', () => ({ useHaAuth: () => mocks.auth }));
vi.mock('./hooks/useCalendarEvents', () => ({
  CalendarNotSupportedError: class extends Error {},
  useCalendarEvents: () => mocks.calendarEvents,
}));
vi.mock('./hooks/useDashboardTasks', () => ({ useDashboardTasks: () => mocks.tasks }));

import { App } from './App';

/** The window of the last calendar fetch. */
function lastFetched() {
  const [start, end] = mocks.fetchEvents.mock.calls.at(-1)!;
  return { start: new Date(start), end: new Date(end) };
}

/** Whether the last fetch covered all of `day`. */
function coversDay(day: Date) {
  const { start, end } = lastFetched();
  const dayStart = startOfDay(day).getTime();
  return start.getTime() <= dayStart && end.getTime() >= dayStart + 24 * 60 * 60 * 1000;
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

beforeEach(() => {
  // jsdom has no matchMedia; the Calendar screen uses it to pick the mobile layout.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  mocks.fetchEvents.mockClear();
  delete (document as { hidden?: boolean }).hidden;
});

describe('App: which week of events is loaded', () => {
  // Only the Calendar screen set the week, so a wall display left on the
  // dashboard kept loading the week it was opened in: from the next Monday
  // on, its agenda, reminders and Calendar sidebar showed no events.
  it('moves on to the new week on a display left on the dashboard', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 23, 9, 0)); // a Wednesday
    render(<App />);
    await settle();
    expect(coversDay(new Date(2026, 8, 23))).toBe(true);

    // Nine days on, the clock catches up the next time the page is looked at.
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await settle();

    expect(coversDay(new Date(2026, 9, 2))).toBe(true);
  });

  it("loads today's week again on going back to the dashboard from another week on the Calendar", async () => {
    render(<App />);
    await settle();

    fireEvent.click(screen.getAllByRole('button', { name: 'Calendar' })[0]);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await settle();
    expect(coversDay(new Date())).toBe(false);

    fireEvent.click(screen.getAllByRole('button', { name: 'Dashboard' })[0]);
    await settle();

    expect(coversDay(new Date())).toBe(true);
  });
});
