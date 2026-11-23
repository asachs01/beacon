import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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

/** 23:30 America/New_York on 2026-11-20 — already 2026-11-21 in UTC. */
const NEW_YORK_LATE = new Date('2026-11-20T23:30:00-05:00');

describe('useMealPlans New York evening', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NEW_YORK_LATE);
    localStorage.setItem('beacon_meal_plans', JSON.stringify(SAVED_PLAN));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('shows the local day meals at 23:30 in America/New_York, not tomorrow UTC', async () => {
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
    expect(result.current.entries.map((entry) => entry.date)).toEqual([
      '2026-11-20',
      '2026-11-21',
    ]);
  });
});

function readOldStyle(raw: string) {
  const data = JSON.parse(raw) as Array<Record<string, unknown>>;
  if (!Array.isArray(data)) throw new Error('meal plan must stay a plain array');
  return data.map((entry) => ({
    date: entry.date,
    meal_type: entry.meal_type,
    name: entry.name,
    recipe_id: entry.recipe_id,
  }));
}

describe('useMealPlans saves', () => {
  beforeEach(() => {
    localStorage.setItem('beacon_meal_plans', JSON.stringify([
      { date: '2026-11-20', meal_type: 'Dinner', name: 'Tacos', recipe_id: 'r1', source: 'anylist' },
      { date: '2026-11-21', meal_type: 'Breakfast', name: 'Oatmeal' },
    ]));
  });

  it('keeps a plain array an old reader can understand after a new save', async () => {
    const original = localStorage.getItem('beacon_meal_plans');
    const { result } = renderHook(() => useMealPlans());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(localStorage.getItem('beacon_meal_plans.bak')).toBe(original);

    await act(async () => {
      await result.current.upsertMeal({
        date: '2026-11-21',
        meal_type: 'Lunch',
        name: 'Soup',
        notes: 'no onions',
        recipe_id: 'r2',
      });
    });

    const raw = localStorage.getItem('beacon_meal_plans') ?? '';
    expect(readOldStyle(raw)).toEqual([
      { date: '2026-11-20', meal_type: 'Dinner', name: 'Tacos', recipe_id: 'r1' },
      { date: '2026-11-21', meal_type: 'Breakfast', name: 'Oatmeal', recipe_id: undefined },
      { date: '2026-11-21', meal_type: 'Lunch', name: 'Soup', recipe_id: 'r2' },
    ]);
    const stored = JSON.parse(raw) as Array<Record<string, unknown>>;
    expect(stored.find((entry) => entry.name === 'Tacos')).toMatchObject({
      date: '2026-11-20',
      source: 'anylist',
      recipe_id: 'r1',
    });
    expect(stored.find((entry) => entry.name === 'Soup')?.notes).toBe('no onions');
  });

  it('reads the latest store before writing so another edit is not dropped', async () => {
    const { result } = renderHook(() => useMealPlans());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const current = JSON.parse(localStorage.getItem('beacon_meal_plans') ?? '[]') as MealPlanEntry[];
    localStorage.setItem('beacon_meal_plans', JSON.stringify([
      ...current,
      { id: 'bm_apple', date: '2026-12-01', meal_type: 'Snack', name: 'Apple' },
    ]));

    await act(async () => {
      await result.current.upsertMeal({
        date: '2026-11-20',
        meal_type: 'Dinner',
        name: 'Chili',
      });
    });

    const stored = JSON.parse(localStorage.getItem('beacon_meal_plans') ?? '[]') as MealPlanEntry[];
    expect(stored.map((entry) => entry.name).sort()).toEqual(['Apple', 'Chili', 'Oatmeal']);
    expect(stored.find((entry) => entry.name === 'Chili')?.date).toBe('2026-11-20');
  });

  it('does not write an empty week over meals that are already stored', async () => {
    const { result } = renderHook(() => useMealPlans());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let accepted = true;
    await act(async () => {
      accepted = await result.current.saveWeek(
        ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'],
        [],
      );
    });

    expect(accepted).toBe(false);
    const stored = JSON.parse(localStorage.getItem('beacon_meal_plans') ?? '[]') as MealPlanEntry[];
    expect(stored.map((entry) => entry.name).sort()).toEqual(['Oatmeal', 'Tacos']);
  });

  it('refreshes when the document becomes visible', async () => {
    const { result } = renderHook(() => useMealPlans());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    localStorage.setItem('beacon_meal_plans', JSON.stringify([
      { id: 'bm_chili', date: '2026-11-20', meal_type: 'Dinner', name: 'Chili' },
    ]));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(result.current.entries.map((entry) => entry.name)).toEqual(['Chili']);
    });
  });
});
