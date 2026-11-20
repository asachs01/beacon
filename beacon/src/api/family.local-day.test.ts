import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FamilyStore } from './family';

/** 18:00 America/Phoenix on 2026-11-20 — 2026-11-21 01:00 UTC. */
const PHOENIX_EVENING = new Date('2026-11-20T18:00:00-07:00');

describe('family completions and streaks use the local day', () => {
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

  it('counts an evening completion as today and keeps the stored UTC timestamp', async () => {
    const store = new FamilyStore();
    const completion = await store.completeChore('chore-1', 'member-1');

    expect(completion.completed_at).toBe('2026-11-21T01:00:00.000Z');

    const today = await store.getCompletionsToday();
    expect(today).toHaveLength(1);
    expect(today[0].completed_at).toBe('2026-11-21T01:00:00.000Z');

    const streak = await store.getStreakForMember('member-1');
    expect(streak.current).toBe(1);
    expect(streak.last_completed).toBe('2026-11-21T01:00:00.000Z');
  });

  it('continues a streak when the previous completion was yesterday locally', async () => {
    localStorage.setItem(
      'beacon_streaks',
      JSON.stringify([
        {
          member_id: 'member-1',
          current: 3,
          longest: 3,
          // 18:00 Phoenix on 2026-11-19.
          last_completed: '2026-11-20T01:00:00.000Z',
        },
      ]),
    );

    const store = new FamilyStore();
    await store.completeChore('chore-1', 'member-1');

    const streak = await store.getStreakForMember('member-1');
    expect(streak.current).toBe(4);
    expect(streak.last_completed).toBe('2026-11-21T01:00:00.000Z');
  });

  it('treats a routine task completed this local evening as done today', async () => {
    const store = new FamilyStore();
    await store.completeRoutineTask('routine-1', 'task-1', 'member-1');

    const today = await store.getRoutineTaskCompletionsToday();
    expect(today).toHaveLength(1);
    expect(today[0].completed_at).toBe('2026-11-21T01:00:00.000Z');
  });
});
