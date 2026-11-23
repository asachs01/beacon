export interface BeaconRecipeRecord {
  id: string;
  name: string;
  ingredients: string[];
}

export interface BeaconRecipeStoreRecord {
  schema_version: 1;
  recipes: BeaconRecipeRecord[];
}

export interface MealMigrationResult {
  plan: Array<Record<string, unknown>>;
  recipes: BeaconRecipeStoreRecord;
  planChanged: boolean;
  recipesChanged: boolean;
  planMalformed: boolean;
}

export function migrateMealStores(input: {
  plan: unknown;
  legacy?: unknown;
  recipes?: unknown;
  createId?: () => string;
}): MealMigrationResult;

export function mergeMealPlan(
  existing: unknown[],
  incoming: unknown[],
  createId?: () => string,
): Array<Record<string, unknown>>;

export function replaceWeekMeals(
  plan: unknown[],
  dates: string[],
  meals: unknown[],
): { plan: Array<Record<string, unknown>>; rejected: boolean };

export function isRecipeStore(store: unknown): store is {
  schema_version?: number;
  recipes: Array<Record<string, unknown>>;
};
export function isRecipesEmpty(store: unknown): boolean;
export function defaultMealId(): string;
export function createRecipeId(): string;
export const MEAL_TYPES: readonly ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
