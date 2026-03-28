---
title: "Calendar"
date: 2026-03-26
description: "Complete guide to Beacon's week calendar view — creating, editing, deleting, and rescheduling events, recurring events, multi-day events, and filtering."
categories: ["docs"]
tags: ["calendar", "events", "scheduling", "google-calendar"]
slug: "calendar"
draft: false
---

# Calendar

The calendar is Beacon's core feature. It displays a full week view with support for timed events, all-day events, multi-day events, recurring events, drag-to-reschedule, and per-calendar filtering.

---

## Week view overview

The calendar view shows 7 days starting from Sunday of the current week. The layout consists of:

- **Column headers**: Day name (Sun, Mon, ...) and date number, with today highlighted
- **All-day section**: Appears at the top when there are all-day or multi-day events
- **Time grid**: Hours from 7 AM to 9 PM, with each hour row 72 pixels tall
- **Current time indicator**: A colored horizontal line on today's column showing the current time
- **Auto-scroll**: On load, the grid scrolls to show the current hour near the top

Events are color-coded by calendar. Each calendar is assigned a color from the palette (blue, green, purple, orange, pink, teal) based on the order it was discovered.

---

## Creating events

There are three ways to create a new event:

### Method 1: Tap the + button

1. Click the **+** floating action button (FAB) in the bottom-right corner of the calendar view
2. The "New Event" modal opens
3. Fill in the form fields (see below)
4. Click **Create**

### Method 2: Tap a time slot

1. Click on any hour cell in the calendar grid
2. The "New Event" modal opens with the date and time pre-filled to the cell you clicked
3. Fill in the remaining fields
4. Click **Create**

### Event form fields

| Field | Description | Default |
|-------|-------------|---------|
| **Title** | The event name (required) | Empty |
| **Calendar** | Which calendar to create the event on | First available calendar |
| **All day** | Toggle for all-day events | Off |
| **Start date** | Event start date | Today (or clicked date) |
| **Start time** | Event start time (hidden if all-day) | 9:00 AM (or clicked hour) |
| **End date** | Event end date | Same as start date |
| **End time** | Event end time (hidden if all-day) | 1 hour after start time |
| **Repeats** | Recurrence frequency | Does not repeat |
| **Repeat until** | End date for recurring events (shown only if repeating) | 3 months from today |
| **Description** | Optional text description | Empty |

---

## Editing events

1. Click on any event block in the calendar
2. The "Event Details" modal opens with the event's current data pre-filled
3. Modify any fields you want to change
4. Click **Save**

> **Note**: Editing modifies the event on the underlying calendar (e.g., your Google Calendar). Changes sync back to any other devices connected to that calendar.

---

## Deleting events

1. Click on the event you want to delete
2. In the Event Details modal, click the **Delete** button (red, bottom-left of the modal)
3. The event is removed immediately

There is no confirmation dialog — deletion is immediate. If you delete an event by mistake, you will need to recreate it or restore it from your calendar provider (e.g., Google Calendar's trash).

---

## Recurring events

Beacon supports creating recurring events with three frequencies:

| Frequency | Behavior |
|-----------|----------|
| **Daily** | Repeats every day until the end date |
| **Weekly** | Repeats on the same day of the week until the end date |
| **Monthly** | Repeats on the same day of the month until the end date |

### How to create a recurring event

1. Open the New Event modal
2. Fill in the title, calendar, and times as usual
3. In the **Repeats** dropdown, select Daily, Weekly, or Monthly
4. A new **Repeat until** date picker appears — set the end date for the recurrence
5. Click **Create**

### How recurrence rules (rrules) work

Under the hood, Beacon generates an iCalendar RRULE string and passes it to Home Assistant's `calendar.create_event` service. For example:

- Daily until Dec 31, 2026: `FREQ=DAILY;UNTIL=20261231T235959Z`
- Weekly until Mar 15, 2027: `FREQ=WEEKLY;UNTIL=20270315T235959Z`
- Monthly until Jun 30, 2026: `FREQ=MONTHLY;UNTIL=20260630T235959Z`

The calendar provider (Google Calendar, CalDAV, etc.) handles expanding the recurrence into individual event instances.

---

## Drag-to-reschedule

You can move events to a different day and time by dragging them.

### How to drag an event

1. Click and hold on a timed event in the calendar grid (events show a subtle cursor change to indicate they are draggable)
2. Drag the event to the desired day column and hour row
3. A ghost preview appears in the target cell showing the event title
4. Release to drop the event

### What happens when you drop

- The event's start time changes to the new day and hour
- The event's duration stays the same (the end time shifts by the same offset)
- The change is sent to Home Assistant's `calendar.update_event` service
- The calendar view refreshes to show the updated event

### Limitations

- All-day events: When an all-day event is dragged, only the date changes (no time component)
- Multi-day events: Multi-day spanning bars in the all-day section are not currently draggable
- The drop target snaps to whole hours (you cannot drag to a 30-minute mark)

---

## Multi-day events

Events that span more than one day are displayed as colored bars in the all-day section at the top of the calendar.

- Multi-day bars are positioned absolutely across the day columns they span
- If multiple multi-day events overlap, they are placed in separate "lanes" (rows) to avoid overlapping visually
- Events are sorted by start date first, then by duration (longer events placed first) for cleaner visual layout
- Multi-day events that extend beyond the visible week are clamped to the visible portion

---

## All-day events

Single-day all-day events appear in the all-day row below any multi-day spanning bars. They are displayed as compact blocks within their respective day column.

### Creating an all-day event

1. Open the New Event modal
2. Toggle **All day** to ON
3. The time fields disappear — only the date fields remain
4. Fill in the start and end dates
5. Click **Create**

For a single all-day event, set the start and end date to the same day. For a multi-day all-day event, set different start and end dates.

---

## Family member color coding

Each calendar discovered by Beacon is assigned a color from the palette:

| Position | Color | Hex |
|----------|-------|-----|
| 1st calendar | Blue | `#3b82f6` |
| 2nd calendar | Green | `#22c55e` |
| 3rd calendar | Purple | `#a855f7` |
| 4th calendar | Orange | `#f97316` |
| 5th calendar | Pink | `#ec4899` |
| 6th calendar | Teal | `#14b8a6` |

Colors cycle if you have more than 6 calendars.

Event blocks use a **pastel** version of the calendar color as the background and the **full** color as a left-side stripe, making events easy to distinguish at a glance.

---

## Filtering by calendar

Above the week view, filter pills are displayed for each calendar. Each pill shows a colored dot and the calendar name.

- **Click a pill** to hide that calendar's events from the view
- **Click again** to show them
- Hidden calendars show a gray dot instead of their assigned color
- The filter state is local to the current session (it resets on page reload)

This is useful when you have many calendars and want to focus on a specific family member's schedule.

---

## Calendar sync details

### Google Calendar

Events are fetched through Home Assistant's Google Calendar integration using the WebSocket API. Beacon calls `calendars/list` to discover calendars and `calendars/list_events` to fetch events for each calendar within the current week's date range.

- Events refresh automatically every 5 minutes
- Creating, editing, or deleting an event triggers an immediate refresh
- Changes made in Google Calendar appear in Beacon within 5 minutes (or sooner if you reload)

### Local Calendar

Home Assistant's Local Calendar integration stores events on the HA server itself. This is a good option if you do not want any cloud calendar service.

- Events are created using `calendar.create_event`
- Events are stored in a `.ics` file on the HA server
- There is no external sync — the Local Calendar is the single source of truth

### CalDAV (Nextcloud, iCloud, Fastmail)

Set up the CalDAV integration in Home Assistant and Beacon will discover those calendars automatically. The same 5-minute refresh cycle applies.

---

## Troubleshooting calendar issues

### No calendars appear

1. Make sure you have at least one calendar integration configured in Home Assistant (**Settings > Devices & Services**)
2. Verify the calendar entities exist: go to **Developer Tools > States** and search for `calendar.`
3. Check that Beacon is connected (the "Connecting..." badge should not be visible)
4. Check the browser console for errors (press F12)

### Events are missing or stale

1. Events are fetched for the current week only (Sunday to Saturday)
2. The auto-refresh interval is 5 minutes — wait or reload the page
3. Check that the calendar entity has events in Home Assistant: go to **Developer Tools > Services**, call `calendar.list_events` on the entity with a date range, and verify events are returned

### "Failed to save event" error

1. Check the browser console for the specific error message
2. The most common cause is that the calendar does not support creating events (some read-only ICS feeds do not)
3. Make sure the calendar integration in Home Assistant supports the `create_event` service

### Events show wrong times

1. Verify your Home Assistant timezone is set correctly: **Settings > System > General > Time Zone**
2. Check that your browser's timezone matches your HA timezone
3. All-day events have no time component — if a timed event appears as all-day, the calendar source may be sending date-only start/end values
