import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mergeMealPlan,
  migrateMealStores,
  replaceWeekMeals,
} from './meal-plan-migrate.cjs';
import { applyMealMigration, PLAN_BAK, PLAN_FILE, LEGACY_FILE, RECIPES_FILE } from '../../lib/meal-plan-files.cjs';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../hooks/fixtures/meals',
);

function fixture(name: string) {
  return JSON.parse(readFileSync(path.join(fixtureDir, name), 'utf8'));
}

function idsInOrder() {
  let n = 0;
  return () => `bm_test_${++n}`;
}

describe('meal plan migrator', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir() {
    const dir = mkdtempSync(path.join(tmpdir(), 'beacon-meals-'));
    dirs.push(dir);
    return dir;
  }

  it('fills missing ids, keeps recipe_id and unknown fields, and is a no-op the second time', () => {
    const plan = fixture('v1-plan-no-ids.json');
    const once = migrateMealStores({ plan, legacy: null, recipes: null, createId: idsInOrder() });

    expect(once.planMalformed).toBe(false);
    expect(once.planChanged).toBe(true);
    expect(once.plan.map((entry) => entry.date)).toEqual(['2026-11-20', '2026-11-21']);
    expect(once.plan[0]).toMatchObject({
      id: 'bm_test_1',
      date: '2026-11-20',
      meal_type: 'Dinner',
      name: 'Tacos',
      recipe_id: 'r_tacos',
      notes: 'extra salsa',
      source: 'anylist',
    });

    const twice = migrateMealStores({
      plan: once.plan,
      legacy: null,
      recipes: once.recipes,
      createId: () => { throw new Error('ids should already exist'); },
    });
    expect(twice.planChanged).toBe(false);
    expect(twice.recipesChanged).toBe(false);
    expect(twice.plan).toEqual(once.plan);
  });

  it('leaves an already-migrated plan and a non-empty recipe store alone', () => {
    const stored = fixture('already-migrated.json');
    const once = migrateMealStores({
      plan: stored.plan,
      legacy: stored.legacy,
      recipes: stored.recipes,
      createId: () => { throw new Error('should not mint ids'); },
    });
    expect(once.planChanged).toBe(false);
    expect(once.recipesChanged).toBe(false);
    expect(once.plan).toEqual(stored.plan);
    expect(once.recipes).toEqual({
      schema_version: 1,
      recipes: [{ id: 'br_keep', name: 'Keep', ingredients: ['salt'] }],
    });

    const twice = migrateMealStores({ plan: once.plan, legacy: stored.legacy, recipes: stored.recipes });
    expect(twice.plan).toEqual(once.plan);
    expect(twice.planChanged).toBe(false);
  });

  it('imports the unused meal-plan document once and skips duplicates', () => {
    const legacy = fixture('unused-meal-plan.json');
    const intoEmpty = migrateMealStores({
      plan: fixture('empty.json'),
      legacy,
      recipes: null,
      createId: idsInOrder(),
    });

    expect(intoEmpty.plan.map((entry) => ({
      date: entry.date,
      meal_type: entry.meal_type,
      name: entry.name,
      recipe_id: entry.recipe_id,
    }))).toEqual([
      { date: '2026-03-24', meal_type: 'Dinner', name: 'Leftover stew', recipe_id: undefined },
      { date: '2026-03-25', meal_type: 'Lunch', name: 'Pasta', recipe_id: 'Pasta bake' },
      { date: '2026-03-26', meal_type: 'Dinner', name: 'Picnic sandwiches', recipe_id: undefined },
    ]);
    expect(intoEmpty.recipesChanged).toBe(true);
    expect(intoEmpty.recipes.recipes).toEqual([
      { id: 'br_pasta_bake', name: 'Pasta bake', ingredients: ['pasta', 'tomato sauce', 'cheese'] },
    ]);

    const again = migrateMealStores({
      plan: intoEmpty.plan,
      legacy,
      recipes: intoEmpty.recipes,
      createId: () => { throw new Error('second import should not mint ids'); },
    });
    expect(again.planChanged).toBe(false);
    expect(again.recipesChanged).toBe(false);
    expect(again.plan).toHaveLength(intoEmpty.plan.length);

    const seeded = migrateMealStores({
      plan: [{ date: '2026-03-24', meal_type: 'Dinner', name: 'Leftover stew', id: 'bm_keep', source: 'manual' }],
      legacy,
      recipes: { schema_version: 1, recipes: [{ id: 'br_keep', name: 'Keep', ingredients: [] }] },
      createId: idsInOrder(),
    });
    expect(seeded.plan.filter((entry) => entry.name === 'Leftover stew')).toHaveLength(1);
    expect(seeded.plan[0]).toMatchObject({ id: 'bm_keep', source: 'manual' });
    expect(seeded.plan.map((entry) => entry.name)).toEqual(['Leftover stew', 'Pasta', 'Picnic sandwiches']);
    expect(seeded.recipesChanged).toBe(false);
    expect(seeded.recipes.recipes.map((recipe) => recipe.id)).toEqual(['br_keep']);
  });

  it('shows a malformed plan as empty and does not describe it as changed', () => {
    const malformed = fixture('malformed-object.json');
    const result = migrateMealStores({ plan: malformed, legacy: fixture('unused-meal-plan.json'), recipes: null });
    expect(result.planMalformed).toBe(true);
    expect(result.planChanged).toBe(false);
    expect(result.plan).toEqual([]);
    expect(result.recipesChanged).toBe(false);
  });

  it('backs up the original file once, imports the seed file once, and leaves the source in place', () => {
    const dir = tempDir();
    const seedPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../beacon/scripts/seed-meal-plan.json',
    );
    const seedText = readFileSync(seedPath, 'utf8');
    const seed = JSON.parse(seedText);
    const original = `${JSON.stringify(fixture('v1-plan-no-ids.json'))}\n`;
    writeFileSync(path.join(dir, PLAN_FILE), original);
    writeFileSync(path.join(dir, LEGACY_FILE), seedText);

    const first = applyMealMigration(dir);
    expect(first.planChanged).toBe(true);
    expect(readFileSync(path.join(dir, PLAN_BAK), 'utf8')).toBe(original);
    expect(readFileSync(path.join(dir, LEGACY_FILE), 'utf8')).toBe(seedText);

    const names = first.plan.map((entry) => `${entry.date}|${entry.meal_type}|${entry.name}`);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('2026-11-20|Dinner|Tacos');
    expect(first.plan.filter((entry) => entry.name === 'Instant Pot Spaghetti')).toHaveLength(1);
    expect(first.plan.find((entry) => entry.name === 'Instant Pot Spaghetti')).toMatchObject({
      date: '2026-04-02',
      meal_type: 'Dinner',
      recipe_id: 'Instant Pot Spaghetti',
    });
    expect(first.plan).toHaveLength(fixture('v1-plan-no-ids.json').length + seed.events.length);
    expect(first.recipes.recipes).toHaveLength(Object.keys(seed.recipes).length);
    expect(first.recipes.recipes.every((recipe) => String(recipe.id).startsWith('br_'))).toBe(true);

    const planText = readFileSync(path.join(dir, PLAN_FILE), 'utf8');
    const recipeText = readFileSync(path.join(dir, RECIPES_FILE), 'utf8');
    const second = applyMealMigration(dir);
    expect(second.planChanged).toBe(false);
    expect(second.recipesChanged).toBe(false);
    expect(readFileSync(path.join(dir, PLAN_FILE), 'utf8')).toBe(planText);
    expect(readFileSync(path.join(dir, RECIPES_FILE), 'utf8')).toBe(recipeText);
    expect(readFileSync(path.join(dir, PLAN_BAK), 'utf8')).toBe(original);
    expect(readFileSync(path.join(dir, LEGACY_FILE), 'utf8')).toBe(seedText);
    expect(second.plan).toHaveLength(first.plan.length);
  });

  it('does not overwrite a malformed meal plan file', () => {
    const dir = tempDir();
    const original = '{ "not": "an array" }\n';
    writeFileSync(path.join(dir, PLAN_FILE), original);
    writeFileSync(path.join(dir, LEGACY_FILE), JSON.stringify(fixture('unused-meal-plan.json')));

    const result = applyMealMigration(dir);
    expect(result.planMalformed).toBe(true);
    expect(result.plan).toEqual([]);
    expect(readFileSync(path.join(dir, PLAN_FILE), 'utf8')).toBe(original);
    expect(readFileSync(path.join(dir, LEGACY_FILE), 'utf8')).toContain('Leftover stew');
  });

  it('does not rewrite stored YYYY-MM-DD keys while the UTC date is already tomorrow', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/Phoenix';
    try {
      const result = migrateMealStores({
        plan: fixture('v1-plan.json'),
        legacy: null,
        recipes: null,
      });
      expect(result.planChanged).toBe(false);
      expect(result.plan.map((entry) => entry.date)).toEqual(['2026-11-20', '2026-11-21']);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it('merges by date and meal_type, clears a slot, and refuses an empty week', () => {
    const plan = [
      { id: 'bm_tacos', date: '2026-11-20', meal_type: 'Dinner', name: 'Tacos', source: 'anylist' },
      { id: 'bm_chili', date: '2026-11-20', meal_type: 'Dinner', name: 'Chili' },
      { id: 'bm_oats', date: '2026-11-21', meal_type: 'Breakfast', name: 'Oatmeal' },
    ];

    const updated = mergeMealPlan(plan, [{ date: '2026-11-20', meal_type: 'Dinner', name: 'Enchiladas' }]);
    expect(updated.filter((entry) => entry.meal_type === 'Dinner')).toEqual([
      expect.objectContaining({ id: 'bm_tacos', name: 'Enchiladas', source: 'anylist', date: '2026-11-20' }),
    ]);
    expect(updated.find((entry) => entry.id === 'bm_oats')).toMatchObject({ name: 'Oatmeal', date: '2026-11-21' });

    const cleared = mergeMealPlan(plan, [{ date: '2026-11-20', meal_type: 'Dinner', name: '' }]);
    const clearedNull = mergeMealPlan(plan, [{ date: '2026-11-20', meal_type: 'Dinner', name: null }]);
    expect(cleared).toEqual(clearedNull);
    expect(cleared).toEqual([
      expect.objectContaining({ id: 'bm_oats', date: '2026-11-21', name: 'Oatmeal' }),
    ]);

    const refused = replaceWeekMeals(plan, ['2026-11-20', '2026-11-21'], []);
    expect(refused.rejected).toBe(true);
    expect(refused.plan).toHaveLength(3);

    const added = replaceWeekMeals(plan, ['2026-11-22'], [
      { id: 'bm_apple', date: '2026-11-22', meal_type: 'Snack', name: 'Apple' },
    ]);
    expect(added.rejected).toBe(false);
    expect(added.plan.map((entry) => entry.name)).toEqual(['Tacos', 'Chili', 'Oatmeal', 'Apple']);
  });
});
