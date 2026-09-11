import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCard } from './EventCard';
import { CalendarEvent } from '../types';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Soccer Practice',
    start: '2026-08-02T16:00:00',
    end: '2026-08-02T17:30:00',
    allDay: false,
    calendarId: 'cal-1',
    calendarName: 'Family Calendar',
    color: '#10b981', // sage
    ...overrides,
  };
}

describe('EventCard', () => {
  it('renders the calendar name, title, and formatted time range', () => {
    render(<EventCard event={makeEvent()} />);
    expect(screen.getByText('Family Calendar')).toBeInTheDocument();
    expect(screen.getByText('Soccer Practice')).toBeInTheDocument();
    expect(screen.getByText('4:00 PM - 5:30 PM')).toBeInTheDocument();
  });

  it('shows "All day" instead of a time range for all-day events', () => {
    render(<EventCard event={makeEvent({ allDay: true })} />);
    expect(screen.getByText('All day')).toBeInTheDocument();
  });

  it('applies the pastel background + full-color left border for a known category color', () => {
    const { container } = render(<EventCard event={makeEvent({ color: '#10b981' })} />);
    const card = container.querySelector('.event-card') as HTMLElement;
    expect(card.style.backgroundColor).toBe('rgb(187, 247, 208)'); // #bbf7d0 sage pastel
    expect(card.style.borderLeft).toBe('4px solid rgb(16, 185, 129)'); // #10b981 sage
  });

  it('renders a custom hex color that is not one of the 4 category colors, rather than falling back to gray', () => {
    const { container } = render(<EventCard event={makeEvent({ color: '#000000' })} />);
    const card = container.querySelector('.event-card') as HTMLElement;
    expect(card.style.backgroundColor).not.toBe('rgb(229, 231, 235)'); // not the gray fallback
    expect(card.style.borderLeft).toBe('4px solid rgb(0, 0, 0)');
  });

  it('is not clickable and has no role when onClick is omitted (e.g. read-only contexts)', () => {
    const { container } = render(<EventCard event={makeEvent()} />);
    const card = container.querySelector('.event-card') as HTMLElement;
    expect(card).not.toHaveAttribute('role');
    expect(card.className).not.toContain('event-card--clickable');
  });

  it('invokes onClick with the event when clicked, enabling edit-from-Dashboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const event = makeEvent();
    render(<EventCard event={event} onClick={onClick} />);
    const card = screen.getByRole('button');
    await user.click(card);
    expect(onClick).toHaveBeenCalledWith(event);
  });

  it('grays out events that have already ended', () => {
    const { container } = render(<EventCard event={makeEvent()} />);
    expect(container.querySelector('.event-card')).toHaveClass('event-card--past');
  });

  it('keeps future-dated events un-grayed even when their clock time is early', () => {
    const { container } = render(
      <EventCard event={makeEvent({ start: '2999-01-01T08:00:00', end: '2999-01-01T09:00:00' })} />,
    );
    expect(container.querySelector('.event-card')).not.toHaveClass('event-card--past');
  });

  it('keeps future all-day events un-grayed (bare-date end parsed as a locale date)', () => {
    const { container } = render(
      <EventCard event={makeEvent({ allDay: true, start: '2999-01-01', end: '2999-01-02' })} />,
    );
    expect(container.querySelector('.event-card')).not.toHaveClass('event-card--past');
  });
});
