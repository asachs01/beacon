import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FamilyStore } from './family';

/*
 * Runs against the real collection code in its standalone mode (no add-on
 * server), backed by localStorage.
 */

const store = new FamilyStore();

/** A local-time moment on a September 2026 day. */
const day = (date: number, hour = 9) => new Date(2026, 8, date, hour, 0);

async function completeOn(date: Date, choreId = 'c1', memberId = 'kai') {
  vi.setSystemTime(date);
  await store.completeChore(choreId, memberId);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FamilyStore streaks', () => {
  it("starts a streak of 1 on a member's first completion, counting each day once", async () => {
    await completeOn(day(20));
    await completeOn(day(20, 18), 'c2');

    expect(await store.getStreaks()).toEqual([
      { id: 'kai', member_id: 'kai', current: 1, longest: 1, last_completed: day(20).toISOString() },
    ]);
  });

  it('adds a day for each consecutive day with a completion', async () => {
    await completeOn(day(20));
    await completeOn(day(21));
    await completeOn(day(22, 20));

    expect(await store.getStreakForMember('kai')).toMatchObject({ current: 3, longest: 3 });
  });

  it('starts again at 1 after a missed day, keeping the best', async () => {
    await completeOn(day(20));
    await completeOn(day(21));
    await completeOn(day(23));

    expect(await store.getStreakForMember('kai')).toMatchObject({ current: 1, longest: 2 });
  });

  // "Yesterday" was now minus 24 hours: just after midnight following a
  // 23-hour daylight-saving day, that's the day before yesterday. (Only
  // shows in a time zone with daylight saving, e.g. TZ=America/New_York.)
  it('keeps a streak going across a daylight-saving change', async () => {
    await completeOn(new Date(2026, 2, 7, 18, 0)); // 7 March
    await completeOn(new Date(2026, 2, 8, 18, 0)); // 8 March: clocks go forward in the US
    await completeOn(new Date(2026, 2, 9, 0, 30)); // 00:30 on 9 March

    expect(await store.getStreakForMember('kai')).toMatchObject({ current: 3 });
  });

  it('stores one completion when the same chore is completed concurrently', async () => {
    const chore = await store.addChore({
      name: 'Put dishes away',
      assigned_to: ['kai'],
      frequency: 'daily',
      value_cents: 100,
    });

    const [first, second] = await Promise.all([
      store.completeChore(chore.id, 'kai'),
      store.completeChore(chore.id, 'kai'),
    ]);

    expect(first.id).toBe(second.id);
    expect(await store.getCompletions()).toHaveLength(1);
  });

  it('stores one routine task completion when requests race', async () => {
    await Promise.all([
      store.completeRoutineTask('bedtime', 'brush-teeth', 'kai'),
      store.completeRoutineTask('bedtime', 'brush-teeth', 'kai'),
    ]);

    expect(await store.getRoutineTaskCompletions()).toHaveLength(1);
  });
});
