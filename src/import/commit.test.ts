import { describe, expect, it } from 'vitest';
import { calendarWriteFromDraft, pickCalendarId, pickListId } from './commit';

const event = {
  title: 'Practice',
  date: '2026-11-21',
  allDay: false,
  startTime: '15:00',
  endTime: '',
  location: 'Field',
  notes: 'Bring a ball',
};

describe('magic import calendar writes', () => {
  it('uses the editor’s exclusive end date for an all-day event', () => {
    expect(calendarWriteFromDraft({ ...event, allDay: true, startTime: '' }, 60)).toEqual({
      summary: 'Practice',
      start_date: '2026-11-21',
      end_date: '2026-11-22',
      description: 'Bring a ball',
      location: 'Field',
    });
  });

  it('fills a missing end from the default duration and keeps a 24-hour range', () => {
    expect(calendarWriteFromDraft(event, 90)).toMatchObject({
      start_date_time: '2026-11-21T15:00:00',
      end_date_time: '2026-11-21T16:30:00',
    });
    expect(calendarWriteFromDraft({ ...event, startTime: '23:30', endTime: '' }, 60)).toMatchObject({
      end_date_time: '2026-11-22T00:30:00',
    });
  });

  it('prefers a saved calendar and list, then the built-in lists', () => {
    const calendars = [{ id: 'beacon-local' }, { id: 'calendar.school' }];
    expect(pickCalendarId(calendars, 'calendar.school')).toBe('calendar.school');
    expect(pickCalendarId(calendars, 'missing')).toBe('beacon-local');
    const lists = [
      { id: 'beacon-todo', name: 'To-Do' },
      { id: 'beacon-shopping', name: 'Shopping List' },
      { id: 'todo.groceries', name: 'Groceries' },
    ];
    expect(pickListId(lists, 'todo.groceries', 'grocery')).toBe('todo.groceries');
    expect(pickListId(lists, '', 'grocery')).toBe('beacon-shopping');
    expect(pickListId(lists, '', 'todo')).toBe('beacon-todo');
  });
});
