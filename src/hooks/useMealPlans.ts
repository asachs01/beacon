import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadData, saveData } from '../api/beacon-store';
import { localDayKey } from '../api/date-keys';
import {
  createRecipeId,
  isRecipeStore,
  isRecipesEmpty,
  mergeMealPlan,
  migrateMealStores,
  replaceWeekMeals,
} from '../api/meal-plan-migrate.cjs';
import {
  BeaconRecipe,
  BeaconRecipeStore,
  DayMenu,
  MealPlanEntry,
  MealType,
} from '../types/meals';

const STORAGE_KEY = 'beacon_meal_plans';
const RECIPES_KEY = 'beacon_recipes';
const LEGACY_KEY = 'meal-plan';
/** localStorage mirror of beacon_meal_plans.bak.json. The add-on file backup is written by the data API. */
const BACKUP_KEY = 'beacon_meal_plans.bak';
const REFRESH_INTERVAL = 5 * 60 * 1000;

function asRecipes(store: { schema_version: 1; recipes: Array<{ id: string; name: string; ingredients: string[] }> }): BeaconRecipe[] {
  return store.recipes.filter((recipe) => recipe.id && recipe.name).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    ingredients: recipe.ingredients,
  }));
}

function asEntries(plan: Array<Record<string, unknown>>): MealPlanEntry[] {
  return plan as MealPlanEntry[];
}

/**
 * Reads and edits the meal plan.
 * Saves are read-modify-write against the store, with an optimistic local update.
 * An empty week is never written over meals that are already stored.
 */
export function useMealPlans() {
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<BeaconRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);

  const backupLocalPlan = useCallback((original: string | null) => {
    if (original == null) return;
    try {
      if (localStorage.getItem(BACKUP_KEY) == null) {
        localStorage.setItem(BACKUP_KEY, original);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const refresh = useCallback((isCancelled?: () => boolean) => enqueue(async () => {
    let originalPlan: string | null = null;
    try { originalPlan = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }

    const [planRaw, legacyRaw, recipesRaw] = await Promise.all([
      loadData<unknown>(STORAGE_KEY, []),
      loadData<unknown>(LEGACY_KEY, null),
      loadData<unknown>(RECIPES_KEY, null),
    ]);
    if (isCancelled?.()) return;

    const migrated = migrateMealStores({
      plan: planRaw,
      legacy: legacyRaw,
      recipes: recipesRaw,
    });
    if (isCancelled?.()) return;

    if (migrated.planMalformed) {
      setEntries([]);
      setRecipes(asRecipes(migrated.recipes));
      setLoaded(true);
      return;
    }

    if (migrated.planChanged) {
      backupLocalPlan(originalPlan);
      await saveData(STORAGE_KEY, migrated.plan);
    }
    if (migrated.recipesChanged) {
      await saveData(RECIPES_KEY, migrated.recipes);
    }
    if (isCancelled?.()) return;

    setEntries(asEntries(migrated.plan));
    setRecipes(asRecipes(migrated.recipes));
    setLoaded(true);
  }), [backupLocalPlan, enqueue]);

  useEffect(() => {
    let cancelled = false;
    void refresh(() => cancelled);
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => { void refresh(); }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  // Re-fetch when the app becomes visible (mirror useSettings).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refresh]);

  const readPlan = useCallback(async (): Promise<{ malformed: boolean; plan: MealPlanEntry[] }> => {
    const raw = await loadData<unknown>(STORAGE_KEY, []);
    if (!Array.isArray(raw)) return { malformed: true, plan: [] };
    const migrated = migrateMealStores({
      plan: raw,
      legacy: null,
      // Skip recipe import while applying a meal edit.
      recipes: { schema_version: 1, recipes: [{ id: 'br_lock', name: 'lock', ingredients: [] }] },
    });
    return { malformed: false, plan: asEntries(migrated.plan) };
  }, []);

  const upsertMeal = useCallback((entry: MealPlanEntry) => {
    setEntries((prev) => asEntries(mergeMealPlan(prev, [entry])));
    return enqueue(async () => {
      const stored = await readPlan();
      if (stored.malformed) {
        setEntries([]);
        return;
      }
      const next = asEntries(mergeMealPlan(stored.plan, [entry]));
      await saveData(STORAGE_KEY, next);
      setEntries(next);
    });
  }, [enqueue, readPlan]);

  const deleteMeal = useCallback((target: { date: string; meal_type: MealType; id?: string }) => {
    const clear = { date: target.date, meal_type: target.meal_type, name: '' };
    setEntries((prev) => asEntries(mergeMealPlan(prev, [clear])));
    return enqueue(async () => {
      const stored = await readPlan();
      if (stored.malformed) {
        setEntries([]);
        return;
      }
      const next = asEntries(mergeMealPlan(stored.plan, [clear]));
      await saveData(STORAGE_KEY, next);
      setEntries(next);
    });
  }, [enqueue, readPlan]);

  const saveWeek = useCallback((dates: string[], meals: MealPlanEntry[]) => {
    setEntries((prev) => {
      const result = replaceWeekMeals(prev, dates, meals);
      return result.rejected ? prev : asEntries(result.plan);
    });
    return enqueue(async () => {
      const stored = await readPlan();
      if (stored.malformed) {
        setEntries([]);
        return false;
      }
      const result = replaceWeekMeals(stored.plan, dates, meals);
      if (result.rejected) {
        setEntries(stored.plan);
        return false;
      }
      const next = asEntries(result.plan);
      await saveData(STORAGE_KEY, next);
      setEntries(next);
      return true;
    });
  }, [enqueue, readPlan]);

  const saveRecipe = useCallback((input: { id?: string; name: string; ingredients: string[] }) => {
    const name = input.name.trim();
    const ingredients = input.ingredients.map((item) => item.trim()).filter(Boolean);
    const id = input.id && input.id.startsWith('br_') ? input.id : createRecipeId();
    const recipe: BeaconRecipe = { id, name, ingredients };
    setRecipes((prev) => (
      prev.some((item) => item.id === id)
        ? prev.map((item) => (item.id === id ? recipe : item))
        : [...prev, recipe]
    ));
    return enqueue(async () => {
      const raw = await loadData<unknown>(RECIPES_KEY, null);
      if (raw != null && !isRecipesEmpty(raw) && !isRecipeStore(raw)) {
        return recipe;
      }
      const current: BeaconRecipe[] = isRecipeStore(raw)
        ? raw.recipes.filter((item) => item && typeof item.id === 'string').map((item) => ({
          id: String(item.id),
          name: typeof item.name === 'string' ? item.name : '',
          ingredients: Array.isArray(item.ingredients)
            ? item.ingredients.filter((line): line is string => typeof line === 'string')
            : [],
        }))
        : [];
      const recipesNext = current.some((item) => item.id === id)
        ? current.map((item) => (item.id === id ? recipe : item))
        : [...current, recipe];
      const store: BeaconRecipeStore = { schema_version: 1, recipes: recipesNext };
      await saveData(RECIPES_KEY, store);
      setRecipes(recipesNext);
      return recipe;
    });
  }, [enqueue]);

  // Stored plans are local YYYY-MM-DD keys. UTC's date rolls to tomorrow
  // after 17:00 in UTC-7 (America/Phoenix), which would show the wrong day.
  const todayStr = localDayKey();

  const todaysMenu: DayMenu = useMemo(() => {
    const meals = entries
      .filter((entry) => entry.date === todayStr)
      .sort((a, b) => {
        const order = { Breakfast: 0, Lunch: 1, Dinner: 2, Snack: 3 };
        return (order[a.meal_type] ?? 4) - (order[b.meal_type] ?? 4);
      });
    return { date: todayStr, meals };
  }, [entries, todayStr]);

  return {
    entries,
    todaysMenu,
    recipes,
    loaded,
    refresh,
    upsertMeal,
    deleteMeal,
    saveWeek,
    saveRecipe,
  };
}
