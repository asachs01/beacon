---
title: "FAQ"
date: 2026-03-23
description: "Answers to 20+ common questions about Beacon — calendar support, hardware, privacy, features, and troubleshooting."
categories: ["docs"]
tags: ["faq", "questions", "help"]
slug: "faq"
draft: false
---

# Frequently Asked Questions

---

## General

### Does this work with Google Calendar?

**Yes.** Beacon reads calendar data through Home Assistant's Google Calendar integration. Set up the integration once in HA, and Beacon automatically discovers your calendars. See the [Getting Started guide](/docs/getting-started/) for step-by-step instructions.

Beacon also works with **any calendar source** Home Assistant supports, including CalDAV (Nextcloud, iCloud, Fastmail), ICS feeds, and the built-in Local Calendar.

### Can I create and edit events from the display?

**Yes.** Beacon supports full CRUD operations on calendar events. Tap the + button or a time slot to create events. Tap an existing event to edit or delete it. You can even drag events to reschedule them. See [Calendar](/docs/calendar/).

### Does Beacon send my data anywhere?

**No.** Beacon runs entirely on your local network. It communicates only with your Home Assistant instance — never with any external server. There is no telemetry, analytics, or cloud dependency.

Data flow: `Google/CalDAV -> Home Assistant -> Beacon (local only)`

### Is there a subscription?

**No.** Beacon is free and open-source under the MIT license. No subscriptions, no premium tiers, no free trial.

### Can I use this without Home Assistant?

Not currently. Beacon relies on Home Assistant for calendar data, weather, media players, and grocery integrations. If you do not have Home Assistant, [HA OS](https://www.home-assistant.io/installation/) is free and runs on a Raspberry Pi, old PC, or virtual machine.

---

## Hardware

### What hardware do I need?

1. **A Home Assistant instance** (HA OS on a Pi, NUC, or VM)
2. **A display device** with a web browser (any tablet, old monitor + mini PC, etc.)

The cheapest complete setup is a $35 Fire HD 8 with a $15 magnetic mount — under $50.

See [Deployment](/docs/deployment/) for detailed hardware recommendations with prices.

### Does it work on a phone?

**Yes, but it is not ideal.** Beacon has a mobile-responsive layout with a bottom tab bar. It works on phones, but the experience is designed for landscape tablets and wall-mounted displays. On phones, the calendar week view is cramped and some features are behind the "More" menu.

### Does it work in portrait mode?

Beacon is designed for **landscape displays** (16:9 or 16:10). In portrait mode, the layout works but some views (especially the week calendar) are not optimized for the narrower width.

### What screen size works best?

8" to 15" is the sweet spot. The UI is readable from across a room on a 10" display. Larger displays (15-24") work great with a Raspberry Pi or mini PC.

---

## Features

### Can I show photos like Skylight?

**Yes.** Beacon has a built-in photo frame with slideshow, crossfade transitions, clock/date overlay, and music controls on top. Add photos to your HA media directory and configure the photo directory. See [Photos](/docs/photos/).

### Does it have a dark mode?

**Yes.** Beacon ships with 7 themes, including 4 dark themes: Midnight, Dracula, Monokai, and (partially dark) Nord. There is also an "Auto" mode that switches between Skylight (light) and Midnight (dark) based on time of day. See [Themes](/docs/themes/).

### Can multiple family members use it?

**Yes.** Add up to 8 family members with custom avatars, colors, and roles. Each member's chores and streaks are tracked independently. The leaderboard shows earnings per member. See [Family Members](/docs/family/).

### Can kids earn money for doing chores?

**Yes.** Each chore can have a dollar value (e.g., $1.00). When a family member completes a chore, the value is tracked. The Leaderboard shows total earnings by week or month. See [Chores](/docs/chores/).

### Can I control music from the display?

**Yes.** Beacon controls any media player entity in Home Assistant — Sonos, Google Home, Music Assistant, Chromecast, etc. You get play/pause, skip, volume, album art, and a progress bar. A "Now Playing" bar appears on all views when music is active. See [Music](/docs/music/).

### Can I set timers?

**Yes.** Beacon has a built-in timer with countdown (1, 5, 10, 15, 30 minute presets) and stopwatch modes. The countdown plays an audio alert when finished. See [Timer](/docs/timer/).

### Does it have a grocery list?

**Yes.** Beacon integrates with Grocy and AnyList through Home Assistant. You can view your shopping list, add items, check them off, and see expiring product alerts. See [Grocery](/docs/grocery/).

### Does it send notifications?

**Yes.** Beacon sends browser push notifications and HA mobile app notifications 15 minutes before calendar events. See [Notifications](/docs/notifications/).

### Does it prevent screen burn-in?

**Yes.** After 5 minutes of inactivity, the screen dims. After 10 minutes, a clock screensaver appears that repositions every 30 seconds to prevent burn-in. See [Screen Saver](/docs/screensaver/).

---

## Setup and Configuration

### How do I change the theme?

Click the palette icon at the bottom of the sidebar. A dropdown shows all 7 themes plus Auto mode. Click to apply immediately. See [Themes](/docs/themes/).

### How do I change the family name?

Set the `family_name` option in the add-on configuration, or the `VITE_FAMILY_NAME` environment variable in development. See [Configuration](/docs/configuration/).

### How do I change the weather entity?

Set the `weather_entity` option to your HA weather entity ID (e.g., `weather.home`). Find your entity ID in **Settings > Devices & Services > Entities**. See [Configuration](/docs/configuration/).

### How do I connect multiple calendars?

Add multiple calendar integrations in Home Assistant (Google Calendar, CalDAV, Local Calendar, etc.). Beacon discovers all `calendar.*` entities automatically. Use the filter pills above the calendar to show/hide specific calendars.

### How do I set up family members?

Click the gear icon in the sidebar to open the Family Members modal. Click "+ Add Member" and fill in the name, avatar, color, role, and optional PIN. See [Family Members](/docs/family/).

---

## Updates and Maintenance

### How do I update Beacon?

**Add-on**: Go to **Settings > Add-ons > Beacon** and click **Update** if available.

**Docker**: Pull the latest image and recreate the container:
```bash
docker pull ghcr.io/asachs01/beacon:latest
docker stop beacon && docker rm beacon
docker run -d --name beacon ... ghcr.io/asachs01/beacon:latest
```

### Is my data preserved across updates?

**Add-on**: Yes. Configuration and add-on data are preserved.

**Browser data**: Family members, chores, and theme preferences are stored in the browser's localStorage and persist across updates. Clearing browser data will remove this information.

### Can I back up my data?

The browser localStorage data is not easily backed up. For critical family and chore data, consider exporting the localStorage keys:
- `beacon_family_members`
- `beacon_chores`
- `beacon_completions`
- `beacon_streaks`

You can view and copy these values in the browser's Developer Tools (F12 > Application > Local Storage).

---

## Troubleshooting

### Beacon shows "Demo Mode"

This means Beacon cannot connect to Home Assistant. Check:
1. The HA token is configured (add-on: automatic; Docker: `SUPERVISOR_TOKEN` env var; dev: `VITE_HA_TOKEN`)
2. The HA URL is reachable from the browser
3. Home Assistant is running

### Calendar is empty

1. Verify calendar integrations are configured in HA
2. Check that `calendar.*` entities exist in **Developer Tools > States**
3. Wait up to 5 minutes for the initial data fetch, or reload the page

### Everything is slow on my old tablet

1. Use a dark theme (fewer bright pixels = less power on OLED/AMOLED)
2. Close other apps and browser tabs
3. Consider using a simpler browser like Chrome instead of a full-featured one
4. Increase the photo interval and screen saver timeout to reduce UI updates

### Something else is broken

1. Check the browser console (F12) for error messages
2. Check the add-on logs (**Settings > Add-ons > Beacon > Log**)
3. Open a [GitHub issue](https://github.com/asachs01/beacon/issues) with your HA version, browser, device, and relevant logs

---

## More questions?

- [Getting Started](/docs/getting-started/) — installation walkthrough
- [Configuration](/docs/configuration/) — all settings explained
- [Contributing](/docs/contributing/) — help make Beacon better
- [API Reference](/docs/api-reference/) — technical API details
