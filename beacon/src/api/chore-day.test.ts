import { describe, expect, it } from 'vitest';
import { choreDayKey as choreDayKeyFromTs } from './date-keys';
import { choreDayKey as choreDayKeyFromApi } from './chore-day.cjs';
import { choreDayKey as choreDayKeyFromLib } from '../../lib/chore-day.cjs';
import { privilegeDecision } from './chore-privileges';
import type { Chore, ChoreCompletion, FamilyMember } from '../types/family';

/** 23:00 America/Phoenix on 2026-11-20. */
const PHOENIX_2300 = '2026-11-21T06:00:00.000Z';
const PHOENIX_0030 = '2026-11-21T07:30:00.000Z';
const PHOENIX_0400 = '2026-11-21T11:00:00.000Z';

function child(): FamilyMember {
  return {
    id: 'ada',
    name: 'Ada',
    avatar: '👧',
    color: '#3b82f6',
    role: 'child',
    privilegeEntityId: 'switch.ada_wifi',
  };
}

function dishes(): Chore {
  return {
    id: 'dishes',
    name: 'Dishes',
    assigned_to: ['ada'],
    frequency: 'daily',
    value_cents: 0,
  };
}

function done(at: string): ChoreCompletion {
  return { chore_id: 'dishes', member_id: 'ada', completed_at: at };
}

describe('choreDayKey', () => {
  it('is the same function result in the SPA re-export and the add-on lib', () => {
    const samples: Array<[string, string, string | null]> = [
      [PHOENIX_0030, 'America/Phoenix', '04:00'],
      [PHOENIX_0400, 'America/Phoenix', null],
      ['2026-03-08T07:30:00.000Z', 'America/New_York', '04:00'],
    ];
    for (const [instant, zone, reset] of samples) {
      expect(choreDayKeyFromTs(instant, zone, reset)).toBe(choreDayKeyFromApi(instant, zone, reset));
      expect(choreDayKeyFromApi(instant, zone, reset)).toBe(choreDayKeyFromLib(instant, zone, reset));
    }
  });

  it('keeps a 23:00 completion on the same chore day at 00:30 when reset is 04:00', () => {
    expect(choreDayKeyFromLib(PHOENIX_2300, 'America/Phoenix', '04:00')).toBe('2026-11-20');
    expect(choreDayKeyFromLib(PHOENIX_0030, 'America/Phoenix', '04:00')).toBe('2026-11-20');
    expect(choreDayKeyFromLib(PHOENIX_0400, 'America/Phoenix', '04:00')).toBe('2026-11-21');

    const chores = [dishes()];
    const completions = [done(PHOENIX_2300)];
    expect(privilegeDecision(child(), chores, completions, '2026-11-20', 'America/Phoenix', '04:00')?.service)
      .toBe('turn_on');
    expect(privilegeDecision(child(), chores, completions, '2026-11-21', 'America/Phoenix', '04:00')?.service)
      .toBe('turn_off');
  });

  it('treats an unset, empty, or invalid reset time as local midnight', () => {
    for (const reset of [undefined, null, '', '00:00', '24:00', 'morning']) {
      expect(choreDayKeyFromLib(PHOENIX_2300, 'America/Phoenix', reset)).toBe('2026-11-20');
      expect(choreDayKeyFromLib(PHOENIX_0030, 'America/Phoenix', reset)).toBe('2026-11-21');
      expect(choreDayKeyFromLib(PHOENIX_0400, 'America/Phoenix', reset)).toBe('2026-11-21');
    }
  });

  it('keeps the pre-reset chore day across the US spring-forward gap', () => {
    // 2026-03-08 02:00 EST jumps to 03:00 EDT. 04:00 local is 08:00 UTC,
    // which is not four hours after local midnight (05:00 UTC).
    const zone = 'America/New_York';
    const reset = '04:00';
    const completion = '2026-03-08T04:00:00.000Z'; // 23:00 EST on March 7
    expect(choreDayKeyFromLib(completion, zone, reset)).toBe('2026-03-07');
    expect(choreDayKeyFromLib('2026-03-08T05:30:00.000Z', zone, reset)).toBe('2026-03-07'); // 00:30 EST
    expect(choreDayKeyFromLib('2026-03-08T07:30:00.000Z', zone, reset)).toBe('2026-03-07'); // 03:30 EDT
    expect(choreDayKeyFromLib('2026-03-08T08:00:00.000Z', zone, reset)).toBe('2026-03-08'); // 04:00 EDT

    const chores = [dishes()];
    const completions = [done(completion)];
    expect(privilegeDecision(child(), chores, completions, '2026-03-07', zone, reset)?.service).toBe('turn_on');
    expect(privilegeDecision(child(), chores, completions, '2026-03-08', zone, reset)?.service).toBe('turn_off');
  });

  it('keeps both fall-back 01:30 instants on the previous chore day when reset is 04:00', () => {
    const zone = 'America/New_York';
    const reset = '04:00';
    const completion = '2026-11-01T03:00:00.000Z'; // 23:00 EDT on Oct 31
    expect(choreDayKeyFromLib(completion, zone, reset)).toBe('2026-10-31');
    expect(choreDayKeyFromLib('2026-11-01T05:30:00.000Z', zone, reset)).toBe('2026-10-31'); // first 01:30
    expect(choreDayKeyFromLib('2026-11-01T06:30:00.000Z', zone, reset)).toBe('2026-10-31'); // second 01:30
    expect(choreDayKeyFromLib('2026-11-01T09:00:00.000Z', zone, reset)).toBe('2026-11-01'); // 04:00 EST
  });
});
