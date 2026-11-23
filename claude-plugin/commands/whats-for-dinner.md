---
name: whats-for-dinner
description: Check today's meal plan from Beacon
arguments:
  - name: date
    description: Date to check (YYYY-MM-DD, default today)
    required: false
---

# What's for Dinner

Show today's planned meals from the Beacon meal plan.

## Steps

1. Call `beacon_get_meal_plan` with the date (or today by default)
2. Format the results showing meal type and name
3. If no meals are planned, suggest adding one in the Beacon Meals view or with `beacon_set_meal_plan` (that tool merges by default; pass `replace: true` only when replacing the whole plan)

## Example Output

```
Today's Menu (April 2):
🌙 Dinner: Instant Pot Spaghetti
```
