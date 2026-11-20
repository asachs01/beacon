import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMealPlans } from './useMealPlans';
import type { MealPlanEntry } from '../types/meals';

/** 18:00 America/Phoenix on 2026-11-20 — already 2026-11-21 in UTC. */
const PHOENIX_EVENING = new Date('2026-11-20T18:00:00-07:00');

const SAVED_PLAN: MealPlanEntry[] = [
  { date: '2026-11-20', meal_type: 'Dinner', name: 'Tacos' },
  { date: '2026-11-21', meal_type: 'Breakfast', name: 'Oatmeal' },
];

describe('useMealPlans today', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Phoenix';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(PHOENIX_EVENING);
    localStorage.setItem('beacon_meal_plans', JSON.stringify(SAVED_PLAN));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('shows the local day meals after 5pm in America/Phoenix, not tomorrow UTC', async () => {
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-21');

    const { result } = renderHook(() => useMealPlans());

    await waitFor(() => {
      expect(result.current.todaysMenu.meals).toHaveLength(1);
    });

    expect(result.current.todaysMenu.date).toBe('2026-11-20');
    expect(result.current.todaysMenu.meals[0]).toMatchObject({
      date: '2026-11-20',
      name: 'Tacos',
    });
    // Saved keys are still the original YYYY-MM-DD strings.
    expect(result.current.entries.map((entry) => entry.date)).toEqual([
      '2026-11-20',
      '2026-11-21',
    ]);
  });
});
