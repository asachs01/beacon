'use strict';

/**
 * File-backed meal migration for the MCP server and the add-on data API.
 * The browser hook uses the pure helpers and beacon-store instead.
 */

const fs = require('fs');
const path = require('path');
const {
  migrateMealStores,
  mergeMealPlan,
} = require('./meal-plan-migrate.cjs');

const PLAN_FILE = 'beacon_meal_plans.json';
const PLAN_BAK = 'beacon_meal_plans.bak.json';
const LEGACY_FILE = 'meal-plan.json';
const RECIPES_FILE = 'beacon_recipes.json';

function readJson(dataDir, filename) {
  const fp = path.join(dataDir, filename);
  try {
    const text = fs.readFileSync(fp, 'utf8');
    try {
      return { missing: false, malformed: false, value: JSON.parse(text), text };
    } catch {
      return { missing: false, malformed: true, value: undefined, text };
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { missing: true, malformed: false, value: undefined, text: null };
    }
    return { missing: false, malformed: true, value: undefined, text: null };
  }
}

/** Copy beacon_meal_plans.json to beacon_meal_plans.bak.json once. */
function backupMealPlanFile(dataDir) {
  const src = path.join(dataDir, PLAN_FILE);
  const bak = path.join(dataDir, PLAN_BAK);
  if (!fs.existsSync(src) || fs.existsSync(bak)) return false;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(src, bak);
  return true;
}

function writeJson(dataDir, filename, value) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, filename), `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Migrate on load. A malformed (non-array or unparseable) plan file is not
 * rewritten. The legacy meal-plan.json file is never deleted.
 */
function applyMealMigration(dataDir) {
  const planFile = readJson(dataDir, PLAN_FILE);
  const legacyFile = readJson(dataDir, LEGACY_FILE);
  const recipesFile = readJson(dataDir, RECIPES_FILE);

  let planInput = [];
  if (!planFile.missing) {
    // Unparseable JSON is not an array. Pass a non-array so it stays untouched.
    planInput = planFile.malformed
      ? (planFile.value === undefined ? { malformed: true } : planFile.value)
      : planFile.value;
  }

  const legacy = legacyFile.missing || legacyFile.malformed ? null : legacyFile.value;
  const recipes = recipesFile.missing
    ? null
    : recipesFile.malformed
      ? { locked: true }
      : recipesFile.value;

  const result = migrateMealStores({ plan: planInput, legacy, recipes });

  if (!result.planMalformed && result.planChanged) {
    backupMealPlanFile(dataDir);
    writeJson(dataDir, PLAN_FILE, result.plan);
  }
  if (result.recipesChanged) {
    writeJson(dataDir, RECIPES_FILE, result.recipes);
  }
  return result;
}

/** Write the plan array. Backs up the previous file the first time. */
function writeMealPlan(dataDir, entries) {
  backupMealPlanFile(dataDir);
  writeJson(dataDir, PLAN_FILE, entries);
}

module.exports = {
  PLAN_FILE,
  PLAN_BAK,
  LEGACY_FILE,
  RECIPES_FILE,
  readJson,
  backupMealPlanFile,
  applyMealMigration,
  writeMealPlan,
  mergeMealPlan,
};
