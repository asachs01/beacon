import { useMemo, useState } from 'react';
import { addDays, startOfDay } from 'date-fns';
import { addCalendarDays, localDayKey } from '../api/date-keys';
import { addIngredientsToGroceryList } from '../api/grocery-write';
import { useMealPlans } from '../hooks/useMealPlans';
import { useTranslation } from '../i18n';
import { MEAL_TYPES, type MealType } from '../types/meals';
import { MealSlotEditor } from './meals/MealSlotEditor';

interface MealsViewProps {
  weekStartsOn?: 0 | 1;
  groceryListId?: string;
}

function weekDateKeys(anchor: Date, weekStartsOn: 0 | 1): string[] {
  const key = localDayKey(anchor);
  const delta = (anchor.getDay() - weekStartsOn + 7) % 7;
  const start = addCalendarDays(key, -delta);
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index));
}

/** Format a YYYY-MM-DD key without `new Date('YYYY-MM-DD')` (that parses as UTC). */
function formatDayKey(dayKey: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return dayKey;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

export function MealsView({ weekStartsOn = 0, groceryListId = 'beacon-shopping' }: MealsViewProps) {
  const { t, lang } = useTranslation();
  const locale = lang === 'en' ? 'en-US' : lang;
  const {
    entries,
    recipes,
    upsertMeal,
    deleteMeal,
    saveRecipe,
  } = useMealPlans();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selection, setSelection] = useState<{ date: string; mealType: MealType } | null>(null);

  const dates = useMemo(() => {
    const anchor = addDays(startOfDay(new Date()), weekOffset * 7);
    return weekDateKeys(anchor, weekStartsOn);
  }, [weekOffset, weekStartsOn]);

  const today = localDayKey();
  const mealTypeLabel = (mealType: MealType) => t(`meals.${mealType.toLowerCase()}` as 'meals.breakfast');

  const selectedEntry = selection
    ? entries.find((entry) => entry.date === selection.date && entry.meal_type === selection.mealType)
    : undefined;

  return (
    <section className="meals-view">
      <header className="meals-view-header">
        <h1>{t('meals.title')}</h1>
        <div className="meals-view-nav">
          <button type="button" onClick={() => setWeekOffset((value) => value - 1)} aria-label={t('meals.previousWeek')}>
            ‹
          </button>
          <button type="button" onClick={() => { setWeekOffset(0); setSelection(null); }}>
            {t('common.today')}
          </button>
          <button type="button" onClick={() => setWeekOffset((value) => value + 1)} aria-label={t('meals.nextWeek')}>
            ›
          </button>
        </div>
      </header>
      <div className="meals-grid-wrap">
        <table className="meals-grid">
          <thead>
            <tr>
              <th scope="col" />
              {dates.map((date) => (
                <th key={date} scope="col" className={date === today ? 'is-today' : undefined}>
                  {formatDayKey(date, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEAL_TYPES.map((mealType) => (
              <tr key={mealType}>
                <th scope="row">{mealTypeLabel(mealType)}</th>
                {dates.map((date) => {
                  const meal = entries.find((entry) => entry.date === date && entry.meal_type === mealType);
                  const selected = selection?.date === date && selection.mealType === mealType;
                  return (
                    <td key={date}>
                      <button
                        type="button"
                        className={`meals-cell${selected ? ' is-selected' : ''}${meal ? '' : ' is-empty'}`}
                        onClick={() => setSelection({ date, mealType })}
                        aria-label={meal
                          ? `${mealTypeLabel(mealType)} ${formatDayKey(date, locale)} ${meal.name}`
                          : `${t('meals.addMeal')} ${mealTypeLabel(mealType)} ${formatDayKey(date, locale)}`}
                      >
                        {meal?.name || t('meals.addMeal')}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selection && (
        <MealSlotEditor
          key={`${selection.date}-${selection.mealType}`}
          date={selection.date}
          mealType={selection.mealType}
          entry={selectedEntry}
          recipes={recipes}
          onSave={upsertMeal}
          onDelete={selectedEntry
            ? () => deleteMeal({
              date: selection.date,
              meal_type: selection.mealType,
              id: selectedEntry.id,
            })
            : undefined}
          onSaveRecipe={saveRecipe}
          onAddIngredients={async (ingredients) => {
            await addIngredientsToGroceryList(ingredients, groceryListId);
          }}
          onClose={() => setSelection(null)}
        />
      )}
    </section>
  );
}
