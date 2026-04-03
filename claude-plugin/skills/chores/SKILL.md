---
description: >
  Use this skill when creating, managing, or querying family chores in Beacon.
  Covers chore creation with assignments, frequencies, payouts, completion
  tracking, streaks, and the leaderboard.
triggers:
  - beacon chore
  - create chore
  - family chore
  - chore assignment
  - allowance
  - chore payout
  - leaderboard
---

# Beacon Chores

## Overview

Chores are tasks assigned to family members with optional dollar payouts. Members earn streaks for consecutive days of completion, and earnings are tracked on a leaderboard.

## Creating a Chore

Use `beacon_create_chore` with:
- `name` (required) — e.g., "Make bed", "Feed the dog"
- `assigned_to` — array of member names (case-insensitive fuzzy match)
- `frequency` — `daily` (default), `weekly`, or `once`
- `value_cents` — payout in cents (e.g., 100 = $1.00)
- `icon` — emoji (default: 🧹)

### Example

```
Create a chore:
  name: "Walk the dog"
  assigned_to: ["Lennon", "Elliott"]
  frequency: daily
  value_cents: 100
  icon: 🐕
```

## Completing a Chore

Use `beacon_manage_chore` with `action: "complete"`, `chore_name`, and `member_name`.

Completions are timestamped. Each member completes independently — one person completing doesn't affect others.

## Chore Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-generated unique ID |
| `name` | string | Display name |
| `assigned_to` | string[] | Member IDs |
| `frequency` | string | daily, weekly, or once |
| `value_cents` | number | Payout value in cents |
| `icon` | string | Emoji icon |

## Querying

- `beacon_list_chores` — Returns all chores with `assigned_to_names` and `completed_today_by` arrays
- Always call `beacon_list_family_members` first if you need to resolve member names

## Tips

- Member names are case-insensitive — "lennon", "Lennon", "LENNON" all work
- Deleting a chore also removes all its completion history
- The `value_cents` field is in cents, not dollars (50 = $0.50, 100 = $1.00)
