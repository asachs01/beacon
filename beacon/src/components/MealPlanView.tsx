import { useState, useMemo } from 'react';
import {
  startOfWeek,
  addDays,
  format,
  isToday,
  formatDistanceToNow,
} from 'date-fns';
import {
  ChefHat,
  Clock,
  Users,
  ExternalLink,
  UtensilsCrossed,
} from 'lucide-react';
import { MealPlanEvent, Recipe } from '../types/meal-plan';
import '../styles/meal-plan.css';

interface MealPlanViewProps {
  events: MealPlanEvent[];
  getRecipe: (name: string) => Recipe | undefined;
  lastSynced?: string;
}

const LABEL_ORDER: Record<string, number> = {
  Breakfast: 0,
  Lunch: 1,
  Dinner: 2,
};

const DEFAULT_LABEL_COLORS: Record<string, string> = {
  Breakfast: '#f59e0b',
  Lunch: '#3b82f6',
  Dinner: '#8b5cf6',
};

/** Build an array of 7 days for the current week (Sun–Sat). */
function getWeekDays(): Date[] {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function MealPlanView({ events, getRecipe, lastSynced }: MealPlanViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const weekDays = useMemo(() => getWeekDays(), []);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, MealPlanEvent[]>();
    for (const evt of events) {
      const key = evt.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(evt);
    }
    // Sort each day's events by label order
    for (const [, dayEvents] of map) {
      dayEvents.sort(
        (a, b) =>
          (LABEL_ORDER[a.label || ''] ?? 99) - (LABEL_ORDER[b.label || ''] ?? 99)
      );
    }
    return map;
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="meal-plan-view">
        <div className="meal-plan-header">
          <UtensilsCrossed size={28} className="meal-plan-header-icon" />
          <h1>Meal Plan</h1>
        </div>
        <div className="meal-plan-empty">
          <UtensilsCrossed size={56} className="meal-plan-empty-icon" />
          <p>No meal plan data yet. Sync from AnyList to get started.</p>
        </div>
      </div>
    );
  }

  const handleToggle = (id: string, hasRecipe: boolean) => {
    if (!hasRecipe) return;
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="meal-plan-view">
      <div className="meal-plan-header">
        <UtensilsCrossed size={28} className="meal-plan-header-icon" />
        <h1>Meal Plan</h1>
      </div>

      {weekDays.map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayEvents = eventsByDate.get(dateKey) || [];
        const today = isToday(day);

        return (
          <div
            key={dateKey}
            className={`meal-plan-day ${today ? 'meal-plan-day--today' : ''}`}
          >
            <div className="meal-plan-day-header">
              <span
                className={`meal-plan-day-name ${today ? 'meal-plan-day-name--today' : ''}`}
              >
                {format(day, 'EEEE')}
              </span>
              <span className="meal-plan-day-date">
                {format(day, 'MMM d')}
              </span>
            </div>

            {dayEvents.length === 0 ? (
              <div className="meal-plan-day-empty">No meals planned</div>
            ) : (
              <div className="meal-plan-day-body">
                {dayEvents.map((evt) => {
                  const recipe = evt.recipeId
                    ? getRecipe(evt.recipeId)
                    : undefined;
                  const hasRecipe = !!recipe;
                  const isExpanded = expandedId === evt.id;
                  const dotColor =
                    evt.labelColor ||
                    DEFAULT_LABEL_COLORS[evt.label || ''] ||
                    'var(--text-secondary)';

                  return (
                    <div
                      key={evt.id}
                      className={`meal-entry ${hasRecipe ? 'meal-entry--clickable' : ''}`}
                    >
                      <div
                        className="meal-entry-row"
                        onClick={() => handleToggle(evt.id, hasRecipe)}
                      >
                        <span
                          className="meal-entry-dot"
                          style={{ background: dotColor }}
                        />
                        {evt.label && (
                          <span className="meal-entry-label">{evt.label}</span>
                        )}
                        <span className="meal-entry-title">{evt.title}</span>
                        {hasRecipe && (
                          <span className="meal-entry-recipe-badge">
                            <ChefHat size={14} />
                            Recipe
                          </span>
                        )}
                      </div>

                      {isExpanded && recipe && (
                        <RecipeDetail recipe={recipe} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {lastSynced && (
        <div className="meal-plan-footer">
          Last synced:{' '}
          {formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}
        </div>
      )}
    </div>
  );
}

/* ---- Inline Recipe Detail ---- */

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const hasMeta = recipe.prepTime || recipe.cookTime || recipe.servings;

  return (
    <div className="meal-entry-recipe">
      {hasMeta && (
        <div className="meal-recipe-meta">
          {recipe.prepTime != null && (
            <span className="meal-recipe-meta-item">
              <Clock size={14} /> Prep: {recipe.prepTime}m
            </span>
          )}
          {recipe.cookTime != null && (
            <span className="meal-recipe-meta-item">
              <Clock size={14} /> Cook: {recipe.cookTime}m
            </span>
          )}
          {recipe.servings && (
            <span className="meal-recipe-meta-item">
              <Users size={14} /> {recipe.servings}
            </span>
          )}
        </div>
      )}

      {recipe.ingredients.length > 0 && (
        <div>
          <div className="meal-recipe-section-title">Ingredients</div>
          <ul className="meal-recipe-ingredients">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{ing}</li>
            ))}
          </ul>
        </div>
      )}

      {recipe.steps.length > 0 && (
        <div>
          <div className="meal-recipe-section-title">Steps</div>
          <ol className="meal-recipe-steps">
            {recipe.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {recipe.notes && <div className="meal-recipe-notes">{recipe.notes}</div>}

      {recipe.sourceUrl && (
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="meal-recipe-source"
        >
          <ExternalLink size={14} />
          {recipe.sourceName || 'View source'}
        </a>
      )}
    </div>
  );
}
