export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export const MEAL_TYPES: readonly MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

/**
 * One planned meal. The on-disk value is still a plain JSON array of these
 * objects under `beacon_meal_plans`. `id` and `notes` are optional additions.
 * Unknown fields are preserved by the migrator and by saves.
 */
export interface MealPlanEntry {
  date: string;       // YYYY-MM-DD local calendar key. Never rewrite it.
  meal_type: MealType;
  name: string;
  recipe_id?: string;
  id?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface DayMenu {
  date: string;
  meals: MealPlanEntry[];
}

/** A Beacon recipe. Ids use the `br_` prefix. */
export interface BeaconRecipe {
  id: string;
  name: string;
  ingredients: string[];
}

export interface BeaconRecipeStore {
  schema_version: 1;
  recipes: BeaconRecipe[];
}
