'use strict';

/**
 * Pure meal-plan migration and merge. No filesystem, so the SPA can bundle it.
 *
 * beacon_meal_plans stays a plain JSON array. Dates are stored YYYY-MM-DD
 * strings and are copied through unchanged — never via `new Date('YYYY-MM-DD')`.
 * Unknown fields on an entry (and recipe_id) are kept.
 */

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function defaultMealId() {
  return `bm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function createRecipeId() {
  return `br_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function recipeIdFromKey(key) {
  const slug = String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `br_${slug || 'recipe'}`;
}

function mealTypeFromLabel(label) {
  if (typeof label !== 'string') return 'Dinner';
  const trimmed = label.trim().toLowerCase();
  const found = MEAL_TYPES.find((type) => type.toLowerCase() === trimmed);
  return found || 'Dinner';
}

function isRecipeStore(store) {
  return !!(store && typeof store === 'object' && !Array.isArray(store) && Array.isArray(store.recipes));
}

/** Missing, a bare array, or a store with no recipes. Anything else is left alone. */
function isRecipesEmpty(store) {
  if (store == null) return true;
  if (Array.isArray(store)) return store.length === 0;
  if (isRecipeStore(store)) return store.recipes.length === 0;
  return false;
}

function definedFields(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function cloneEntry(entry) {
  return entry && typeof entry === 'object' && !Array.isArray(entry) ? { ...entry } : null;
}

function slotNameKey(entry) {
  return `${entry.date}\0${entry.meal_type}\0${entry.name}`;
}

function entryFromLegacyEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (typeof event.date !== 'string' || event.date.trim() === '') return null;
  if (typeof event.title !== 'string' || event.title.trim() === '') return null;
  const entry = {
    date: event.date,
    meal_type: mealTypeFromLabel(event.label),
    name: event.title,
  };
  if (event.recipeId != null && event.recipeId !== '') {
    entry.recipe_id = String(event.recipeId);
  }
  return entry;
}

function importLegacyRecipes(legacyRecipes) {
  if (!legacyRecipes || typeof legacyRecipes !== 'object' || Array.isArray(legacyRecipes)) return [];
  const recipes = [];
  const used = new Set();
  for (const [key, value] of Object.entries(legacyRecipes)) {
    const record = value && typeof value === 'object' ? value : {};
    const name = typeof record.name === 'string' && record.name.trim() ? record.name : String(key);
    const ingredients = Array.isArray(record.ingredients)
      ? record.ingredients.filter((item) => typeof item === 'string')
      : [];
    let id = recipeIdFromKey(key || name);
    let n = 2;
    while (used.has(id)) {
      id = `${recipeIdFromKey(key || name)}_${n++}`;
    }
    used.add(id);
    recipes.push({ id, name, ingredients });
  }
  return recipes;
}

function displayRecipes(store) {
  if (!isRecipeStore(store)) return { schema_version: 1, recipes: [] };
  return {
    schema_version: 1,
    recipes: store.recipes.filter((recipe) => recipe && typeof recipe === 'object').map((recipe) => ({
      id: typeof recipe.id === 'string' ? recipe.id : '',
      name: typeof recipe.name === 'string' ? recipe.name : '',
      ingredients: Array.isArray(recipe.ingredients)
        ? recipe.ingredients.filter((item) => typeof item === 'string')
        : [],
    })),
  };
}

/**
 * Fill missing meal ids, and import the unused `{events, recipes, lastSynced}`
 * meal-plan document. Import adds events that are not already present on
 * date + meal_type + name (an empty plan therefore receives every event).
 * Recipes are copied only when the beacon_recipes store is empty.
 * A non-array plan is malformed: callers must not write it back.
 *
 * @returns {{
 *   plan: object[],
 *   recipes: { schema_version: 1, recipes: object[] },
 *   planChanged: boolean,
 *   recipesChanged: boolean,
 *   planMalformed: boolean,
 * }}
 */
function migrateMealStores(input = {}) {
  const makeId = typeof input.createId === 'function' ? input.createId : defaultMealId;
  const { plan, legacy, recipes } = input;

  if (plan != null && !Array.isArray(plan)) {
    return {
      plan: [],
      recipes: displayRecipes(recipes),
      planChanged: false,
      recipesChanged: false,
      planMalformed: true,
    };
  }

  const source = Array.isArray(plan) ? plan : [];
  let planChanged = false;
  const nextPlan = [];
  for (const raw of source) {
    const entry = cloneEntry(raw);
    if (!entry) {
      planChanged = true;
      continue;
    }
    if (typeof entry.id !== 'string' || entry.id === '') {
      entry.id = makeId();
      planChanged = true;
    }
    nextPlan.push(entry);
  }

  const events = legacy && typeof legacy === 'object' && Array.isArray(legacy.events) ? legacy.events : [];
  const seen = new Set(nextPlan.map(slotNameKey));
  for (const event of events) {
    const entry = entryFromLegacyEvent(event);
    if (!entry) continue;
    const key = slotNameKey(entry);
    if (seen.has(key)) continue;
    entry.id = makeId();
    seen.add(key);
    nextPlan.push(entry);
    planChanged = true;
  }

  let recipesChanged = false;
  let nextRecipes = displayRecipes(recipes);
  if (isRecipesEmpty(recipes)) {
    const imported = importLegacyRecipes(legacy && typeof legacy === 'object' ? legacy.recipes : null);
    if (imported.length > 0) {
      nextRecipes = { schema_version: 1, recipes: imported };
      recipesChanged = true;
    }
  }

  return {
    plan: nextPlan,
    recipes: nextRecipes,
    planChanged,
    recipesChanged,
    planMalformed: false,
  };
}

/**
 * Default MCP merge. Upsert one slot (date + meal_type). An entry with no id
 * still matches on date + meal_type. name null or '' removes every entry in
 * that slot. Other dates stay. Unknown fields on the existing slot entry are
 * kept when the incoming entry does not set them.
 */
function mergeMealPlan(existing, incoming, createId) {
  const makeId = typeof createId === 'function' ? createId : defaultMealId;
  let plan = (Array.isArray(existing) ? existing : []).map(cloneEntry).filter(Boolean);

  for (const raw of Array.isArray(incoming) ? incoming : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const date = raw.date;
    const mealType = raw.meal_type;
    if (raw.name === null || raw.name === '') {
      plan = plan.filter((entry) => !(entry.date === date && entry.meal_type === mealType));
      continue;
    }
    if (typeof raw.name !== 'string') continue;

    const fields = definedFields(raw);
    let index = -1;
    if (typeof fields.id === 'string' && fields.id) {
      index = plan.findIndex((entry) => entry.id === fields.id);
    }
    if (index === -1) {
      index = plan.findIndex((entry) => entry.date === date && entry.meal_type === mealType);
    }

    let kept;
    if (index === -1) {
      kept = { ...fields };
      if (!kept.id) kept.id = makeId();
      plan.push(kept);
    } else {
      const prev = plan[index];
      kept = { ...prev, ...fields };
      if (!kept.id) kept.id = prev.id || makeId();
      plan[index] = kept;
    }
    // null clears an optional field (notes, recipe_id) without removing the slot.
    for (const [key, value] of Object.entries(kept)) {
      if (value === null) delete kept[key];
    }

    plan = plan.filter((entry) => {
      if (entry.date === kept.date && entry.meal_type === kept.meal_type) return entry === kept;
      return true;
    });
  }

  return plan;
}

/**
 * Replace meals on `dates`. An empty `meals` list is refused when that week
 * already has entries, so a blank week cannot wipe stored meals.
 */
function replaceWeekMeals(plan, dates, meals) {
  const source = (Array.isArray(plan) ? plan : []).map(cloneEntry).filter(Boolean);
  const dateSet = new Set(Array.isArray(dates) ? dates : []);
  const existing = source.filter((entry) => dateSet.has(entry.date));
  const incoming = Array.isArray(meals) ? meals.map(cloneEntry).filter(Boolean) : [];
  if (incoming.length === 0 && existing.length > 0) {
    return { plan: source, rejected: true };
  }
  const kept = source.filter((entry) => !dateSet.has(entry.date));
  return { plan: [...kept, ...incoming], rejected: false };
}

module.exports = {
  MEAL_TYPES,
  defaultMealId,
  createRecipeId,
  recipeIdFromKey,
  mealTypeFromLabel,
  isRecipeStore,
  isRecipesEmpty,
  migrateMealStores,
  mergeMealPlan,
  replaceWeekMeals,
};
