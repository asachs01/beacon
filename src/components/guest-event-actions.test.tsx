import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EventDetailsPopover } from './EventDetailsPopover';
import { MonthCalendar } from './MonthCalendar';
import { OmniAdd } from './OmniAdd';
import { WeekCalendar } from './WeekCalendar';
import type { CalendarEvent } from '../types';

const anchor = {
  top: 20,
  left: 20,
  right: 80,
  bottom: 60,
  width: 60,
  height: 40,
  x: 20,
  y: 20,
  toJSON() { return {}; },
} as DOMRect;

const event: CalendarEvent = {
  id: 'evt-1',
  title: 'Soccer',
  start: '2026-10-15',
  end: '2026-10-16',
  allDay: true,
  calendarId: 'family',
  calendarName: 'Family',
  color: '#10b981',
};

describe('guest event create and edit', () => {
  it('hides the quick-add event action', () => {
    render(
      <OmniAdd
        allowAddEvent={false}
        onAddEvent={vi.fn()}
        onAddGroceryItem={vi.fn()}
        onAddChore={vi.fn()}
        onNavigateTimer={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Quick add' }));
    expect(screen.queryByRole('button', { name: 'Event' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Grocery' })).toBeInTheDocument();
  });

  it('hides the edit control on an event details popover', () => {
    render(
      <EventDetailsPopover event={event} anchor={anchor} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Open / edit' })).toBeNull();
    expect(screen.getByText('Soccer')).toBeInTheDocument();
  });
});

describe('guest calendar affordances', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not open create or edit from the month calendar', () => {
    const onEventClick = vi.fn();
    const onSlotClick = vi.fn();
    render(
      <MonthCalendar
        events={[event]}
        hiddenCalendars={new Set()}
        onEventClick={onEventClick}
        onSlotClick={onSlotClick}
        allowCreate={false}
        allowEdit={false}
        weekStartsOn={0}
      />,
    );

    const empty = screen.getByRole('button', { name: 'Show Thursday, October 1' }).closest('[role="gridcell"]')!;
    fireEvent.click(empty);
    expect(onSlotClick).not.toHaveBeenCalled();

    expect(screen.queryByRole('button', { name: 'Soccer' })).toBeNull();
    expect(screen.getByText('Soccer')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Soccer'));
    expect(onEventClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Show Thursday, October 15' }));
    expect(screen.queryByRole('button', { name: /Add event on/ })).toBeNull();
    expect(onEventClick).not.toHaveBeenCalled();
    expect(onSlotClick).not.toHaveBeenCalled();
  });

  it('disables week-grid create targets and hides edit', () => {
    const onSlotClick = vi.fn();
    const { container } = render(
      <WeekCalendar
        events={[]}
        hiddenCalendars={new Set()}
        onEventClick={vi.fn()}
        onSlotClick={onSlotClick}
        allowCreate={false}
        allowEdit={false}
        weekStartsOn={0}
      />,
    );
    const slots = container.querySelectorAll('.week-hour-cell-btn');
    expect(slots.length).toBeGreaterThan(0);
    slots.forEach((slot) => {
      expect(slot).toBeDisabled();
    });
    fireEvent.click(slots[0]);
    expect(onSlotClick).not.toHaveBeenCalled();
  });
});
