---
description: >
  Use this skill when working with meal plans in Beacon — viewing today's menu,
  syncing from AnyList, or managing meal plan data via MCP tools.
triggers:
  - beacon meal
  - meal plan
  - what's for dinner
  - menu today
  - anylist meal
  - sync meals
---

# Beacon Meal Plans

## Overview

Beacon displays today's meals (Breakfast, Lunch, Dinner) on the dashboard sidebar. Meal plan data is stored in `beacon_meal_plans.json` and can be populated from AnyList or manually.

## Viewing Meals

Use `beacon_get_meal_plan` with optional:
- `date` — YYYY-MM-DD (default: today)
- `days` — number of days to include (default: 1)

## Writing Meal Data

Use `beacon_set_meal_plan` with `entries` array:

```json
[
  { "date": "2026-04-02", "meal_type": "Dinner", "name": "Instant Pot Spaghetti" },
  { "date": "2026-04-03", "meal_type": "Dinner", "name": "Easy Crockpot Carnitas" }
]
```

### MealPlanEntry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string | Yes | YYYY-MM-DD |
| `meal_type` | string | Yes | Breakfast, Lunch, Dinner, or Snack |
| `name` | string | Yes | Meal name |
| `recipe_id` | string | No | AnyList recipe ID (if linked) |

## Syncing from AnyList

A sync script at `scripts/sync-meals.mjs` parses AnyList MCP output:

```bash
# Run the AnyList MCP meal_plan list_events tool, save output
# Then parse it into Beacon format:
node scripts/sync-meals.mjs anylist-output.txt --from 2026-04-01 --to 2026-04-15
```

The script auto-detects meal types from `[Breakfast]`/`[Lunch]`/`[Dinner]` brackets and defaults to Dinner.

## Dashboard Display

Meals appear in the dashboard sidebar with icons:
- 🌅 Breakfast
- ☀️ Lunch
- 🌙 Dinner
- 🍎 Snack
