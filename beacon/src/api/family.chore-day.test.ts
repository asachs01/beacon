import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./chore-bridge', () => ({
  publishChoreEvents: vi.fn(async () => {}),
  applyPrivilegeDecision: vi.fn(async () => {}),
}));

import { FamilyStore } from './family';
import { applyPrivilegeDecision, publishChoreEvents } from './chore-bridge';

const publish = vi.mocked(publishChoreEvents);
const apply = vi.mocked(applyPrivilegeDecision);

/** 23:00 America/Phoenix on 2026-11-20. */
const PHOENIX_2300 = '2026-11-21T06:00:00.000Z';

describe('family chart uses the chore reset time', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    publish.mockReset();
    apply.mockReset();
    publish.mockResolvedValue(undefined);
    apply.mockResolvedValue(undefined);
    localStorage.setItem('beacon_family_members', JSON.stringify([
      {
        id: 'ada',
        name: 'Ada',
        avatar: '👧',
        color: '#3b82f6',
        role: 'child',
        privilegeEntityId: 'switch.ada_wifi',
      },
    ]));
    localStorage.setItem('beacon_chores', JSON.stringify([
      {
        id: 'dishes',
        name: 'Dishes',
        assigned_to: ['ada'],
        frequency: 'daily',
        value_cents: 0,
      },
    ]));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('still shows a 23:00 completion at 00:30 when reset is 04:00, and clears it at 04:00', async () => {
    process.env.TZ = 'America/Phoenix';
    vi.useFakeTimers({ toFake: ['Date'] });
    localStorage.setItem('beacon_completions', JSON.stringify([
      { chore_id: 'dishes', member_id: 'ada', completed_at: PHOENIX_2300 },
    ]));
    const store = new FamilyStore();

    vi.setSystemTime(new Date('2026-11-21T07:30:00.000Z')); // 00:30 MST
    expect(await store.getCompletionsToday('04:00')).toHaveLength(1);
    expect(await store.getCompletionsToday(null)).toHaveLength(0);
    expect(await store.getCompletionsToday('')).toHaveLength(0);
    expect(await store.getCompletionsToday('00:00')).toHaveLength(0);

    const again = await store.completeChore('dishes', 'ada', undefined, '04:00');
    expect(again.completed_at).toBe(PHOENIX_2300);
    expect(publish).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-11-21T11:00:00.000Z')); // 04:00 MST
    expect(await store.getCompletionsToday('04:00')).toHaveLength(0);
  });

  it('labels the chore event with the chore day when a check happens before reset', async () => {
    process.env.TZ = 'America/Phoenix';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T07:30:00.000Z')); // 00:30 MST, still the 20th's chore day

    const store = new FamilyStore();
    await store.completeChore('dishes', 'ada', undefined, '04:00');
    await vi.waitFor(() => expect(publish).toHaveBeenCalled());

    const events = publish.mock.calls[0][0];
    expect(events.map((event) => event.event)).toEqual([
      'beacon_chore_completed',
      'beacon_all_chores_done',
    ]);
    expect(events[0].data.local_date).toBe('2026-11-20');
    expect(events[1].data.local_date).toBe('2026-11-20');
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ service: 'turn_on' }));
    expect(await store.getCompletionsToday('04:00')).toHaveLength(1);
  });
});
