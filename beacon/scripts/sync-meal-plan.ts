#!/usr/bin/env npx tsx
/**
 * Sync AnyList meal plan data to Beacon's persistent storage.
 *
 * This script is designed to be run locally or via cron. It:
 *   1. Reads meal plan events from a JSON file (exported from AnyList MCP)
 *   2. Reads recipe details from a JSON file (exported from AnyList MCP)
 *   3. Pushes the combined data to the Beacon server's /beacon-data/meal-plan endpoint
 *
 * Usage:
 *   npx tsx scripts/sync-meal-plan.ts --url https://your-beacon-url --events events.json --recipes recipes.json
 *
 * Or with environment variables:
 *   BEACON_URL=https://your-beacon-url npx tsx scripts/sync-meal-plan.ts
 *
 * The script can also generate a meal-plan.json file for manual upload:
 *   npx tsx scripts/sync-meal-plan.ts --dry-run --events events.json --recipes recipes.json
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';

interface MealPlanEvent {
  id: string;
  date: string;
  title: string;
  label?: 'Breakfast' | 'Lunch' | 'Dinner';
  labelColor?: string;
  recipeId?: string;
  details?: string;
}

interface Recipe {
  name: string;
  sourceUrl?: string;
  sourceName?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: string;
  notes?: string;
  ingredients: string[];
  steps: string[];
}

interface MealPlanData {
  events: MealPlanEvent[];
  recipes: Record<string, Recipe>;
  lastSynced: string;
}

const LABEL_COLORS: Record<string, string> = {
  Breakfast: '#00CC52',
  Lunch: '#FF9335',
  Dinner: '#E5352C',
};

/**
 * Parse meal plan text output from AnyList MCP into structured events.
 * Format: "- **YYYY-MM-DD** 📖 Title [Label] — Details (id: xxx)"
 */
function parseMealPlanText(text: string): MealPlanEvent[] {
  const events: MealPlanEvent[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(
      /\*\*(\d{4}-\d{2}-\d{2})\*\*\s+(📖\s+)?(.+?)\s*(?:\[(\w+)\])?\s*(?:—\s*(.+?))?\s*\(id:\s*([a-f0-9]+)\)/
    );
    if (!match) continue;

    const [, date, hasRecipe, title, label, details, id] = match;
    events.push({
      id,
      date,
      title: title.trim(),
      label: label as MealPlanEvent['label'],
      labelColor: label ? LABEL_COLORS[label] : undefined,
      recipeId: hasRecipe ? title.trim() : undefined,
      details: details?.trim(),
    });
  }

  return events;
}

/**
 * Parse recipe text output from AnyList MCP into structured recipe.
 */
function parseRecipeText(text: string): Recipe | null {
  const nameMatch = text.match(/^# (.+)/m);
  if (!nameMatch) return null;

  const sourceMatch = text.match(/^Source: (.+)/m);
  const urlMatch = text.match(/^URL: (.+)/m);
  const prepMatch = text.match(/^Prep: (\d+) min/m);
  const cookMatch = text.match(/^Cook: (\d+) min/m);
  const servingsMatch = text.match(/^Servings: (.+)/m);
  const notesMatch = text.match(/^Notes: (.+)/m);

  const ingredientsSection = text.match(/## Ingredients\n([\s\S]*?)(?=\n## |$)/);
  const stepsSection = text.match(/## Steps\n([\s\S]*?)$/);

  const ingredients = ingredientsSection
    ? ingredientsSection[1].split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim())
    : [];

  const steps = stepsSection
    ? stepsSection[1].split('\n').filter(l => /^\d+\./.test(l)).map(l => l.replace(/^\d+\.\s*/, '').trim())
    : [];

  return {
    name: nameMatch[1].trim(),
    sourceName: sourceMatch?.[1]?.trim(),
    sourceUrl: urlMatch?.[1]?.trim(),
    prepTime: prepMatch ? parseInt(prepMatch[1]) : undefined,
    cookTime: cookMatch ? parseInt(cookMatch[1]) : undefined,
    servings: servingsMatch?.[1]?.trim(),
    notes: notesMatch?.[1]?.trim(),
    ingredients,
    steps,
  };
}

async function pushToBeacon(url: string, data: MealPlanData): Promise<void> {
  const response = await fetch(`${url}/beacon-data/meal-plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to push to Beacon: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  console.log('Push result:', result);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const urlIdx = args.indexOf('--url');
  const eventsIdx = args.indexOf('--events');
  const recipesIdx = args.indexOf('--recipes');

  const beaconUrl = urlIdx !== -1 ? args[urlIdx + 1] : process.env.BEACON_URL;
  const eventsFile = eventsIdx !== -1 ? args[eventsIdx + 1] : 'meal-plan-events.txt';
  const recipesFile = recipesIdx !== -1 ? args[recipesIdx + 1] : 'meal-plan-recipes.json';

  if (!dryRun && !beaconUrl) {
    console.error('Error: --url or BEACON_URL required (unless --dry-run)');
    process.exit(1);
  }

  // Parse events
  let events: MealPlanEvent[] = [];
  if (existsSync(eventsFile)) {
    const text = readFileSync(eventsFile, 'utf8');
    events = parseMealPlanText(text);
    console.log(`Parsed ${events.length} meal plan events`);
  } else {
    console.warn(`Events file not found: ${eventsFile}`);
  }

  // Parse recipes
  const recipes: Record<string, Recipe> = {};
  if (existsSync(recipesFile)) {
    const raw = JSON.parse(readFileSync(recipesFile, 'utf8'));
    if (Array.isArray(raw)) {
      for (const r of raw) {
        if (r.name) recipes[r.name] = r;
      }
    } else if (typeof raw === 'object') {
      Object.assign(recipes, raw);
    }
    console.log(`Loaded ${Object.keys(recipes).length} recipes`);
  } else {
    console.warn(`Recipes file not found: ${recipesFile}`);
  }

  const data: MealPlanData = {
    events,
    recipes,
    lastSynced: new Date().toISOString(),
  };

  if (dryRun) {
    const outFile = 'meal-plan-data.json';
    writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`Wrote ${outFile} (${events.length} events, ${Object.keys(recipes).length} recipes)`);
  } else {
    await pushToBeacon(beaconUrl!, data);
    console.log('Synced to Beacon successfully');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
