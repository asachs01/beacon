import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { WeekCalendar } from './WeekCalendar';

describe('WeekCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // jsdom has no matchMedia; the calendar uses it to pick the mobile layout.
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
  });

  it("labels the hours and events in Settings' time format", () => {
    vi.setSystemTime(new Date(2026, 8, 28, 9, 0));
    const event = {
      id: 'e1', title: 'Swim', start: '2026-09-28T16:00:00', end: '2026-09-28T17:30:00', allDay: false,
      calendarId: 'calendar.family', calendarName: 'Family', color: '#3b82f6',
    };
    const { getByText, getByTitle, rerender } = render(
      <WeekCalendar events={[event]} hiddenCalendars={new Set()} onEventClick={vi.fn()} onSlotClick={vi.fn()} timeFormat="24h" />,
    );
    expect(getByText('15:00')).toBeInTheDocument();
    expect(getByTitle('Swim (16:00 - 17:30)')).toBeInTheDocument();

    rerender(<WeekCalendar events={[event]} hiddenCalendars={new Set()} onEventClick={vi.fn()} onSlotClick={vi.fn()} />);
    expect(getByText('3 PM')).toBeInTheDocument();
    expect(getByTitle('Swim (4:00 - 5:30 PM)')).toBeInTheDocument();
  });

  // A wall display stays open for days. It used to keep showing (and
  // fetching events for) the old week after Saturday midnight until the
  // page was reloaded.
  it('moves on to the new week after Saturday midnight', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 22, 0)); // Sat 3 Oct 2026, 10pm
    const onVisibleWeekChange = vi.fn();
    const props = {
      hiddenCalendars: new Set<string>(),
      onEventClick: vi.fn(),
      onSlotClick: vi.fn(),
      onVisibleWeekChange,
    };

    const { rerender } = render(<WeekCalendar events={[]} {...props} />);
    expect(onVisibleWeekChange).toHaveBeenLastCalledWith(new Date(2026, 8, 27)); // Sun 27 Sep

    vi.setSystemTime(new Date(2026, 9, 4, 7, 0)); // Sun 4 Oct, 7am
    // Any later re-render (the 5-minute event refresh, a weather update, ...).
    rerender(<WeekCalendar events={[]} {...props} />);
    expect(onVisibleWeekChange).toHaveBeenLastCalledWith(new Date(2026, 9, 4)); // Sun 4 Oct
  });

  it('starts the week on Monday when set to', () => {
    vi.setSystemTime(new Date(2026, 8, 27, 10, 0)); // Sun 27 Sep 2026
    const onVisibleWeekChange = vi.fn();
    render(
      <WeekCalendar
        events={[]}
        hiddenCalendars={new Set()}
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
        onVisibleWeekChange={onVisibleWeekChange}
        weekStartsOn={1}
      />,
    );
    // Sunday is the last day of the week that started on Monday 21 Sep.
    expect(onVisibleWeekChange).toHaveBeenLastCalledWith(new Date(2026, 8, 21));
  });

  // Hour rows are var(--hour-height) tall, which is 64px or less on
  // tablets and phones; events were placed as if every row were 72px, so
  // a 4pm event showed up around 5pm and the error grew through the day.
  it('places timed events in units of the hour-row height', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 10, 0));
    const { container } = render(
      <WeekCalendar
        events={[{
          id: 'ev-1',
          title: 'Soccer practice',
          start: '2026-09-26T16:00:00',
          end: '2026-09-26T17:30:00',
          allDay: false,
          calendarId: 'calendar.family',
          calendarName: 'Family',
          color: '#22c55e',
        }]}
        hiddenCalendars={new Set()}
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
      />,
    );
    const block = container.querySelector<HTMLElement>('.event-block')!;
    expect(block.style.top).toBe('calc(var(--hour-height) * 9)'); // 4pm is 9 hours below 7am
    expect(block.style.height).toBe('max(22px, calc(var(--hour-height) * 1.5))');
  });
  // Phones show the week a few days at a time. Multi-day bars were laid out
  // against the visible days rather than the week, so on any page but the
  // first they were dropped, leaving an empty all-day row.
  it('shows multi-day events on later pages of the phone layout', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 10, 0)); // Sat 26 Sep: the last page
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container } = render(
      <WeekCalendar
        events={[{
          id: 'ev-vacation',
          title: 'Vacation',
          start: '2026-09-25',
          end: '2026-09-29',
          allDay: true,
          calendarId: 'calendar.family',
          calendarName: 'Family',
          color: '#22c55e',
        }]}
        hiddenCalendars={new Set()}
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
      />,
    );
    const bars = container.querySelectorAll<HTMLElement>('.event-block--multiday');
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toContain('Vacation');
  });
  describe('timed events that cross midnight', () => {
    const renderWith = (start: string, end: string) => {
      vi.setSystemTime(new Date(2026, 8, 23, 10, 0)); // Wed 23 Sep 2026
      return render(
        <WeekCalendar
          events={[{
            id: 'ev-late',
            title: 'Late movie',
            start,
            end,
            allDay: false,
            calendarId: 'calendar.family',
            calendarName: 'Family',
            color: '#22c55e',
          }]}
          hiddenCalendars={new Set()}
          onEventClick={vi.fn()}
          onSlotClick={vi.fn()}
        />,
      ).container;
    };
    const dayColumns = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.week-day-column')];
    const blocksIn = (column: HTMLElement) => [...column.querySelectorAll<HTMLElement>('.event-block')];

    // A 10pm–1am movie used to be drawn as a two-day all-day bar.
    it('pins a late event to the bottom of the grid on the day it starts', () => {
      const container = renderWith('2026-09-26T22:00:00', '2026-09-27T01:00:00');
      expect(container.querySelector('.event-block--multiday')).toBeNull();

      const columns = dayColumns(container);
      const saturday = columns[6];
      expect(columns.filter((c) => blocksIn(c).length > 0)).toEqual([saturday]);
      const [block] = blocksIn(saturday);
      expect(block.style.top).toBe('calc(var(--hour-height) * 14 - 22px)'); // bottom edge (9pm)
      expect(block.style.height).toBe('22px');
    });

    it('shows each day the part of an overnight event within grid hours', () => {
      const container = renderWith('2026-09-23T20:00:00', '2026-09-24T08:30:00');
      const [, , , wednesday, thursday] = dayColumns(container);

      expect(blocksIn(wednesday)[0].style.top).toBe('calc(var(--hour-height) * 13)'); // 8pm
      expect(blocksIn(wednesday)[0].style.height).toBe('max(22px, calc(var(--hour-height) * 1))'); // to 9pm
      expect(blocksIn(thursday)[0].style.top).toBe('calc(var(--hour-height) * 0)'); // from 7am
      expect(blocksIn(thursday)[0].style.height).toBe('max(22px, calc(var(--hour-height) * 1.5))'); // to 8:30
    });

    // Layout used the events' own times: a 20:00–08:00 event (drawn 7–8am
    // on its second day) looked clear of a 7:30 event and was drawn on top
    // of it, and two late events were both pinned to the same spot.
    it('puts events drawn over each other side by side', () => {
      vi.setSystemTime(new Date(2026, 8, 23, 10, 0));
      const ev = (id: string, start: string, end: string) => ({
        id, title: id, start, end, allDay: false, calendarId: 'c', calendarName: 'C', color: '#22c55e',
      });
      const container = render(
        <WeekCalendar
          events={[
            ev('overnight', '2026-09-23T20:00:00', '2026-09-24T08:00:00'),
            ev('breakfast', '2026-09-24T07:30:00', '2026-09-24T08:30:00'),
            ev('late-a', '2026-09-24T22:00:00', '2026-09-24T23:00:00'),
            ev('late-b', '2026-09-24T22:30:00', '2026-09-24T23:30:00'),
          ]}
          hiddenCalendars={new Set()}
          onEventClick={vi.fn()}
          onSlotClick={vi.fn()}
        />,
      ).container;
      const thursday = dayColumns(container)[4];
      const lefts = Object.fromEntries(blocksIn(thursday).map((b) => [b.textContent?.replace(/\d.*$/, ''), b.style.left]));
      // The earlier of each pair spans the column behind; the later one is
      // inset beside it (was: both full width, one hiding the other).
      expect(lefts).toEqual({ overnight: '', breakfast: expect.stringContaining('50%'), 'late-a': '', 'late-b': expect.stringContaining('50%') });
    });

    it('keeps timed events of a day or longer as bars', () => {
      const container = renderWith('2026-09-23T09:00:00', '2026-09-25T17:00:00');
      expect(container.querySelectorAll('.event-block--multiday')).toHaveLength(1);
    });
  });
});
