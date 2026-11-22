import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MonthCalendar } from './MonthCalendar';
import type { CalendarEvent } from '../types';

const TODAY = new Date(2026, 9, 15, 12, 0, 0);

function makeEvent(partial: Pick<CalendarEvent, 'id' | 'title' | 'start' | 'end'> & Partial<CalendarEvent>): CalendarEvent {
  return {
    allDay: true,
    calendarId: 'cal-alex',
    calendarName: 'Alex',
    color: '#10b981',
    ...partial,
  };
}

function renderMonth(events: CalendarEvent[] = [], extra: Partial<ComponentProps<typeof MonthCalendar>> = {}) {
  const props = {
    events,
    hiddenCalendars: new Set<string>(),
    onEventClick: vi.fn(),
    onSlotClick: vi.fn(),
    onVisibleMonthChange: vi.fn(),
    weekStartsOn: 0 as const,
    onCalendarLayoutChange: vi.fn(),
    ...extra,
  };
  const view = render(<MonthCalendar {...props} />);
  return { ...view, ...props };
}

describe('MonthCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a 6 by 7 grid with adjacent days dimmed and today marked', () => {
    renderMonth();
    expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
    ]);

    const leading = screen.getByRole('button', { name: 'Show Sunday, September 27' }).closest('[role="gridcell"]');
    expect(leading).toHaveClass('month-day--outside');
    const today = screen.getByRole('button', { name: 'Show Thursday, October 15' }).closest('[role="gridcell"]');
    expect(today).toHaveClass('month-day--today');
    expect(today).toHaveAttribute('aria-current', 'date');
  });

  it('starts the grid on Monday when weekStartsOn is 1', () => {
    renderMonth([], { weekStartsOn: 1 });
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)?.[0]).toBe('Mon');
    expect(screen.getByRole('button', { name: 'Show Monday, September 28' })).toBeInTheDocument();
  });

  it('colors chips by calendar and opens the day from +N more', () => {
    const events = ['Soccer', 'Piano', 'Dentist', 'Dinner', 'Library'].map((title, index) => makeEvent({
      id: `e-${index}`,
      title,
      start: '2026-10-15',
      end: '2026-10-16',
      color: index === 0 ? '#10b981' : '#8b5cf6',
    }));
    events.push(makeEvent({
      id: 'hidden',
      title: 'Hidden practice',
      start: '2026-10-15',
      end: '2026-10-16',
      calendarId: 'cal-hidden',
    }));
    const trip = makeEvent({
      id: 'trip',
      title: 'Trip',
      start: '2026-10-13',
      end: '2026-10-16',
      color: '#f97316',
    });

    const { onEventClick } = renderMonth([...events, trip], {
      hiddenCalendars: new Set(['cal-hidden']),
    });

    const today = screen.getByRole('button', { name: 'Show Thursday, October 15' }).closest('[role="gridcell"]')!;
    const chips = today.querySelectorAll('.month-event-chip');
    expect(chips).toHaveLength(3);
    expect(chips[0].querySelector('.month-event-chip-stripe')).toHaveStyle({ backgroundColor: 'rgb(249, 115, 22)' });
    expect(screen.queryByText('Hidden practice')).not.toBeInTheDocument();

    // The trip occupies the 13th, 14th, and 15th, not the exclusive end on the 16th.
    expect(screen.getByRole('button', { name: 'Show Tuesday, October 13' }).closest('[role="gridcell"]'))
      .toHaveTextContent('Trip');
    expect(screen.getByRole('button', { name: 'Show Friday, October 16' }).closest('[role="gridcell"]'))
      .not.toHaveTextContent('Trip');

    fireEvent.click(screen.getByRole('button', { name: '+3 more' }));
    const dialog = screen.getByRole('dialog', { name: 'Events on Thursday, October 15' });
    expect(dialog).toHaveTextContent('Soccer');
    expect(dialog).toHaveTextContent('Library');
    expect(dialog).toHaveTextContent('Trip');
    expect(dialog).not.toHaveTextContent('Hidden practice');

    fireEvent.click(screen.getByRole('button', { name: /Soccer/ }));
    expect(onEventClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-0' }));
  });

  it('shows the existing loading message until the grid range is cached', () => {
    renderMonth([], { isDayLoaded: () => false });
    expect(screen.getByRole('status')).toHaveTextContent('Loading events...');
    expect(screen.getByRole('grid')).toHaveAttribute('aria-busy', 'true');
  });

  it('moves by month and reports the visible grid start, including adjacent days', () => {
    const { onVisibleMonthChange, onCalendarLayoutChange } = renderMonth();
    expect(onVisibleMonthChange).toHaveBeenCalled();
    const first = onVisibleMonthChange.mock.calls.at(-1)![0] as Date;
    expect(first.getFullYear()).toBe(2026);
    expect(first.getMonth()).toBe(8);
    expect(first.getDate()).toBe(27);

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    const next = onVisibleMonthChange.mock.calls.at(-1)![0] as Date;
    expect(next.getMonth()).toBe(10);
    expect(next.getDate()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(onCalendarLayoutChange).toHaveBeenCalledWith('week');
  });

  it('opens a new event when an empty day is tapped', () => {
    const { onSlotClick } = renderMonth();
    const cell = screen.getByRole('button', { name: 'Show Thursday, October 1' }).closest('[role="gridcell"]')!;
    fireEvent.click(cell);
    expect(onSlotClick).toHaveBeenCalledWith('2026-10-01', 9);
  });
});
