---
title: "Themes"
date: 2026-03-24
description: "Explore Beacon's built-in dark and light themes, automatic switching, and how to create your own custom theme."
categories: ["docs"]
tags: ["themes", "dark-mode", "customization", "design"]
slug: "themes"
draft: false
---

# Themes

Beacon ships with two built-in themes optimized for wall-mounted displays. You can also create your own.

---

## Dark mode (default)

The dark theme is Beacon's default and recommended choice. It uses a deep navy background (`#0f172a`) with warm white text (`#f8fafc`) and Beacon Gold (`#f59e0b`) accents.

**Why dark mode is the default:**

- Wall-mounted displays are part of your living space. A bright white screen glowing in the corner of a room is distracting, especially in the evening.
- Dark backgrounds reduce power consumption on OLED and AMOLED displays.
- The dark palette provides a calmer, more ambient feel — like a soft nightlight, not a computer monitor.

### Dark mode palette

| Role | Color |
|------|-------|
| Background | `#0f172a` Deep Navy |
| Surface (cards) | `#1e293b` |
| Borders | `#475569` |
| Primary text | `#f8fafc` Warm White |
| Secondary text | `#94a3b8` |
| Accent | `#f59e0b` Beacon Gold |
| Interactive | `#3b82f6` Soft Blue |

---

## Light mode

The light theme inverts the palette for daytime readability. It uses a warm white background with deep navy text. The same Beacon Gold accent carries through for consistency.

Light mode is ideal for:
- Displays in bright, sunny rooms
- Kitchen displays where ambient light washes out dark interfaces
- Users who simply prefer a lighter aesthetic

### Light mode palette

| Role | Color |
|------|-------|
| Background | `#f8fafc` Warm White |
| Surface (cards) | `#ffffff` |
| Borders | `#e2e8f0` |
| Primary text | `#0f172a` Deep Navy |
| Secondary text | `#475569` |
| Accent | `#f59e0b` Beacon Gold |
| Interactive | `#3b82f6` Soft Blue |

---

## Auto theme switching

Set `theme: auto` in your configuration to let Beacon switch themes based on time of day:

| Time | Theme |
|------|-------|
| 7:00 AM - 7:00 PM | Light mode |
| 7:00 PM - 7:00 AM | Dark mode |

The transition happens smoothly with a 200ms fade. The schedule is fixed for now — future versions may tie this to sunrise/sunset data from your weather entity.

```yaml
theme: auto
```

---

## Creating a custom theme

You can override any of Beacon's color tokens through the `custom_colors` configuration. Here's a step-by-step guide to creating a cohesive custom theme.

### Step 1: Choose your base colors

Pick a background, a text color, and an accent. Good themes have strong contrast between background and text, with an accent that stands out without being overwhelming.

```yaml
custom_colors:
  background: "#1a1a2e"
  surface: "#16213e"
  text: "#eaeaea"
  text_secondary: "#a0a0b0"
  accent: "#e94560"
```

### Step 2: Test readability

Load your theme and check it from the distance you'll actually view the display. Text should be clearly readable from 6 feet (1.8 meters) away. If not, increase the contrast between background and text colors.

### Step 3: Check calendar colors

Make sure the family member calendar colors are still distinguishable against your custom background. The built-in palette (ocean, sage, lavender, coral, rose, teal) was chosen to work on both dark and light backgrounds, but very saturated custom backgrounds might cause issues.

### Tips for good themes

- **Avoid pure black** (`#000000`) backgrounds. They create harsh contrast and make OLED displays look like "holes" in the wall.
- **Avoid pure white** (`#ffffff`) text on dark backgrounds. Use an off-white like `#f0f0f0` or `#f8fafc` for a softer look.
- **Keep accent usage minimal.** The accent color should highlight the current time, active day, and primary actions — not fill large areas.
- **Test in dim lighting.** Your wall display will often be viewed in a dimly lit room. Colors that look great on a bright desk monitor may wash out or glare on a wall display.

---

## Next steps

- [Configuration reference](/docs/configuration/) — all settings and options
- [FAQ](/docs/faq/) — common questions
