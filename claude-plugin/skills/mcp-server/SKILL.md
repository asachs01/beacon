---
description: >
  Use this skill when connecting to or configuring the Beacon MCP server,
  troubleshooting connection issues, or understanding what tools are available.
  Covers setup, authentication, environment variables, and all 17 tools.
triggers:
  - beacon mcp
  - beacon server
  - beacon tools
  - beacon setup
  - connect beacon
---

# Beacon MCP Server

## Overview

The Beacon MCP server exposes 17 tools for controlling a family dashboard that runs as a Home Assistant add-on. It communicates with HA via REST API and manages local JSON data files for chores, family members, and meal plans.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPERVISOR_TOKEN` | Yes | — | HA long-lived access token |
| `HA_URL` | No | `http://supervisor/core` | HA instance URL |
| `DATA_DIR` | No | `/data` | Directory for chore/member/meal JSON files |

## All 17 Tools

### Lists
- `beacon_add_list_item` — Add item to a todo list (fuzzy name matching)
- `beacon_get_list_items` — Get all items from a list
- `beacon_check_item` — Mark item completed
- `beacon_uncheck_item` — Mark item as needs_action

### Calendar
- `beacon_get_calendar` — Get events for today + N days
- `beacon_create_event` — Create a calendar event

### Media
- `beacon_get_media_players` — List all players and states
- `beacon_media_control` — Play, pause, next, previous, volume

### Weather
- `beacon_get_weather` — Current weather conditions

### Chores
- `beacon_manage_chore` — Complete/uncomplete a chore for a member
- `beacon_create_chore` — Create a new chore with assignments
- `beacon_update_chore` — Update chore by name or ID
- `beacon_delete_chore` — Delete chore and its completions
- `beacon_list_chores` — List all chores with today's status

### Family
- `beacon_list_family_members` — List all members

### Meal Plans
- `beacon_get_meal_plan` — Get meal plan entries for a date range
- `beacon_set_meal_plan` — Write meal plan data

## Data Files

Stored in `DATA_DIR` as JSON arrays:
- `beacon_chores.json` — Chore definitions
- `beacon_family_members.json` — Family member profiles
- `beacon_completions.json` — Chore completion records
- `beacon_meal_plans.json` — Meal plan entries

## Troubleshooting

- **"Cannot connect"**: Verify `HA_URL` is reachable and `SUPERVISOR_TOKEN` is valid
- **"Entity not found"**: Check HA Developer Tools > States for correct entity IDs
- **Empty chore/member lists**: Data files may not exist yet — create a chore or member via the Beacon UI first
