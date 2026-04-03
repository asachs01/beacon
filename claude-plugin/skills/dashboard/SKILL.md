---
description: >
  Use this skill when helping users configure or understand the Beacon dashboard
  layout, widgets, and display settings.
triggers:
  - beacon dashboard
  - dashboard layout
  - beacon display
  - family view
  - beacon widget
---

# Beacon Dashboard

## Layout Presets

Three configurable layouts in Settings > General > Dashboard Layout:

### Family (default)
- **Top bar**: Time (accent color), date, weather widget
- **Main area**: Per-family-member columns — each member's avatar, name, and today's events
- **Sidebar** (300px right): Today's meals, tasks/chores

Best for: Wall-mounted family command center with multiple family members.

### Classic
- **Left**: Large clock, date, greeting, weather, countdown
- **Center**: Today's events (flat list)
- **Right**: Tasks/chores checklist

Best for: Simple single-user setups or when no calendars are assigned to members.

### Compact
- Single column, vertically scrollable
- All sections stacked: top bar → calendar → sidebar content

Best for: Mobile devices or narrow screens.

## Per-Member Calendar Columns

The Family layout shows one column per family member. Requirements:
1. Family members must be added in Settings > Family Members
2. Each member needs a `calendar_entity` assigned (Settings > Family Members > Edit > Calendar dropdown)
3. The dropdown shows all calendars discovered from Home Assistant

If no members have calendars assigned, the dashboard falls back to a flat event list.

## Weather Widget

Clickable — opens the full Weather view. Shows current temp, condition icon, and label. Requires `weather_entity` in configuration.

## Responsive Behavior

- Desktop (>768px): Two-column grid (main + sidebar)
- Mobile (<768px): Single column, sections stacked vertically
