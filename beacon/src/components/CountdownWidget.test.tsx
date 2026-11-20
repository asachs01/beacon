import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CountdownWidget } from './CountdownWidget';
import type { CalendarEvent } from '../types';

/** 18:00 America/Phoenix on 2026-11-20 — 2026-11-21 01:00 UTC. */
const PHOENIX_EVENING = new Date('2026-11-20T18:00:00-07:00');

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Trip',
    start: '2026-11-22T01:00:00.000Z',
    end: '2026-11-22T02:00:00.000Z',
    allDay: false,
    description: '#countdown',
    calendarId: 'cal-1',
    calendarName: 'Family',
    color: '#000',
    ...overrides,
  };
}

describe('CountdownWidget date keys', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Phoenix';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(PHOENIX_EVENING);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('counts a UTC timestamp from its local calendar day', () => {
    // 2026-11-22 01:00Z is 18:00 Phoenix on 2026-11-21: one local day from
    // today (2026-11-20). Slicing the UTC date would key it as 2026-11-22.
    render(<CountdownWidget events={[event({})]} />);
    expect(screen.getByText('Trip')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Nov 21')).toBeInTheDocument();
  });

  it('keeps an all-day YYYY-MM-DD key on that calendar date', () => {
    render(
      <CountdownWidget
        events={[
          event({
            id: 'all-day',
            title: 'Birthday',
            start: '2026-11-22',
            end: '2026-11-23',
            allDay: true,
          }),
        ]}
      />,
    );
    expect(screen.getByText('Birthday')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Nov 22')).toBeInTheDocument();
  });
});
