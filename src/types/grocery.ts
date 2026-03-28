export interface GroceryItem {
  id: string;
  name: string;
  checked: boolean;
  category?: string;
  quantity?: string;
  added_by?: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface MealPlanEntry {
  date: string;
  meal_type: MealType;
  recipe_name: string;
  notes?: string;
}

export interface GroceryList {
  id: string;
  name: string;
  items: GroceryItem[];
}
