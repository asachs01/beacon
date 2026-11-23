import { describe, expect, it } from 'vitest';
import { matchChore, planChoreCompletion } from '../../lib/chore-match.cjs';

const NOW = new Date('2026-07-04T15:00:00Z');
const ZONE = 'UTC';

const members = [
  { id: 'ada', name: 'Ada', role: 'child', privilegeEntityId: 'switch.ada_wifi' },
  { id: 'ben', name: 'Ben', role: 'child', privilegeEntityId: 'switch.ben_wifi' },
  { id: 'cam', name: 'Cam', role: 'parent' },
];

const chores = [
  { id: 'dishes', name: 'Dishes', assigned_to: ['ada', 'ben'], frequency: 'daily', value_cents: 100 },
  { id: 'vacuum', name: 'Vacuum', assigned_to: ['ada'], frequency: 'daily', value_cents: 50 },
  { id: 'dog', name: 'Feed the dog', assigned_to: ['ben'], frequency: 'daily', value_cents: 25 },
  { id: 'wash-dishes', name: 'Wash the dishes', assigned_to: ['cam'], frequency: 'daily', value_cents: 0 },
  { id: 'wash-car', name: 'Wash the car', assigned_to: ['cam'], frequency: 'daily', value_cents: 0 },
];

function plan(chore: string, name = '', completions: unknown[] = []) {
  return planChoreCompletion({
    members,
    chores,
    completions,
    streaks: [],
    chore,
    name,
    now: NOW,
    timeZone: ZONE,
  });
}

describe('chore matching', () => {
  it('asks who finished a chore assigned to more than one person', () => {
    const match = matchChore({ chores, members, chore: 'dishes', name: '' });
    expect(match.status).toBe('ambiguous');
    expect(match.response).toBe('Dishes is assigned to Ada and Ben. Who finished it?');
    expect(match.choices).toEqual([
      { chore_id: 'dishes', chore_title: 'Dishes', member_id: 'ada', member_name: 'Ada' },
      { chore_id: 'dishes', chore_title: 'Dishes', member_id: 'ben', member_name: 'Ben' },
    ]);
  });

  it('completes the one assignment when a name is given', () => {
    const result = plan('dishes', 'Ada');
    expect(result.success).toBe(true);
    expect(result.write).toBe(true);
    expect(result.response).toBe('Marked Dishes as done for Ada.');
    expect(result.chore_id).toBe('dishes');
    expect(result.member_id).toBe('ada');
    expect(result.events.map((event: { event: string }) => event.event)).toEqual(['beacon_chore_completed']);
    expect(result.decisions[0]).toMatchObject({ entityId: 'switch.ada_wifi', service: 'turn_off' });
  });

  it('fuzzy-matches a title and turns the privilege on when it is the last chore', () => {
    const halfway = plan('vaccum');
    expect(halfway.member_id).toBe('ada');
    expect(halfway.chore_id).toBe('vacuum');
    const done = planChoreCompletion({
      members,
      chores: chores.filter((chore) => chore.id === 'vacuum'),
      completions: [],
      streaks: [],
      chore: 'vaccum',
      name: '',
      now: NOW,
      timeZone: ZONE,
    });
    expect(done.events.map((event: { event: string }) => event.event)).toEqual([
      'beacon_chore_completed',
      'beacon_all_chores_done',
    ]);
    expect(done.decisions[0]).toMatchObject({ service: 'turn_on' });
    expect(done.streaks[0]).toMatchObject({ member_id: 'ada', current: 1 });
  });

  it('matches a multi-word title and asks when several chores fit', () => {
    expect(plan('feed the dog').chore_id).toBe('dog');
    const wash = matchChore({ chores, members, chore: 'wash', name: 'Cam' });
    expect(wash.status).toBe('ambiguous');
    expect(wash.response).toContain('Which chore for Cam?');
    expect(wash.response).toContain('Wash the dishes');
    expect(wash.response).toContain('Wash the car');
  });

  it('does not write or fire events when the request is ambiguous or unknown', () => {
    const ambiguous = plan('dishes');
    expect(ambiguous.write).toBe(false);
    expect(ambiguous.events).toEqual([]);
    expect(ambiguous.success).toBe(false);

    expect(plan('spaceship').response).toBe("I couldn't find a chore called spaceship.");
    expect(plan('dishes', 'Sam').response).toBe("I couldn't find a family member named Sam.");
    expect(plan('vacuum', 'Ben').response).toBe("Ben doesn't have a chore matching vacuum.");
  });

  it('reports a chore that is already done today without a second event', () => {
    const again = plan('vacuum', 'Ada', [{
      chore_id: 'vacuum',
      member_id: 'ada',
      completed_at: '2026-07-04T12:00:00.000Z',
    }]);
    expect(again.success).toBe(true);
    expect(again.already).toBe(true);
    expect(again.write).toBe(false);
    expect(again.events).toEqual([]);
    expect(again.response).toBe('Vacuum is already done for Ada today.');
  });

  it('says so when the only matching chore has no one assigned', () => {
    const result = planChoreCompletion({
      members,
      chores: [{ id: 'lone', name: 'Water plants', assigned_to: [], frequency: 'daily', value_cents: 0 }],
      completions: [],
      streaks: [],
      chore: 'water plants',
      name: '',
      now: NOW,
      timeZone: ZONE,
    });
    expect(result.response).toBe("Water plants isn't assigned to anyone.");
    expect(result.write).toBe(false);
  });
});
