---
title: "FAQ"
date: 2026-03-23
description: "Answers to common questions about Beacon — calendar support, hardware, privacy, and more."
categories: ["docs"]
tags: ["faq", "questions", "help"]
slug: "faq"
draft: false
---

# Frequently Asked Questions

---

## Does this work with Google Calendar?

**Yes.** Beacon reads calendar data through Home Assistant's Google Calendar integration. Set up the integration once in Home Assistant, and Beacon will automatically display your events. See the [Getting Started guide](/docs/getting-started/) for step-by-step instructions.

Beacon also works with **any calendar source** that Home Assistant supports, including CalDAV (Nextcloud, iCloud, Fastmail) and ICS feeds.

---

## What hardware do I need?

At minimum, you need:

1. **A Home Assistant instance** with Supervisor (Home Assistant OS is the easiest)
2. **A display device** with a web browser

For the display, almost anything works:

| Device | Price | Notes |
|--------|-------|-------|
| Amazon Fire tablet (refurbished) | $30-50 | Great value. Use Fully Kiosk Browser for kiosk mode. |
| Old iPad or Android tablet | Free (if you have one) | Any tablet from the last 5 years works fine. |
| Raspberry Pi + monitor | $80-120 | Pi 4 or 5 with any HDMI monitor. Good for larger displays. |
| Old laptop screen + mini PC | $50-100 | Repurpose hardware you already have. |
| Dedicated wall display | $200+ | Companies like Elecrow and Waveshare sell purpose-built wall displays. |

> **The cheapest path**: A $35 Fire HD 8 tablet with a $15 magnetic wall mount. Under $50 total and it looks great.

---

## Is there a subscription?

**No.** Beacon is free and open-source software under the MIT license. There are no subscriptions, no premium tiers, no "free trial" periods, and no features hidden behind a paywall.

You pay only for whatever hardware you choose to run it on.

---

## Can multiple family members use it?

**Yes.** Beacon supports multiple family members, each with their own color-coded calendar. Events from different calendars appear on the same timeline with colored left borders so everyone can quickly spot their own schedule.

Set up family members in the [Configuration](/docs/configuration/):

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
```

---

## Does Beacon send my data anywhere?

**No.** Beacon runs entirely on your local network. It communicates only with your Home Assistant instance — never with any external server. There is no telemetry, no analytics, and no cloud dependency.

Your calendar data flows like this:

```
Google/CalDAV → Home Assistant → Beacon (local only)
```

---

## Can I use this without Home Assistant?

Not currently. Beacon is built as a Home Assistant add-on and relies on Home Assistant for calendar data, weather, and other integrations. A standalone version is something we'd like to explore in the future.

If you don't have Home Assistant yet, [Home Assistant OS](https://www.home-assistant.io/installation/) is free and runs on a Raspberry Pi, an old PC, or a virtual machine.

---

## Does it work in portrait mode?

Beacon is designed for **landscape displays** (16:9 or 16:10 aspect ratio), which is the most common orientation for wall-mounted screens. In portrait mode, Beacon collapses to a single-column scrolling layout that is functional but not the intended experience.

---

## Can I show photos like Skylight?

A photo frame / slideshow feature is on the roadmap. For now, the right panel focuses on weather and upcoming tasks. Photo support will allow you to display a rotating gallery from a local folder or a shared album.

---

## How do I update Beacon?

Updates are delivered through the Home Assistant add-on system. When a new version is available:

1. Go to **Settings > Add-ons > Beacon**
2. Click **Update** if an update is available
3. Beacon will restart with the new version

Your configuration is preserved across updates.

---

## Something isn't working. How do I get help?

1. Check the add-on logs: **Settings > Add-ons > Beacon > Log**
2. Look for known issues on [GitHub Issues](https://github.com/asachs01/beacon/issues)
3. Open a new issue if your problem isn't listed — include your Home Assistant version, Beacon version, and any relevant log output

---

## More questions?

- [Getting Started](/docs/getting-started/) — installation walkthrough
- [Configuration](/docs/configuration/) — all settings explained
- [Contributing](/docs/contributing/) — help make Beacon better
