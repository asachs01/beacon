---
title: "Timer"
date: 2026-03-26
description: "Beacon's built-in timer and stopwatch — countdown presets, audio alerts, lap tracking, and usage guide."
categories: ["docs"]
tags: ["timer", "stopwatch", "countdown", "tools"]
slug: "timer"
draft: false
---

# Timer

Beacon includes a built-in timer with two modes: countdown and stopwatch. It is accessible from the sidebar and opens as a slide-out panel.

---

## Opening the timer

1. Click the **timer icon** in the bottom section of the sidebar (below the divider)
2. A slide-out panel opens from the right side of the screen
3. Click the **X** button or the backdrop to close it

On mobile, tap **More** in the bottom tab bar, then tap **Timer**.

---

## Timer mode (countdown)

The countdown mode counts down from a preset duration to zero, then plays an audio alert.

### Presets

Five preset durations are available:

| Label | Duration |
|-------|----------|
| 1m | 1 minute |
| 5m | 5 minutes (default) |
| 10m | 10 minutes |
| 15m | 15 minutes |
| 30m | 30 minutes |

Tap a preset button to set the countdown duration. The active preset is highlighted.

### Starting the countdown

1. Select a preset (or use the default 5 minutes)
2. Tap the **Play** button
3. The countdown display updates in real time, showing `MM:SS` format
4. Presets are hidden while the timer is running

### When the countdown finishes

1. The display shows `00:00` with a visual "finished" indicator
2. An **audio alert** plays: three short beeps (880 Hz, A5 note) using the Web Audio API
3. The timer stops automatically
4. The Play button changes to a **Reset** (rotate) icon

### Pausing and resuming

- Tap **Pause** to stop the countdown without resetting
- Tap **Play** to resume from where you left off

### Resetting

Tap the **Reset** button (rotate icon) to clear the timer and return to the preset selection screen.

---

## Stopwatch mode

The stopwatch counts up from zero with no limit.

### Switching to stopwatch mode

Tap the **Stopwatch** tab at the top of the timer panel. The mode switcher shows two buttons: "Timer" and "Stopwatch".

Switching modes resets the current timer.

### Using the stopwatch

1. Tap **Play** to start
2. The display counts up in `MM:SS` format (or `H:MM:SS` for durations over an hour)
3. Tap **Pause** to stop
4. Tap **Play** again to resume

### Lap tracking

While the stopwatch is running, a **Flag** button appears next to the Pause button:

1. Tap the **Flag** button to record a lap
2. Each lap appears in a list below the display with:
   - Lap number (Lap 1, Lap 2, ...)
   - Elapsed time at the moment the lap was recorded
3. Laps are shown in chronological order

Laps are cleared when the stopwatch is reset.

---

## Audio alerts

The countdown timer plays an audio alert when it finishes. The alert is generated using the Web Audio API (no external sound files needed):

- **Frequency**: 880 Hz (A5 note)
- **Pattern**: Three short beeps (150ms on, 100ms off, repeated 3 times)
- **Volume**: 30% gain (not too loud)
- **Duration**: Approximately 0.7 seconds total

The audio plays through the device's default audio output. If the Web Audio API is not available (e.g., some restricted browser environments), the alert is silently skipped.

> **Tip**: Make sure the tablet/display's volume is turned up enough to hear the beeps from across the room.

---

## Display format

| Duration | Format | Example |
|----------|--------|---------|
| Under 1 hour | `MM:SS` | `05:00`, `00:45` |
| 1 hour or more | `H:MM:SS` | `1:05:00`, `2:30:15` |

The display uses the `performance.now()` API for accurate timing, updating via `requestAnimationFrame` for smooth visual updates without drift.

---

## Troubleshooting

### No sound when countdown finishes

1. The device volume may be muted or too low — check the tablet's hardware volume buttons
2. Some browsers require a user interaction before audio can play. If the timer was started programmatically or on page load, the audio context may be blocked. Tap the screen before starting the timer.
3. Web Audio API may not be available in very old browsers

### Timer seems inaccurate

The timer uses `performance.now()` for high-resolution timing. If the display appears to skip or lag:
1. The device may be under heavy load — close other apps/tabs
2. The `requestAnimationFrame` updates at the display's refresh rate (usually 60fps), so the visual display updates every ~16ms

### Switching modes resets the timer

This is by design. Switching between countdown and stopwatch modes clears the current time, laps, and finished state.
