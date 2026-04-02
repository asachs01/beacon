export interface MealPlanEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  label?: 'Breakfast' | 'Lunch' | 'Dinner';
  labelColor?: string; // hex color
  recipeId?: string;
  details?: string;
}

export interface Recipe {
  name: string;
  sourceUrl?: string;
  sourceName?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: string;
  notes?: string;
  ingredients: string[];
  steps: string[];
}

export interface MealPlanData {
  events: MealPlanEvent[];
  recipes: Record<string, Recipe>; // keyed by recipe name
  lastSynced?: string; // ISO timestamp
}
