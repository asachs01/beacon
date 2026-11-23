import { useState } from 'react';
import { DashboardCardProps } from '../../types/dashboard-cards';
import { MEAL_TYPES, MealType } from '../../types/meals';
import { useTranslation } from '../../i18n';
import { MealSlotEditor } from '../meals/MealSlotEditor';

const MEAL_ICONS: Record<MealType, string> = {
  Breakfast: '🌅',
  Lunch: '☀️',
  Dinner: '🌙',
  Snack: '🍎',
};

/** Sidebar "Menu" section — today's meal plan, including empty days. */
export function MenuCard({ context }: DashboardCardProps) {
  const { t } = useTranslation();
  const { todaysMenu, mealPlan, onPlanMeals } = context;
  const [editing, setEditing] = useState<MealType | null>(null);

  const mealTypeLabel = (mealType: MealType) => t(`meals.${mealType.toLowerCase()}` as 'meals.breakfast');

  return (
    <section className="dash-sidebar-section">
      <h3 className="dash-sidebar-heading">{t('dashboard.menu')}</h3>
      <ul className="dash-menu-list">
        {MEAL_TYPES.map((mealType) => {
          const meal = todaysMenu.meals.find((entry) => entry.meal_type === mealType);
          const open = editing === mealType;
          return (
            <li key={mealType} className="dash-menu-item">
              <button
                type="button"
                className="dash-menu-button"
                onClick={() => setEditing(open ? null : mealType)}
                aria-label={meal
                  ? `${t('meals.editMeal')} ${mealTypeLabel(mealType)} ${meal.name}`
                  : `${t('meals.addMeal')} ${mealTypeLabel(mealType)}`}
              >
                <span className="dash-menu-icon">{MEAL_ICONS[mealType]}</span>
                <span className="dash-menu-info">
                  <span className="dash-menu-type">{mealTypeLabel(mealType)}</span>
                  <span className={`dash-menu-name${meal ? '' : ' dash-menu-name--empty'}`}>
                    {meal?.name || t('meals.addMeal')}
                  </span>
                </span>
              </button>
              {open && mealPlan && (
                <MealSlotEditor
                  date={todaysMenu.date}
                  mealType={mealType}
                  entry={meal}
                  recipes={mealPlan.recipes}
                  onSave={mealPlan.upsertMeal}
                  onDelete={meal
                    ? () => mealPlan.deleteMeal({
                      date: todaysMenu.date,
                      meal_type: mealType,
                      id: meal.id,
                    })
                    : undefined}
                  onSaveRecipe={mealPlan.saveRecipe}
                  onAddIngredients={mealPlan.addIngredients}
                  onClose={() => setEditing(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {onPlanMeals && (
        <button type="button" className="dash-menu-plan" onClick={onPlanMeals}>
          {t('meals.planWeek')}
        </button>
      )}
    </section>
  );
}
