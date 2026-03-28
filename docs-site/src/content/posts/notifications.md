---
title: "Notifications"
date: 2026-03-26
description: "How Beacon sends event notifications — browser push notifications, HA mobile app notifications, timing, and permissions."
categories: ["docs"]
tags: ["notifications", "alerts", "push", "reminders"]
slug: "notifications"
draft: false
---

# Notifications

Beacon sends notifications before upcoming calendar events through two channels: browser push notifications and Home Assistant mobile app notifications.

---

## How notifications work

Every 60 seconds, Beacon scans your calendar events and checks if any event is starting within the next 15 minutes. When it finds one:

1. A **browser notification** is sent (if permission is granted)
2. A **Home Assistant mobile app notification** is sent (if the client is connected)

Each event is only notified once — Beacon tracks which event IDs have already triggered notifications to avoid duplicates.

---

## Browser notifications

### Permission request flow

The first time Beacon loads, it checks the browser's notification permission:

1. If permission is `default` (not yet decided), Beacon automatically calls `Notification.requestPermission()`
2. The browser shows a permission prompt: "Beacon wants to send you notifications. Allow / Block"
3. If you click **Allow**, browser notifications are enabled
4. If you click **Block**, browser notifications are disabled (you can change this later in browser settings)

### What the notification looks like

| Field | Value |
|-------|-------|
| **Title** | The event title (e.g., "Soccer Practice") |
| **Body** | "Starts in 12 minutes" or "Starting now" |
| **Icon** | Beacon's icon (`/beacon-icon.svg`) |
| **Tag** | `beacon-event-{eventId}` (prevents duplicate notifications for the same event) |

### Notification timing

| Time Before Event | Body Text |
|-------------------|-----------|
| 2-15 minutes | "Starts in X minutes" |
| 0-1 minute | "Starting now" |

The check runs every 60 seconds, so the actual notification may arrive anywhere within the 15-minute window, typically within 1 minute of the 15-minute mark.

### All-day events

All-day events are excluded from notifications. Only timed events trigger notifications.

---

## Home Assistant mobile app notifications

In addition to browser notifications, Beacon sends a notification through Home Assistant's `notify.notify` service. This fans out to all configured notification targets, including:

- **Home Assistant Companion App** (iOS/Android)
- **HTML5 Push Notifications** (if configured)
- Any other notification platform you have set up in HA

### Notification format

| Field | Value |
|-------|-------|
| **Title** | `Beacon: {event title}` |
| **Message** | "Starts in X minutes" or "Starting now" |

### Requirements

- Beacon must be connected to Home Assistant (the WebSocket connection must be active)
- The `notify.notify` service must be available in HA
- At least one notification target must be configured (e.g., the HA Companion App)

### If the service is not available

If `notify.notify` fails (e.g., no notification targets configured), the error is silently caught. Browser notifications still work independently.

---

## Setting up mobile push notifications

### Step 1: Install the Home Assistant Companion App

Download the app for your phone:
- **iOS**: [App Store](https://apps.apple.com/app/home-assistant/id1099568401)
- **Android**: [Google Play](https://play.google.com/store/apps/details?id=io.homeassistant.companion.android)

### Step 2: Sign in

Open the app and connect it to your Home Assistant instance. The app will register a `notify.mobile_app_*` service automatically.

### Step 3: Verify the service

In Home Assistant, go to **Developer Tools > Services** and search for `notify.notify`. You should see it listed. Call it with a test message to verify it reaches your phone.

### Step 4: No Beacon configuration needed

Beacon automatically uses `notify.notify` when it detects an upcoming event. No additional setup is required in Beacon.

---

## Duplicate prevention

Beacon uses an in-memory set to track which event IDs have already been notified:

- When a notification is sent for an event, its ID is added to the set
- Subsequent checks skip events that are already in the set
- When an event passes (its start time is in the past) and is no longer in the active events list, its ID is pruned from the set

This means:
- You will never get two notifications for the same event
- If you reload the page, the set resets, and you may get a notification again for an event that was already notified before the reload

---

## Troubleshooting

### No browser notifications appear

1. **Check permission**: Open your browser's site settings for the Beacon URL and verify notifications are set to "Allow"
2. **Check the browser**: Some browsers (especially on mobile) do not support the `Notification` API. Chrome, Firefox, and Edge on desktop support it. Safari on macOS supports it. Safari on iOS has limited support.
3. **Check Do Not Disturb**: If your device or browser is in Do Not Disturb mode, notifications may be suppressed
4. **Check focus mode**: Some operating systems hide notifications when a specific app is focused

### Browser asks for permission every time

This typically happens when:
- The page is served over HTTP (not HTTPS). Notification permissions are only persisted for HTTPS origins and `localhost`.
- The browser is in incognito/private mode, where permissions are not saved.

### Mobile notifications do not arrive

1. Verify the HA Companion App is installed and connected
2. Verify `notify.notify` works: go to **Developer Tools > Services**, call `notify.notify` with `title: "Test"` and `message: "Hello"`, and check your phone
3. Check that the HA Companion App has notification permissions on your phone (iOS: Settings > Notifications > Home Assistant; Android: Settings > Apps > Home Assistant > Notifications)

### Notifications arrive too early or too late

Beacon checks for upcoming events every 60 seconds and notifies when an event is within 15 minutes of starting. The worst-case delay is ~60 seconds (one check interval). If notifications seem inconsistent, verify that:
1. The browser tab/window is active (background tabs may throttle timers)
2. The event's start time is correct in the calendar
