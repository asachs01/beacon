import { describe, expect, it, vi } from 'vitest';
import {
  ALL_CHORES_DONE_EVENT,
  CHORE_COMPLETED_EVENT,
  eventsForChoreChange,
  privilegeDecision,
} from './chore-privileges';
import {
  acceptedChoreEvents,
  createPrivilegeScheduler,
  dayKey,
  privilegeDecisions,
} from '../../lib/chore-privileges.cjs';
import type { Chore, ChoreCompletion, FamilyMember } from '../types/family';

/** 18:00 America/Phoenix on 2026-11-20 is 2026-11-21 01:00 UTC. */
const PHOENIX_EVENING = '2026-11-21T01:00:00.000Z';

function child(overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id: 'ada',
    name: 'Ada',
    avatar: '👧',
    color: '#3b82f6',
    role: 'child',
    privilegeEntityId: 'switch.ada_wifi',
    ...overrides,
  };
}

function chore(id: string, memberId = 'ada'): Chore {
  return {
    id,
    name: id === 'dishes' ? 'Dishes' : 'Feed the dog',
    assigned_to: [memberId],
    frequency: 'daily',
    value_cents: 100,
  };
}

function done(choreId: string, at = PHOENIX_EVENING, memberId = 'ada'): ChoreCompletion {
  return { chore_id: choreId, member_id: memberId, completed_at: at };
}

describe('privilege switch decisions', () => {
  const localDate = '2026-11-20';
  const zone = 'America/Phoenix';

  it('turns the switch on when today becomes complete', () => {
    const decision = privilegeDecision(
      child(),
      [chore('dishes')],
      [done('dishes')],
      localDate,
      zone,
    );
    expect(decision).toMatchObject({
      entityId: 'switch.ada_wifi',
      domain: 'switch',
      service: 'turn_on',
      reason: 'complete',
      progress: { completed: 1, total: 1 },
    });
  });

  it('turns the switch off when a chore is undone', () => {
    const chores = [chore('dishes'), chore('dog')];
    const both = [done('dishes'), done('dog')];
    expect(privilegeDecision(child(), chores, both, localDate, zone)?.service).toBe('turn_on');

    const undone = privilegeDecision(child(), chores, [done('dishes')], localDate, zone);
    expect(undone).toMatchObject({
      service: 'turn_off',
      reason: 'incomplete',
      progress: { completed: 1, total: 2 },
    });
  });

  it('turns the switch off at local midnight without using the UTC date', () => {
    const member = child();
    const chores = [chore('dishes')];
    const completions = [done('dishes')];

    // The stored instant is already the next UTC day. Phoenix still calls it the 20th.
    expect(dayKey(PHOENIX_EVENING, 'America/Phoenix')).toBe('2026-11-20');
    expect(dayKey(PHOENIX_EVENING, 'UTC')).toBe('2026-11-21');

    expect(privilegeDecision(member, chores, completions, '2026-11-20', zone)?.service).toBe('turn_on');
    // Local midnight has passed: that completion is yesterday, so the switch goes off.
    const afterMidnight = privilegeDecision(member, chores, completions, '2026-11-21', zone);
    expect(afterMidnight).toMatchObject({
      service: 'turn_off',
      reason: 'incomplete',
      progress: { completed: 0, total: 1 },
    });
  });

  it('does not treat a child with no chores as done', () => {
    const decision = privilegeDecision(child(), [], [], localDate, zone);
    expect(decision).toMatchObject({
      service: 'turn_off',
      reason: 'no_chores',
      progress: { completed: 0, total: 0 },
    });
  });

  it('leaves parents and unsupported entities alone', () => {
    expect(privilegeDecision(child({ role: 'parent' }), [chore('dishes')], [done('dishes')], localDate)).toBeNull();
    expect(privilegeDecision(child({ privilegeEntityId: undefined }), [chore('dishes')], [done('dishes')], localDate)).toBeNull();
    expect(privilegeDecision(
      child({ privilegeEntityId: 'media_player.tv' }),
      [chore('dishes')],
      [done('dishes')],
      localDate,
    )).toBeNull();
    expect(privilegeDecisions(
      [child({ privilegeEntityId: 'light.desk' }), child({ id: 'bo', name: 'Bo', privilegeEntityId: 'fan.room' })],
      [],
      [],
      localDate,
    ).map((decision) => decision.domain)).toEqual(['light', 'fan']);
  });
});

describe('chore event payloads', () => {
  const member = { id: 'ada', name: 'Ada' };
  const dishes = { id: 'dishes', name: 'Dishes' };

  it('builds beacon_chore_completed and beacon_all_chores_done when the last chore is checked', () => {
    const events = eventsForChoreChange({
      member,
      chore: dishes,
      completed: true,
      localDate: '2026-11-20',
      progressBefore: { completed: 0, total: 1 },
      progressAfter: { completed: 1, total: 1 },
    });
    expect(events).toEqual([
      {
        event: CHORE_COMPLETED_EVENT,
        data: {
          member_id: 'ada',
          member_name: 'Ada',
          chore_id: 'dishes',
          chore_title: 'Dishes',
          completed: true,
          local_date: '2026-11-20',
        },
      },
      {
        event: ALL_CHORES_DONE_EVENT,
        data: {
          member_id: 'ada',
          member_name: 'Ada',
          local_date: '2026-11-20',
        },
      },
    ]);
  });

  it('omits beacon_all_chores_done when chores remain or a chore is unchecked', () => {
    const partial = eventsForChoreChange({
      member,
      chore: dishes,
      completed: true,
      localDate: '2026-11-20',
      progressBefore: { completed: 0, total: 2 },
      progressAfter: { completed: 1, total: 2 },
    });
    expect(partial.map((event) => event.event)).toEqual([CHORE_COMPLETED_EVENT]);
    expect(partial[0].data.completed).toBe(true);

    const undone = eventsForChoreChange({
      member,
      chore: dishes,
      completed: false,
      localDate: '2026-11-20',
      progressBefore: { completed: 1, total: 1 },
      progressAfter: { completed: 0, total: 1 },
    });
    expect(undone).toEqual([
      {
        event: CHORE_COMPLETED_EVENT,
        data: {
          member_id: 'ada',
          member_name: 'Ada',
          chore_id: 'dishes',
          chore_title: 'Dishes',
          completed: false,
          local_date: '2026-11-20',
        },
      },
    ]);
  });

  it('does not fire all-done again, or for a member with no chores', () => {
    const already = eventsForChoreChange({
      member,
      chore: dishes,
      completed: true,
      localDate: '2026-11-20',
      progressBefore: { completed: 1, total: 1 },
      progressAfter: { completed: 1, total: 1 },
    });
    expect(already.map((event) => event.event)).toEqual([CHORE_COMPLETED_EVENT]);

    const none = eventsForChoreChange({
      member,
      chore: dishes,
      completed: true,
      localDate: '2026-11-20',
      progressBefore: { completed: 0, total: 0 },
      progressAfter: { completed: 0, total: 0 },
    });
    expect(none.map((event) => event.event)).toEqual([CHORE_COMPLETED_EVENT]);
  });

  it('drops event names the add-on server did not define', () => {
    expect(acceptedChoreEvents([
      { event: 'beacon_chore_completed', data: { member_id: 'ada' } },
      { event: 'beacon_navigate', data: { view: 'chores' } },
      { event: 'beacon_all_chores_done', data: null },
      null,
    ])).toEqual([
      { event: 'beacon_chore_completed', data: { member_id: 'ada' } },
    ]);
  });
});

describe('privilege scheduler', () => {
  it('applies on startup, skips the same local day, and resets at local midnight', async () => {
    let now = new Date('2026-11-21T01:00:00.000Z');
    const apply = vi.fn(async () => {});
    const tick = createPrivilegeScheduler({
      now: () => now,
      getTimeZone: async () => 'America/Phoenix',
      readSnapshot: async () => ({
        members: [child()],
        chores: [chore('dishes')],
        completions: [done('dishes')],
      }),
      apply,
      hasToken: () => true,
      log: () => {},
    });

    await tick();
    await tick();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][1]).toMatchObject({ reason: 'startup', localDate: '2026-11-20' });
    expect(apply.mock.calls[0][0][0].service).toBe('turn_on');

    now = new Date('2026-11-21T07:00:00.000Z'); // 00:00 America/Phoenix on the 21st
    await tick();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[1][1]).toMatchObject({ reason: 'local-midnight', localDate: '2026-11-21' });
    expect(apply.mock.calls[1][0][0]).toMatchObject({ service: 'turn_off', reason: 'incomplete' });
  });

  it('does not call Home Assistant when there is no Supervisor token', async () => {
    const apply = vi.fn(async () => {});
    const log = vi.fn();
    const tick = createPrivilegeScheduler({
      getTimeZone: async () => 'America/Phoenix',
      readSnapshot: async () => ({ members: [child()], chores: [], completions: [] }),
      apply,
      hasToken: () => false,
      log,
    });
    await tick();
    await tick();
    expect(apply).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
