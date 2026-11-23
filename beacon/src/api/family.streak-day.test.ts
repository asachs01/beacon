import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./chore-bridge', () => ({
  publishChoreEvents: vi.fn(async () => {}),
  applyPrivilegeDecision: vi.fn(async () => {}),
}));

import { FamilyStore } from './family';
import type { Streak } from '../types/family';

/** America/Phoenix, which does not observe DST. */
const PHOENIX = 'America/Phoenix';

describe('streaks follow the chore day', () => {
  const originalTz = process.env.TZ;
  let choreSeq = 0;

  beforeEach(() => {
    choreSeq = 0;
    localStorage.clear();
    process.env.TZ = PHOENIX;
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  async function completeAt(iso: string, resetTime?: string | null): Promise<void> {
    vi.setSystemTime(new Date(iso));
    choreSeq += 1;
    const store = new FamilyStore();
    await store.completeChore(`chore-${choreSeq}`, 'ada', undefined, resetTime);
  }

  async function streak(): Promise<Streak> {
    return new FamilyStore().getStreakForMember('ada');
  }

  function seed(row: Streak): void {
    localStorage.setItem('beacon_streaks', JSON.stringify([row]));
  }

  it('credits a 01:00 completion to the previous chore day when reset is 03:00', async () => {
    seed({
      member_id: 'ada',
      current: 3,
      longest: 3,
      last_completed: '2026-11-19T17:00:00.000Z', // 10:00 MST on Nov 19
      last_chore_day: '2026-11-19',
    });

    await completeAt('2026-11-21T08:00:00.000Z', '03:00'); // 01:00 MST on Nov 21

    const row = await streak();
    expect(row.current).toBe(4);
    expect(row.longest).toBe(4);
    expect(row.last_chore_day).toBe('2026-11-20');
    expect(row.last_completed).toBe('2026-11-21T08:00:00.000Z');
  });

  it('does not count a day twice or break the streak when reset moves from 00:00 to 03:00', async () => {
    await completeAt('2026-11-20T17:00:00.000Z', '00:00'); // 10:00 Nov 20
    expect(await streak()).toMatchObject({ current: 1, last_chore_day: '2026-11-20' });

    await completeAt('2026-11-21T09:00:00.000Z', '00:00'); // 02:00 Nov 21, still midnight reset
    expect(await streak()).toMatchObject({ current: 2, last_chore_day: '2026-11-21' });

    // Reset is now 03:00. 10:00 is still chore day Nov 21, so the transition day counts once.
    await completeAt('2026-11-21T17:00:00.000Z', '03:00');
    expect(await streak()).toMatchObject({
      current: 2,
      longest: 2,
      last_completed: '2026-11-21T09:00:00.000Z',
      last_chore_day: '2026-11-21',
    });

    // The next chore day still continues the streak.
    await completeAt('2026-11-22T17:00:00.000Z', '03:00'); // 10:00 Nov 22
    expect(await streak()).toMatchObject({ current: 3, last_chore_day: '2026-11-22' });
  });

  it('does not count a day twice or break the streak when reset moves from 03:00 to 00:00', async () => {
    await completeAt('2026-11-21T08:00:00.000Z', '03:00'); // 01:00 credits Nov 20
    expect(await streak()).toMatchObject({ current: 1, last_chore_day: '2026-11-20' });

    // Midnight reset makes 10:00 chore day Nov 21, the day after the credited day.
    await completeAt('2026-11-21T17:00:00.000Z', '00:00');
    expect(await streak()).toMatchObject({ current: 2, last_chore_day: '2026-11-21' });

    await completeAt('2026-11-21T18:00:00.000Z', '00:00'); // 11:00, same chore day
    expect(await streak()).toMatchObject({
      current: 2,
      longest: 2,
      last_completed: '2026-11-21T17:00:00.000Z',
      last_chore_day: '2026-11-21',
    });
  });

  it('keeps a streak across the US spring-forward gap', async () => {
    process.env.TZ = 'America/New_York';
    await completeAt('2026-03-08T07:30:00.000Z', '04:00'); // 03:30 EDT, still March 7
    expect(await streak()).toMatchObject({ current: 1, last_chore_day: '2026-03-07' });

    await completeAt('2026-03-08T08:00:00.000Z', '04:00'); // 04:00 EDT starts March 8
    expect(await streak()).toMatchObject({ current: 2, longest: 2, last_chore_day: '2026-03-08' });
  });

  it('counts both fall-back 01:30 instants as one chore day', async () => {
    process.env.TZ = 'America/New_York';
    await completeAt('2026-11-01T05:30:00.000Z', '04:00'); // first 01:30 EDT
    expect(await streak()).toMatchObject({ current: 1, last_chore_day: '2026-10-31' });

    await completeAt('2026-11-01T06:30:00.000Z', '04:00'); // second 01:30 EST
    expect(await streak()).toMatchObject({
      current: 1,
      last_completed: '2026-11-01T05:30:00.000Z',
      last_chore_day: '2026-10-31',
    });

    await completeAt('2026-11-01T09:00:00.000Z', '04:00'); // 04:00 EST
    expect(await streak()).toMatchObject({ current: 2, last_chore_day: '2026-11-01' });
  });

  it('treats an unset or invalid reset time as midnight', async () => {
    seed({
      member_id: 'ada',
      current: 2,
      longest: 2,
      last_completed: '2026-11-20T17:00:00.000Z',
      last_chore_day: '2026-11-20',
    });

    for (const resetTime of [undefined, null, '', '24:00', 'morning']) {
      localStorage.clear();
      seed({
        member_id: 'ada',
        current: 2,
        longest: 2,
        last_completed: '2026-11-20T17:00:00.000Z',
        last_chore_day: '2026-11-20',
      });
      choreSeq += 1;
      vi.setSystemTime(new Date('2026-11-21T08:00:00.000Z')); // 01:00 MST on Nov 21
      const store = new FamilyStore();
      await store.completeChore(`chore-${choreSeq}`, 'ada', undefined, resetTime);
      expect(await streak(), `reset ${String(resetTime)}`).toMatchObject({
        current: 3,
        last_chore_day: '2026-11-21',
      });
    }
  });

  it('does not rewrite an existing streak until a new chore day is counted', async () => {
    const original: Streak = {
      member_id: 'ada',
      current: 5,
      longest: 9,
      last_completed: '2026-11-20T17:00:00.000Z', // 10:00 MST on Nov 20
    };
    seed(original);

    const store = new FamilyStore();
    expect(await store.getStreakForMember('ada')).toEqual(original);
    expect(JSON.parse(localStorage.getItem('beacon_streaks')!)).toEqual([original]);

    vi.setSystemTime(new Date('2026-11-21T01:00:00.000Z')); // 18:00 MST on Nov 20
    await store.completeChore('later', 'ada', undefined, '03:00');
    expect(JSON.parse(localStorage.getItem('beacon_streaks')!)).toEqual([original]);
    expect((await store.getStreakForMember('ada')).current).toBe(5);

    vi.setSystemTime(new Date('2026-11-21T17:00:00.000Z')); // 10:00 MST on Nov 21
    await store.completeChore('next-day', 'ada', undefined, '03:00');
    expect(await store.getStreakForMember('ada')).toMatchObject({
      current: 6,
      longest: 9,
      last_completed: '2026-11-21T17:00:00.000Z',
      last_chore_day: '2026-11-21',
    });
  });

  it('keeps routine completions on calendar midnight', async () => {
    vi.setSystemTime(new Date('2026-11-21T08:00:00.000Z')); // 01:00 MST on Nov 21
    const store = new FamilyStore();
    await store.completeChore('dishes', 'ada', undefined, '03:00');
    await store.completeRoutineTask('routine-1', 'task-1', 'ada');

    expect(await streak()).toMatchObject({ last_chore_day: '2026-11-20' });
    const routines = await store.getRoutineTaskCompletionsToday();
    expect(routines).toHaveLength(1);
    expect(routines[0].completed_at).toBe('2026-11-21T08:00:00.000Z');
  });
});
