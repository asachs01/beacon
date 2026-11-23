import { describe, expect, it } from 'vitest';
import { parseMagicImportText } from './parse';

const PHOENIX = 'America/Phoenix';
const NEW_YORK = 'America/New_York';
/** Friday 20 Nov 2026, 18:00 in Phoenix — already Saturday in UTC. */
const PHOENIX_EVENING = new Date('2026-11-20T18:00:00-07:00');
/** Friday 20 Nov 2026, 23:30 in New York — already Saturday in UTC. */
const NEW_YORK_LATE = new Date('2026-11-20T23:30:00-05:00');

function parse(text: string, now = PHOENIX_EVENING, timeZone = PHOENIX, locale = 'en-US') {
  return parseMagicImportText(text, { now, timeZone, locale });
}

describe('magic import fallback parser', () => {
  it('reads Fri Dec 5, a slash date, and a time range', () => {
    const result = parse('Field trip Fri Dec 5 at 9am at the museum. Piano 12/5 from 3pm to 4:30pm.');
    expect(result.events).toEqual([
      {
        title: 'Field trip',
        date: '2026-12-05',
        allDay: false,
        startTime: '09:00',
        endTime: null,
        location: 'the museum',
        notes: null,
      },
      {
        title: 'Piano',
        date: '2026-12-05',
        allDay: false,
        startTime: '15:00',
        endTime: '16:30',
        location: null,
        notes: null,
      },
    ]);
  });

  it('resolves tomorrow and next Tuesday in the household zone, not UTC', () => {
    expect(new Date(PHOENIX_EVENING).toISOString().slice(0, 10)).toBe('2026-11-21');
    const phoenix = parse('Practice tomorrow at 3pm. Lesson next Tuesday.');
    expect(phoenix.events.map((event) => [event.title, event.date, event.startTime])).toEqual([
      ['Practice', '2026-11-21', '15:00'],
      ['Lesson', '2026-11-24', null],
    ]);

    expect(new Date(NEW_YORK_LATE).toISOString().slice(0, 10)).toBe('2026-11-21');
    const york = parse('Practice tomorrow at 3pm', NEW_YORK_LATE, NEW_YORK);
    expect(york.events[0]).toMatchObject({ date: '2026-11-21', startTime: '15:00', allDay: false });
  });

  it('skips today when the phrase is next Tuesday', () => {
    const tuesday = new Date('2026-11-24T10:00:00-07:00');
    const result = parse('Dentist next Tuesday at 15:00', tuesday);
    expect(result.events[0]).toMatchObject({ title: 'Dentist', date: '2026-12-01', startTime: '15:00' });
  });

  it('keeps an explicit year and treats a day-first locale as day/month', () => {
    expect(parse('Show December 5, 2027').events[0].date).toBe('2027-12-05');
    expect(parse('Show 5/12', PHOENIX_EVENING, PHOENIX, 'de-DE').events[0].date).toBe('2026-12-05');
    // 5/12 is May 12. That day in 2026 is already past on Nov 20, so it rolls forward.
    expect(parse('Show 5/12').events[0].date).toBe('2027-05-12');
  });

  it('turns bullet lists into grocery or todo items from the heading', () => {
    const result = parse([
      'Field trip Fri Dec 5 at 9am at the museum. Please bring:',
      '- lunch',
      '- water bottle',
      'Homework:',
      '- math worksheet',
      '1. reading log',
    ].join('\n'));
    expect(result.events[0]).toMatchObject({ title: 'Field trip', date: '2026-12-05', startTime: '09:00' });
    expect(result.items).toEqual([
      { title: 'lunch', list: 'grocery' },
      { title: 'water bottle', list: 'grocery' },
      { title: 'math worksheet', list: 'todo' },
      { title: 'reading log', list: 'todo' },
    ]);
  });

  it('treats a run of short lines as list items', () => {
    const result = parse('milk\neggs\nbread');
    expect(result.events).toEqual([]);
    expect(result.items).toEqual([
      { title: 'milk', list: 'grocery' },
      { title: 'eggs', list: 'grocery' },
      { title: 'bread', list: 'grocery' },
    ]);
  });

  it('keeps a parenthetical as notes and a 24-hour clock as the start', () => {
    const result = parse('Soccer tomorrow at 15:30 (wear cleats)');
    expect(result.events[0]).toMatchObject({
      title: 'Soccer',
      date: '2026-11-21',
      startTime: '15:30',
      notes: 'wear cleats',
      allDay: false,
    });
  });
});
