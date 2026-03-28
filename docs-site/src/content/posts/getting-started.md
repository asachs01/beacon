---
title: "Getting Started"
date: 2026-03-26
description: "Install Beacon as a Home Assistant add-on and connect your family's calendar in under 10 minutes."
categories: ["docs"]
tags: ["installation", "setup", "home-assistant"]
slug: "getting-started"
draft: false
---

# Getting Started

Beacon runs as a Home Assistant add-on. This guide walks you through installation, calendar setup, and getting the dashboard on your wall-mounted display.

---

## Prerequisites

Before you begin, make sure you have:

- **Home Assistant** with **Supervisor** (Home Assistant OS or Supervised install)
- A **Google account** with Google Calendar (or any CalDAV/ICS calendar)
- A **display device** — any tablet, old monitor + mini PC, or Fire tablet works great
- A web browser on the display device

> **Tip**: The cheapest setup is a refurbished Amazon Fire tablet ($30-50) mounted with a magnetic wall mount. Beacon looks great on 8" and 10" screens.

---

## Step 1: Add the repository

Open your Home Assistant instance and navigate to **Settings > Add-ons > Add-on Store**.

Click the three-dot menu in the top right and select **Repositories**. Add the following URL:

```
https://github.com/asachs01/beacon
```

Click **Add**, then close the dialog. The Beacon add-on should now appear in the store.

---

## Step 2: Install the add-on

Find **Beacon** in the add-on store and click **Install**. This will pull the container image and set up the add-on.

Once installed, you'll see the add-on's info page. Before starting it:

1. Go to the **Configuration** tab
2. Set your preferred theme (`dark` or `light`)
3. Optionally set your Home Assistant weather entity (e.g., `weather.home`)

Click **Save**.

---

## Step 3: Connect Google Calendar

Beacon uses the Google Calendar integration built into Home Assistant. If you haven't set it up yet:

1. Go to **Settings > Devices & Services**
2. Click **Add Integration** and search for **Google Calendar**
3. Follow the OAuth flow to authorize your Google account
4. Home Assistant will create calendar entities for each of your calendars

Once connected, Beacon will automatically discover your calendar entities.

> **Using CalDAV or ICS?** Beacon also works with the Home Assistant CalDAV integration. Set it up the same way through Devices & Services.

---

## Step 4: Start Beacon

Go back to the Beacon add-on page and click **Start**.

Open the web UI by clicking **Open Web UI** or navigating to:

```
http://homeassistant.local:8099
```

You should see the Beacon dashboard with your calendar events, the current time, and weather (if configured).

---

## Step 5: Set up your display

On your wall-mounted tablet or display:

1. Open a browser and navigate to your Beacon URL
2. Enable **fullscreen mode** (usually F11 or a browser setting)
3. If using a tablet, consider a kiosk browser app like **Fully Kiosk Browser** (Android) for auto-start and screen management

### Recommended display settings

- **Screen timeout**: Disabled (always on)
- **Brightness**: Auto or set to 40-60% for comfortable ambient viewing
- **Orientation**: Landscape

---

## Next steps

- [Configuration reference](/docs/configuration/) — customize colors, weather, and family members
- [Themes](/docs/themes/) — explore dark mode, light mode, and custom themes
- [FAQ](/docs/faq/) — answers to common questions
