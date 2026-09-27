import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventDetailsPopover } from './EventDetailsPopover';
import type { CalendarEvent } from '../types';

const anchor = { left: 100, top: 100, right: 200, bottom: 120, width: 100, height: 20, x: 100, y: 100 } as DOMRect;
const event = (start: string, end: string, allDay: boolean): CalendarEvent => ({
  id: 'e1', title: 'Trip', start, end, allDay, calendarId: 'calendar.family', calendarName: 'Family', color: '#3b82f6',
});
const show = (ev: CalendarEvent) => render(<EventDetailsPopover event={ev} anchor={anchor} onClose={() => {}} onEdit={() => {}} />);

describe('EventDetailsPopover', () => {
  // HA's end date for an all-day event is the day after its last day.
  it('shows a one-day all-day event as that day', () => {
    show(event('2026-09-26', '2026-09-27', true));
    expect(screen.getByText('Sat, Sep 26 · All day')).toBeInTheDocument();
  });

  it("ends a longer all-day event on its last day", () => {
    show(event('2026-09-26', '2026-09-28', true));
    expect(screen.getByText('Sep 26 – Sep 27 · All day')).toBeInTheDocument();
  });
});
