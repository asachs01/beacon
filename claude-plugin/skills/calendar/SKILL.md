---
description: >
  Use this skill when working with Beacon calendar events — viewing schedules,
  creating events, or understanding how calendars map to family members.
triggers:
  - beacon calendar
  - beacon schedule
  - beacon event
  - create event beacon
  - family schedule
  - what's on today
---

# Beacon Calendar

## Overview

Beacon reads calendars from Home Assistant (Google Calendar, CalDAV, local calendars). Each family member can be linked to their own calendar for per-person schedule views.

## Viewing Events

Use `beacon_get_calendar` with optional `days_ahead` (default: 0 = today only).

Returns events with: `summary`, `start`, `end`, `calendar`, `all_day`, `description`.

## Creating Events

Use `beacon_create_event` with:
- `calendar` — calendar name or entity_id (e.g., "Aaron" or "calendar.aaron_sachs")
- `summary` — event title
- `start` / `end` — ISO 8601 datetime or YYYY-MM-DD for all-day
- `all_day` — boolean (optional)

### Examples

Timed event:
```
calendar: "calendar.aaron_sachs"
summary: "Doctor appointment"
start: "2026-04-05T14:00:00"
end: "2026-04-05T15:00:00"
```

All-day event:
```
calendar: "calendar.family"
summary: "Spring Break"
start: "2026-04-07"
end: "2026-04-11"
all_day: true
```

## Calendar-to-Person Mapping

Family members have an optional `calendar_entity` field that links to their HA calendar. This enables per-member columns on the dashboard. Assign via Beacon Settings > Family Members > Edit > Calendar dropdown.

Common entity patterns:
- Google Calendar: `calendar.aaron_sachs`, `calendar.ashley_sachs`
- Local Calendar: `calendar.lennon`, `calendar.elliott`
- CalDAV: `calendar.caldav_work`
