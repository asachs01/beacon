import { describe, expect, it } from 'vitest';
import { installDemo } from './install';
import {
  DEMO_DAY,
  DEMO_EVENTS,
  DEMO_MEALS,
  DEMO_MEMBERS,
} from './fixtures';

describe('docs screenshot fixtures', () => {
  it('uses a fictional family and no contact details', () => {
    expect(DEMO_MEMBERS.map((member) => member.name)).toEqual(['Alex', 'Jordan', 'Sam', 'Riley']);
    const blob = JSON.stringify({ DEMO_EVENTS, DEMO_MEALS, DEMO_MEMBERS });
    expect(blob).not.toMatch(/@/);
    expect(blob).not.toMatch(/\d{3}-\d{3}-\d{4}/);
  });

  it('covers the frozen day with events and meals', () => {
    expect(DEMO_EVENTS.some((event) => event.start.startsWith(DEMO_DAY))).toBe(true);
    expect(DEMO_MEALS.filter((meal) => meal.date === DEMO_DAY).map((meal) => meal.meal_type)).toEqual([
      'Breakfast',
      'Lunch',
      'Dinner',
      'Snack',
    ]);
  });

  it('seeds the stores the app reads on startup', () => {
    installDemo();
    const members = JSON.parse(localStorage.getItem('beacon_family_members') ?? '[]') as { name: string }[];
    const meals = JSON.parse(localStorage.getItem('beacon_meal_plans') ?? '[]') as { name: string }[];
    const settings = JSON.parse(localStorage.getItem('beacon-settings') ?? '{}') as { familyName: string };
    expect(members).toHaveLength(4);
    expect(meals.some((meal) => meal.name === 'Veggie tacos')).toBe(true);
    expect(settings.familyName).toBe('Rivera');
    expect(localStorage.getItem('beacon_ha_token')).toBeNull();
  });
});
