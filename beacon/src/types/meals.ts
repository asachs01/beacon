export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export interface MealPlanEntry {
  date: string;       // YYYY-MM-DD
  meal_type: MealType;
  name: string;
  recipe_id?: string;
}

export interface DayMenu {
  date: string;
  meals: MealPlanEntry[];
}
