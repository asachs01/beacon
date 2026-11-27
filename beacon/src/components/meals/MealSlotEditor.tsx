import { useState } from 'react';
import type { BeaconRecipe, MealPlanEntry, MealType } from '../../types/meals';
import { useTranslation } from '../../i18n';

interface MealSlotEditorProps {
  date: string;
  mealType: MealType;
  entry?: MealPlanEntry;
  recipes: BeaconRecipe[];
  onSave: (entry: MealPlanEntry) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onSaveRecipe: (input: { id?: string; name: string; ingredients: string[] }) => Promise<BeaconRecipe>;
  onAddIngredients: (ingredients: string[]) => Promise<void>;
  onClose: () => void;
}

export function MealSlotEditor({
  date,
  mealType,
  entry,
  recipes,
  onSave,
  onDelete,
  onSaveRecipe,
  onAddIngredients,
  onClose,
}: MealSlotEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(entry?.name ?? '');
  const [notes, setNotes] = useState(typeof entry?.notes === 'string' ? entry.notes : '');
  const [recipeId, setRecipeId] = useState(typeof entry?.recipe_id === 'string' ? entry.recipe_id : '');
  const [creating, setCreating] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [ingredientText, setIngredientText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const selected = recipes.find((recipe) => recipe.id === recipeId || recipe.name === recipeId);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      if (entry && onDelete) await onDelete();
      onClose();
      return;
    }
    setBusy(true);
    try {
      let nextRecipeId = recipeId;
      if (creating && recipeName.trim()) {
        const saved = await onSaveRecipe({
          name: recipeName,
          ingredients: ingredientText.split('\n'),
        });
        nextRecipeId = saved.id;
        setRecipeId(saved.id);
        setCreating(false);
      }
      await onSave({
        ...entry,
        date,
        meal_type: mealType,
        name: trimmed,
        notes: notes.trim() || null,
        recipe_id: nextRecipeId || null,
      } as MealPlanEntry);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleAddIngredients = async () => {
    if (!selected || selected.ingredients.length === 0) return;
    setBusy(true);
    setNotice('');
    try {
      await onAddIngredients(selected.ingredients);
      setNotice(t('meals.addedToGrocery'));
    } catch {
      setNotice(t('meals.groceryFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="meal-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <label className="meal-editor-field">
        <span>{t('meals.mealName')}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('meals.mealName')}
          autoFocus
        />
      </label>
      <label className="meal-editor-field">
        <span>{t('meals.notes')}</span>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('meals.notes')}
        />
      </label>
      <label className="meal-editor-field">
        <span>{t('meals.recipe')}</span>
        <select
          value={creating ? '__new__' : recipeId}
          onChange={(event) => {
            const value = event.target.value;
            if (value === '__new__') {
              setCreating(true);
              return;
            }
            setCreating(false);
            setRecipeId(value);
            const recipe = recipes.find((item) => item.id === value);
            if (recipe && !name.trim()) setName(recipe.name);
          }}
        >
          <option value="">{t('meals.noRecipe')}</option>
          {recipes.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
          ))}
          <option value="__new__">{t('meals.newRecipe')}</option>
        </select>
      </label>
      {creating && (
        <>
          <label className="meal-editor-field">
            <span>{t('meals.recipeName')}</span>
            <input
              value={recipeName}
              onChange={(event) => setRecipeName(event.target.value)}
              placeholder={t('meals.recipeName')}
            />
          </label>
          <label className="meal-editor-field">
            <span>{t('meals.ingredients')}</span>
            <textarea
              value={ingredientText}
              onChange={(event) => setIngredientText(event.target.value)}
              placeholder={t('meals.ingredientsHint')}
              rows={4}
            />
          </label>
        </>
      )}
      {selected && selected.ingredients.length > 0 && (
        <button
          type="button"
          className="meal-editor-secondary"
          onClick={() => { void handleAddIngredients(); }}
          disabled={busy}
        >
          {t('meals.addToGrocery')}
        </button>
      )}
      {notice && <p className="meal-editor-notice">{notice}</p>}
      <div className="meal-editor-actions">
        <button type="submit" className="meal-editor-primary" disabled={busy}>
          {t('common.save')}
        </button>
        {entry && onDelete && (
          <button
            type="button"
            className="meal-editor-danger"
            disabled={busy}
            onClick={() => { void Promise.resolve(onDelete()).then(onClose); }}
          >
            {t('meals.deleteMeal')}
          </button>
        )}
        <button type="button" className="meal-editor-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
