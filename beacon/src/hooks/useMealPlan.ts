import { useState, useEffect, useCallback, useRef } from 'react';
import { MealPlanEntry } from '../types/grocery';
import { GrocyClient } from '../api/grocy';

interface UseMealPlanResult {
  meals: MealPlanEntry[];
  todayMeals: MealPlanEntry[];
  loading: boolean;
  available: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook for meal plan data from Grocy via Home Assistant's REST API.
 * Returns today's meals and the current week's plan.
 */
export function useMealPlan(connected: boolean): UseMealPlanResult {
  const [meals, setMeals] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(false);
  const grocyRef = useRef(new GrocyClient());

  const refresh = useCallback(async () => {
    if (!connected) return;

    setLoading(true);
    try {
      const today = new Date();
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const startDate = today.toISOString().split('T')[0];
      const endDate = weekEnd.toISOString().split('T')[0];

      const result = await grocyRef.current.getMealPlan(startDate, endDate);
      setMeals(result);
      setAvailable(result.length > 0);
    } catch (err) {
      console.warn('Beacon: Meal plan fetch failed', err);
      setMeals([]);
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    if (connected) {
      refresh();
    }
  }, [connected, refresh]);

  // Refresh every 5 minutes
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [connected, refresh]);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayMeals = meals.filter(m => m.date === todayStr);

  return { meals, todayMeals, loading, available, refresh };
}
