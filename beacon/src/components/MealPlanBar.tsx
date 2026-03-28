import { useState, useCallback } from 'react';
import { MealPlanEntry } from '../types/grocery';

interface MealPlanBarProps {
  todayMeals: MealPlanEntry[];
  available: boolean;
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export function MealPlanBar({ todayMeals, available }: MealPlanBarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => {
    setCollapsed(prev => !prev);
  }, []);

  // Only render if there's meal plan data
  if (!available || todayMeals.length === 0) return null;

  // Build a summary string: "Tacos for dinner" or "Oatmeal for breakfast, Tacos for dinner"
  const summary = todayMeals
    .map(m => `${m.recipe_name} for ${MEAL_LABELS[m.meal_type]?.toLowerCase() ?? m.meal_type}`)
    .join(', ');

  if (collapsed) {
    return (
      <button
        type="button"
        className="meal-plan-bar meal-plan-bar--collapsed"
        onClick={toggle}
        aria-label="Expand meal plan"
      >
        <span className="meal-plan-bar-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 2v12M4 6l4-4 4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
    );
  }

  return (
    <div className="meal-plan-bar">
      <button
        type="button"
        className="meal-plan-bar-content"
        onClick={toggle}
        aria-label="Collapse meal plan"
      >
        <span className="meal-plan-bar-label">Today:</span>
        <span className="meal-plan-bar-meals">{summary}</span>
        {todayMeals.some(m => m.notes) && (
          <span className="meal-plan-bar-notes">
            {todayMeals.filter(m => m.notes).map(m => m.notes).join(' | ')}
          </span>
        )}
      </button>
    </div>
  );
}
