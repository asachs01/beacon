import { useState, useEffect, useMemo } from 'react';
import { loadData } from '../api/beacon-store';
import { MealPlanEntry, DayMenu } from '../types/meals';

const STORAGE_KEY = 'beacon_meal_plans';
const REFRESH_INTERVAL = 5 * 60 * 1000; // re-read store every 5 min

/**
 * Reads meal plan entries from the beacon data store.
 * Data is written externally (MCP sync, CLI script, etc.).
 */
export function useMealPlans() {
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);

  useEffect(() => {
    const load = () => {
      loadData<MealPlanEntry[]>(STORAGE_KEY, []).then(setEntries);
    };
    load();
    const interval = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);

  const todaysMenu: DayMenu = useMemo(() => {
    const meals = entries
      .filter((e) => e.date === todayStr)
      .sort((a, b) => {
        const order = { Breakfast: 0, Lunch: 1, Dinner: 2, Snack: 3 };
        return (order[a.meal_type] ?? 4) - (order[b.meal_type] ?? 4);
      });
    return { date: todayStr, meals };
  }, [entries, todayStr]);

  return { entries, todaysMenu };
}
