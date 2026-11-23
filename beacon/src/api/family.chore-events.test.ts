import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./chore-bridge', () => ({
  publishChoreEvents: vi.fn(async () => {}),
  applyPrivilegeDecision: vi.fn(async () => {}),
}));

import { FamilyStore } from './family';
import { applyPrivilegeDecision, publishChoreEvents } from './chore-bridge';

const publish = vi.mocked(publishChoreEvents);
const apply = vi.mocked(applyPrivilegeDecision);

describe('FamilyStore chore side effects', () => {
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
        value_cents: 100,
      },
    ]));
  });

  it('publishes the completion event and turns the privilege switch on', async () => {
    const store = new FamilyStore();
    await store.completeChore('dishes', 'ada');
    await vi.waitFor(() => expect(apply).toHaveBeenCalled());

    expect(publish).toHaveBeenCalledTimes(1);
    const events = publish.mock.calls[0][0];
    expect(events.map((event) => event.event)).toEqual([
      'beacon_chore_completed',
      'beacon_all_chores_done',
    ]);
    expect(events[0].data).toMatchObject({
      member_id: 'ada',
      member_name: 'Ada',
      chore_id: 'dishes',
      chore_title: 'Dishes',
      completed: true,
    });
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'switch.ada_wifi',
      service: 'turn_on',
    }));
  });

  it('turns the switch off when the chore is unchecked', async () => {
    const store = new FamilyStore();
    await store.completeChore('dishes', 'ada');
    await vi.waitFor(() => expect(apply).toHaveBeenCalled());

    await store.uncompleteChore('dishes', 'ada');
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(2));

    const events = publish.mock.calls[1][0];
    expect(events.map((event) => event.event)).toEqual(['beacon_chore_completed']);
    expect(events[0].data.completed).toBe(false);
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ service: 'turn_off' }));
  });

  it('still saves the chore when Home Assistant side effects fail', async () => {
    publish.mockRejectedValue(new Error('ha down'));
    apply.mockRejectedValue(new Error('ha down'));
    const store = new FamilyStore();

    await expect(store.completeChore('dishes', 'ada')).resolves.toMatchObject({ chore_id: 'dishes' });
    expect(await store.getCompletionsToday()).toHaveLength(1);
  });

  it('does not publish again when the chore is already complete today', async () => {
    const store = new FamilyStore();
    await store.completeChore('dishes', 'ada');
    await store.completeChore('dishes', 'ada');
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
