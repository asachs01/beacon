import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventModal, EventFormData } from './EventModal';
import { CalendarEvent, CalendarInfo } from '../types';

const calendars: CalendarInfo[] = [
  { id: 'cal-1', name: 'Family Calendar', color: '#10b981' },
];

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Soccer Practice',
    start: '2026-08-02T16:00:00',
    end: '2026-08-02T17:30:00', // 1.5hr duration
    allDay: false,
    calendarId: 'cal-1',
    calendarName: 'Family Calendar',
    color: '#10b981',
    ...overrides,
  };
}

describe('EventModal', () => {
  it('hides delete while guest mode blocks it', () => {
    render(
      <EventModal
        event={makeEvent()}
        calendars={calendars}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        allowDelete={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('auto-shifts the end time to preserve duration when start time changes', () => {
    const onSave = vi.fn();
    render(
      <EventModal
        event={makeEvent()}
        calendars={calendars}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const startTime = document.getElementById('event-start-time') as HTMLInputElement;
    expect(startTime.value).toBe('16:00');

    fireEvent.change(startTime, { target: { value: '18:00' } });

    const endTime = document.getElementById('event-end-time') as HTMLInputElement;
    // Original duration was 1.5hr (16:00 -> 17:30); shifting start to 18:00
    // should preserve that duration, landing end at 19:30.
    expect(endTime.value).toBe('19:30');
  });

  it('blocks submission and shows an inline error when end <= start', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EventModal
        event={makeEvent()}
        calendars={calendars}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Manually set an invalid end time (touches end field, disabling auto-shift)
    const endTime = document.getElementById('event-end-time') as HTMLInputElement;
    await user.clear(endTime);
    await user.type(endTime, '15:00'); // before the 16:00 start

    const submitBtn = screen.getByRole('button', { name: 'Save' });
    await user.click(submitBtn);

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/end time must be after/i);
  });

  it('calls onSave for a valid edit (App.tsx is responsible for routing create vs update)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EventModal
        event={makeEvent()}
        calendars={calendars}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: 'Save' });
    await user.click(submitBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const [calendarId, data] = onSave.mock.calls[0] as [string, EventFormData];
    expect(calendarId).toBe('cal-1');
    expect(data.summary).toBe('Soccer Practice');
  });

  it('blocks edit/delete and shows an error for events without a stable provider id', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(
      <EventModal
        event={makeEvent({ hasStableId: false })}
        calendars={calendars}
        onSave={onSave}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/no stable ID/i);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('surfaces an error from a rejected onSave instead of failing silently', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('HA rejected the update'));
    render(
      <EventModal
        event={makeEvent()}
        calendars={calendars}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HA rejected the update');
  });

  it('surfaces an error from a rejected onDelete instead of failing silently', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockRejectedValue(new Error('HA rejected the delete'));
    render(
      <EventModal
        event={makeEvent()}
        calendars={calendars}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HA rejected the delete');
  });
});
