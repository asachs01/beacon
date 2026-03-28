---
title: "Configuration"
date: 2026-03-25
description: "Full reference for Beacon's add-on options, calendar setup, family members, and color customization."
categories: ["docs"]
tags: ["configuration", "settings", "customization"]
slug: "configuration"
draft: false
---

# Configuration Reference

Beacon is configured through the Home Assistant add-on options panel. All settings are accessible from **Settings > Add-ons > Beacon > Configuration**.

---

## Add-on options

These are the top-level options available in the add-on configuration:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `theme` | string | `dark` | Display theme: `dark`, `light`, or `auto` |
| `weather_entity` | string | `""` | Home Assistant weather entity ID (e.g., `weather.home`) |
| `temperature_unit` | string | `F` | Temperature display: `F` or `C` |
| `time_format` | string | `12h` | Clock format: `12h` or `24h` |
| `family_name` | string | `""` | Your family name, used in greetings (e.g., "Good morning, Sachs family") |
| `show_greeting` | boolean | `true` | Show time-of-day greeting on the left panel |
| `show_weather` | boolean | `true` | Show weather card on the right panel |
| `show_date` | boolean | `true` | Show full date below the clock |

### Example configuration

```yaml
theme: auto
weather_entity: weather.home
temperature_unit: F
time_format: 12h
family_name: Sachs
show_greeting: true
show_weather: true
show_date: true
```

---

## Google Calendar setup

Beacon reads calendar data from Home Assistant's calendar entities. To connect Google Calendar:

### 1. Create Google Cloud credentials

If you haven't already configured the Google Calendar integration in Home Assistant:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Calendar API**
4. Create **OAuth 2.0 credentials** (Desktop application type)
5. Download the credentials JSON file

### 2. Add the integration

1. In Home Assistant, go to **Settings > Devices & Services**
2. Click **Add Integration** and search for **Google Calendar**
3. Upload your credentials file when prompted
4. Complete the OAuth authorization flow

### 3. Select calendars

After authorization, Home Assistant creates entities for each calendar. Beacon will display events from all calendar entities by default. To filter specific calendars, use the family member configuration below.

---

## Family member setup

Each family member can be assigned a name, a color, and one or more calendar entities. This lets you color-code events on the display so everyone can quickly spot their own schedule.

```yaml
family_members:
  - name: Mom
    color: ocean
    calendars:
      - calendar.mom_gmail_com
  - name: Dad
    color: sage
    calendars:
      - calendar.dad_gmail_com
  - name: Kids
    color: lavender
    calendars:
      - calendar.family_shared
```

### Available colors

| Name | Color | Hex |
|------|-------|-----|
| ocean | Blue | `#3b82f6` |
| sage | Green | `#10b981` |
| lavender | Purple | `#8b5cf6` |
| coral | Orange | `#f97316` |
| rose | Pink | `#ec4899` |
| teal | Teal | `#14b8a6` |

Colors appear as a 4px left border on event cards and as dots next to family member names.

---

## Customizing colors

If the built-in Beacon palette doesn't match your home's aesthetic, you can override the primary colors:

```yaml
custom_colors:
  accent: "#f59e0b"
  background: "#0f172a"
  surface: "#1e293b"
  text: "#f8fafc"
  text_secondary: "#94a3b8"
```

These map directly to the CSS custom properties used throughout the UI. Changes take effect on the next page load.

---

## Weather entity

Beacon supports any Home Assistant weather entity. Common integrations:

- **Met.no** (built-in, no API key needed)
- **OpenWeatherMap**
- **AccuWeather**
- **National Weather Service** (US only)

Set the entity ID in the add-on configuration:

```yaml
weather_entity: weather.home
```

Beacon displays:
- Current temperature
- Current conditions (sunny, cloudy, rain, etc.)
- Today's high and low
- Short forecast summary

---

## Next steps

- [Themes](/docs/themes/) — switch between dark, light, and custom themes
- [FAQ](/docs/faq/) — common questions and answers
