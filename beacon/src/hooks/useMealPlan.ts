import { useState, useEffect, useCallback, useMemo } from 'react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { loadData, loadDataSync } from '../api/beacon-store';
import { MealPlanData, Recipe } from '../types/meal-plan';

const STORE_KEY = 'meal-plan';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const EMPTY_DATA: MealPlanData = { events: [], recipes: {} };

export function useMealPlan() {
  const [data, setData] = useState<MealPlanData>(() =>
    loadDataSync<MealPlanData>(STORE_KEY, EMPTY_DATA)
  );

  const refresh = useCallback(async () => {
    const loaded = await loadData<MealPlanData>(STORE_KEY, EMPTY_DATA);
    setData(loaded);
  }, []);

  // Initial async load + periodic refresh
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  // Filter events for the current week (Sun–Sat)
  const weekEvents = useMemo(() => {
    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 0 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 0 }), 'yyyy-MM-dd');

    return data.events.filter(
      (e) => e.date >= weekStart && e.date <= weekEnd
    );
  }, [data.events]);

  const getRecipe = useCallback(
    (name: string): Recipe | undefined => data.recipes[name],
    [data.recipes]
  );

  return {
    events: weekEvents,
    getRecipe,
    lastSynced: data.lastSynced,
    refresh,
  };
}
