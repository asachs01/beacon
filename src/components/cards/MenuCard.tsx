import { DashboardCardProps } from '../../types/dashboard-cards';
import { MealType } from '../../types/meals';

const MEAL_ICONS: Record<MealType, string> = {
  Breakfast: '🌅',
  Lunch: '☀️',
  Dinner: '🌙',
  Snack: '🍎',
};

/** Sidebar "Menu" section — today's meal plan. */
export function MenuCard({ context }: DashboardCardProps) {
  const { todaysMenu } = context;

  if (todaysMenu.meals.length === 0) return null;

  return (
    <section className="dash-sidebar-section">
      <h3 className="dash-sidebar-heading">Menu</h3>
      <ul className="dash-menu-list">
        {todaysMenu.meals.map((meal, i) => (
          <li key={i} className="dash-menu-item">
            <span className="dash-menu-icon">{MEAL_ICONS[meal.meal_type] || '🍽️'}</span>
            <div className="dash-menu-info">
              <span className="dash-menu-type">{meal.meal_type}</span>
              <span className="dash-menu-name">{meal.name}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
