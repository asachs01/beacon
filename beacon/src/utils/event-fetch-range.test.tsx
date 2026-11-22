import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { addDays, startOfWeek } from 'date-fns';
import { buildMonthGrid } from './month-grid';
import { FamilyCalendarCard } from '../components/cards/FamilyCalendarCard';
import { AgendaTodayCard } from '../components/cards/AgendaTodayCard';
import { AgendaWeekCard } from '../components/cards/AgendaWeekCard';
import { useEnsureEventRange } from '../hooks/useEnsureEventRange';
import type { DashboardCardContext } from '../types/dashboard-cards';
import type { CalendarEvent } from '../types';
import {
  EVENT_FETCH_DEBOUNCE_MS,
  isInstantCovered,
  mergeEventsForRange,
  monthEventRange,
  rangesForView,
  weekEventRange,
  type LoadedEventRange,
} from './event-fetch-range';

// Friday, so a Sunday-start week does not extend far in either direction.
const NOW = new Date(2026, 10, 20, 12, 0, 0);

function viewRanges(activeView: string, dashboardDate: Date) {
  return rangesForView({
    activeView,
    dashboardDate,
    visibleWeekStart: startOfWeek(NOW, { weekStartsOn: 0 }),
    weekStartsOn: 0,
  });
}

function covers(ranges: { startMs: number; endMs: number }[], day: Date) {
  return ranges.some((range) => isInstantCovered([range], day));
}

describe('dashboard event fetch range (issue 62)', () => {
  it('the visible calendar week does not cover a dashboard date a few days out', () => {
    const visibleWeek = weekEventRange(startOfWeek(NOW, { weekStartsOn: 0 }));
    // Reporter: navigating more than a few days from today shows nothing,
    // because that fetch window never moved with the dashboard date.
    expect(isInstantCovered([visibleWeek], addDays(NOW, 4))).toBe(false);
    expect(isInstantCovered([visibleWeek], addDays(NOW, -10))).toBe(false);
    expect(isInstantCovered([visibleWeek], NOW)).toBe(true);
  });

  it('derives a dashboard window that contains the selected date, ahead or behind', () => {
    for (const offset of [4, 10, -10, -20]) {
      const day = addDays(NOW, offset);
      const dashboard = viewRanges('dashboard', day);
      const calendar = viewRanges('calendar', day);
      expect(covers(dashboard, day)).toBe(true);
      expect(covers(calendar, day)).toBe(false);
    }
  });

  it('keeps neighboring dashboard days on one week-sized request', () => {
    const friday = viewRanges('dashboard', NOW);
    const saturday = viewRanges('dashboard', addDays(NOW, 1));
    expect(friday).toEqual(saturday);
  });

  it('follows the calendar week when that view is active, including a Monday start', () => {
    const mondayStart = new Date(2026, 10, 16); // Monday
    const ranges = rangesForView({
      activeView: 'calendar',
      dashboardDate: addDays(mondayStart, 20),
      visibleWeekStart: startOfWeek(mondayStart, { weekStartsOn: 1 }),
      weekStartsOn: 1,
    });
    expect(covers(ranges, mondayStart)).toBe(true);
    expect(covers(ranges, addDays(mondayStart, 20))).toBe(false);
  });

  it('merges a new window without dropping events outside it', () => {
    const range = {
      startMs: Date.parse('2026-12-01T00:00:00.000Z'),
      endMs: Date.parse('2026-12-08T00:00:00.000Z'),
    };
    const existing = [
      { id: 'today', title: 'Today', start: '2026-11-20T15:00:00.000Z', end: '2026-11-20T16:00:00.000Z' },
      { id: 'old', title: 'Stale', start: '2026-12-02T15:00:00.000Z', end: '2026-12-02T16:00:00.000Z' },
      { id: 'moved', title: 'Was outside', start: '2026-11-01T15:00:00.000Z', end: '2026-11-01T16:00:00.000Z' },
    ];
    const incoming = [
      { id: 'old', title: 'Updated', start: '2026-12-02T15:00:00.000Z', end: '2026-12-02T16:00:00.000Z' },
      { id: 'moved', title: 'Now inside', start: '2026-12-03T15:00:00.000Z', end: '2026-12-03T16:00:00.000Z' },
      { id: 'added', title: 'Added', start: '2026-12-04T15:00:00.000Z', end: '2026-12-04T16:00:00.000Z' },
    ];

    const merged = mergeEventsForRange(existing, incoming, range);
    expect(merged.map((event) => event.id)).toEqual(['today', 'old', 'moved', 'added']);
    expect(merged.find((event) => event.id === 'old')?.title).toBe('Updated');
    expect(merged.find((event) => event.id === 'today')?.title).toBe('Today');
  });

  it('App asks for ranges from the dashboard date, not only the visible week', () => {
    const source = readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
    expect(source).toMatch(/rangesForView\(\{[\s\S]*?dashboardDate/);
    expect(source).toMatch(/calendarLayout/);
    expect(source).toMatch(/visibleMonthStart/);
    expect(source).not.toContain('refetchEventsForWeek(visibleWeekStart)');
  });
});

describe('month event fetch range', () => {
  it('covers every visible grid day, including the adjacent-month cells', () => {
    const grid = buildMonthGrid(new Date(2026, 9, 15), 0); // October 2026
    const ranges = rangesForView({
      activeView: 'calendar',
      dashboardDate: addDays(NOW, 40),
      visibleWeekStart: startOfWeek(NOW, { weekStartsOn: 0 }),
      weekStartsOn: 0,
      calendarLayout: 'month',
      visibleMonthStart: grid.days[0],
    });

    expect(ranges).toEqual([monthEventRange(grid.days[0])]);
    for (const day of grid.days) {
      expect(covers(ranges, day)).toBe(true);
    }
    expect(covers(ranges, addDays(grid.days[0], -1))).toBe(false);
    expect(covers(ranges, addDays(grid.days[41], 1))).toBe(false);
    // Leading September day and trailing November day are both inside the window.
    expect(covers(ranges, new Date(2026, 8, 27))).toBe(true);
    expect(covers(ranges, new Date(2026, 10, 7))).toBe(true);
  });

  it('keeps the week window for the calendar week layout and for the dashboard', () => {
    const grid = buildMonthGrid(new Date(2026, 9, 15), 1);
    const input = {
      activeView: 'calendar',
      dashboardDate: addDays(NOW, 20),
      visibleWeekStart: startOfWeek(NOW, { weekStartsOn: 0 }),
      weekStartsOn: 0 as const,
      calendarLayout: 'week' as const,
      visibleMonthStart: grid.days[0],
    };
    expect(rangesForView(input)).toEqual([weekEventRange(input.visibleWeekStart)]);
    expect(rangesForView({ ...input, activeView: 'dashboard', calendarLayout: 'month' }))
      .toEqual(viewRanges('dashboard', input.dashboardDate));
  });
});

describe('useEnsureEventRange', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function flush(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  function renderRange(date: Date, loadedRanges: LoadedEventRange[] = []) {
    const fetchEvents = vi.fn<(start: string, end: string) => Promise<void>>().mockResolvedValue(undefined);
    const hook = renderHook(
      ({ day, loaded }: { day: Date; loaded: LoadedEventRange[] }) => useEnsureEventRange({
        enabled: true,
        activeView: 'dashboard',
        dashboardDate: day,
        ranges: viewRanges('dashboard', day),
        loadedRanges: loaded,
        fetchEvents,
      }),
      { initialProps: { day: date, loaded: loadedRanges } },
    );
    return { ...hook, fetchEvents };
  }

  it('does not refetch a dashboard date that is already inside a fresh cached week', async () => {
    const far = addDays(NOW, 10);
    const loaded = viewRanges('dashboard', far).map((range) => ({ ...range, fetchedAt: Date.now() }));
    const { fetchEvents, result } = renderRange(far, loaded);

    await flush(EVENT_FETCH_DEBOUNCE_MS + 50);

    expect(fetchEvents).not.toHaveBeenCalled();
    expect(result.current.selectedDayLoading).toBe(false);
    expect(result.current.isDayLoaded(far)).toBe(true);
  });

  it('fetches a range covering a dashboard date outside the cached week', async () => {
    const far = addDays(NOW, 10);
    const { fetchEvents, result } = renderRange(far);

    expect(result.current.selectedDayLoading).toBe(true);
    expect(fetchEvents).not.toHaveBeenCalled();

    await flush(1);

    expect(fetchEvents).toHaveBeenCalledTimes(1);
    const [start, end] = fetchEvents.mock.calls[0];
    expect(Date.parse(start)).toBeLessThanOrEqual(far.getTime());
    expect(far.getTime()).toBeLessThan(Date.parse(end));
  });

  it('debounces rapid week changes into one fetch for the date the user stops on', async () => {
    const { fetchEvents, rerender } = renderRange(NOW);
    await flush(1);
    expect(fetchEvents).toHaveBeenCalledTimes(1);
    fetchEvents.mockClear();

    rerender({ day: addDays(NOW, 10), loaded: [] });
    rerender({ day: addDays(NOW, 21), loaded: [] });

    await flush(EVENT_FETCH_DEBOUNCE_MS - 1);
    expect(fetchEvents).not.toHaveBeenCalled();

    await flush(1);

    const stoppedOn = addDays(NOW, 21);
    const skipped = addDays(NOW, 10);
    expect(fetchEvents).toHaveBeenCalledTimes(1);
    const [start, end] = fetchEvents.mock.calls[0];
    expect(Date.parse(start)).toBeLessThanOrEqual(stoppedOn.getTime());
    expect(stoppedOn.getTime()).toBeLessThan(Date.parse(end));
    expect(Date.parse(start) <= skipped.getTime() && skipped.getTime() < Date.parse(end)).toBe(false);
  });

  it('does not refetch when the next dashboard day is still inside the loaded week', async () => {
    const { fetchEvents, rerender } = renderRange(NOW);
    await flush(1);
    const calls = fetchEvents.mock.calls.length;

    rerender({ day: addDays(NOW, 1), loaded: [] });
    await flush(EVENT_FETCH_DEBOUNCE_MS + 50);

    expect(fetchEvents.mock.calls.length).toBe(calls);
  });
});

function practiceEvent(): CalendarEvent {
  return {
    id: 'practice',
    title: 'Soccer',
    start: '2026-11-24T15:00:00.000Z',
    end: '2026-11-24T16:00:00.000Z',
    allDay: false,
    calendarId: 'calendar.ada',
    calendarName: 'Ada',
    color: '#10b981',
  };
}

function memberContext(overrides: Partial<DashboardCardContext>): DashboardCardContext {
  return {
    members: [{
      id: 'ada',
      name: 'Ada',
      avatar: 'A',
      color: '#10b981',
      role: 'parent',
      calendar_entity: 'calendar.ada',
    }],
    byMember: new Map([['ada', []]]),
    other: [],
    todayEvents: [],
    isViewingToday: false,
    selectedMemberFilter: null,
    toggleMemberFilter: () => {},
    onEventClick: () => {},
    ...overrides,
  } as DashboardCardContext;
}

describe('dashboard empty state while events are loading', () => {
  it('shows a loading message instead of "nothing scheduled" for the selected day', () => {
    const { rerender } = render(
      <FamilyCalendarCard config={{}} context={memberContext({ eventsLoading: true })} />,
    );
    expect(screen.getByText('Loading events...')).toBeInTheDocument();
    expect(screen.queryByText('Nothing scheduled this day')).not.toBeInTheDocument();

    rerender(
      <FamilyCalendarCard config={{}} context={memberContext({ eventsLoading: false })} />,
    );
    expect(screen.getByText('Nothing scheduled this day')).toBeInTheDocument();
  });

  it('keeps events on screen while a fetch is still in flight', () => {
    render(
      <FamilyCalendarCard
        config={{}}
        context={memberContext({
          eventsLoading: true,
          byMember: new Map([['ada', [practiceEvent()]]]),
        })}
      />,
    );
    expect(screen.getByText('Soccer')).toBeInTheDocument();
    expect(screen.queryByText('Loading events...')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing scheduled this day')).not.toBeInTheDocument();
  });

  it('uses the same loading copy on the classic today and week columns', () => {
    const day = addDays(NOW, 4);
    const { rerender } = render(
      <AgendaTodayCard config={{}} context={memberContext({ eventsLoading: true, todayEvents: [] })} />,
    );
    expect(screen.getByText('Loading events...')).toBeInTheDocument();

    rerender(
      <AgendaWeekCard
        config={{}}
        context={memberContext({
          weekEvents: [{ day, events: [] }],
          isDayLoaded: () => false,
        })}
      />,
    );
    expect(screen.getByText('Loading events...')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
