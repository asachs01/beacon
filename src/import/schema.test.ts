import { describe, expect, it } from 'vitest';
import { jsonFromAgentText, validateMagicImport } from './schema';

const valid = {
  events: [{
    title: 'Field trip',
    date: '2026-12-05',
    allDay: false,
    start: '09:00',
    end: null,
    location: 'Museum',
    notes: null,
  }],
  items: [{ title: 'lunch', list: 'grocery' }],
};

describe('magic import schema', () => {
  it('accepts a strict agent payload and omitted nullable fields', () => {
    expect(validateMagicImport(valid)?.events[0]).toMatchObject({
      title: 'Field trip',
      date: '2026-12-05',
      startTime: '09:00',
      endTime: null,
      location: 'Museum',
    });
    expect(validateMagicImport({
      events: [{ title: 'Picture day', date: '2026-12-01', allDay: true }],
      items: [],
    })?.events[0]).toMatchObject({ allDay: true, startTime: null, endTime: null });
  });

  it('rejects extra keys, bad dates, timed events without a start, and the wrong list', () => {
    expect(validateMagicImport({ ...valid, comment: 'hi' })).toBeNull();
    expect(validateMagicImport({
      events: [{ ...valid.events[0], date: '2026-02-31' }],
      items: [],
    })).toBeNull();
    expect(validateMagicImport({
      events: [{ title: 'Practice', date: '2026-12-05', allDay: false, start: null, end: null, location: null, notes: null }],
      items: [],
    })).toBeNull();
    expect(validateMagicImport({
      events: [],
      items: [{ title: 'milk', list: 'shopping' }],
    })).toBeNull();
    expect(validateMagicImport({
      events: [{ title: 'All day', date: '2026-12-05', allDay: true, start: '09:00', end: null, location: null, notes: null }],
      items: [],
    })).toBeNull();
  });

  it('reads JSON from a fenced reply and ignores the surrounding sentence', () => {
    const text = 'Here you go:\n```json\n{"events":[],"items":[{"title":"milk","list":"grocery"}]}\n```';
    expect(validateMagicImport(jsonFromAgentText(text))?.items).toEqual([{ title: 'milk', list: 'grocery' }]);
    expect(jsonFromAgentText('no json here')).toBeNull();
  });
});
