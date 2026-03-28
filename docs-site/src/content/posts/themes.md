---
title: "Themes"
date: 2026-03-24
description: "All 7 built-in themes with color palettes, auto dark mode, and a developer guide for creating custom themes."
categories: ["docs"]
tags: ["themes", "dark-mode", "customization", "design"]
slug: "themes"
draft: false
---

# Themes

Beacon ships with 7 built-in themes plus an automatic day/night switching mode. Themes are applied via CSS custom properties, making it easy to create your own.

---

## Changing the theme

### From the sidebar

1. Click the **palette icon** at the bottom of the sidebar (below the gear icon)
2. A dropdown appears showing all available themes with color preview dots
3. Click a theme name to apply it immediately
4. The selection is saved to localStorage and persists across reloads

### From the configuration

Set the `theme` option:
- **Add-on**: Configuration tab > `theme: "midnight"`
- **Docker**: Environment variable in the container config
- **Development**: `VITE_THEME=midnight` in `.env`

The theme selector in the sidebar overrides the configuration value (since it saves to localStorage).

---

## All 7 themes

### 1. Skylight (default light theme)

A warm, clean light theme with soft pastels. Designed for well-lit rooms and daytime use.

| Token | Color | Hex |
|-------|-------|-----|
| Background | Warm off-white | `#faf9f6` |
| Surface | White | `#ffffff` |
| Text | Near black | `#1a1a1a` |
| Text secondary | Gray | `#6b7280` |
| Grid lines | Light gray | `#e5e5e5` |
| Accent | Blue | `#3b82f6` |
| Header | White | `#ffffff` |
| Today highlight | Blue tint | `rgba(59, 130, 246, 0.04)` |

**Event colors**: Soft blue, soft green, soft purple, soft orange, soft pink, soft teal

---

### 2. Midnight (default dark theme)

A deep navy dark theme with warm amber accents. The recommended theme for wall-mounted displays, especially in the evening.

| Token | Color | Hex |
|-------|-------|-----|
| Background | Deep navy | `#0f172a` |
| Surface | Dark slate | `#1e293b` |
| Text | Near white | `#f8fafc` |
| Text secondary | Slate gray | `#94a3b8` |
| Grid lines | Dark slate | `#334155` |
| Accent | Amber/Gold | `#f59e0b` |
| Header | Dark slate | `#1e293b` |
| Today highlight | Amber tint | `rgba(245, 158, 11, 0.06)` |

**Event colors**: Bright blue, bright green, bright purple, bright orange, bright pink, bright teal

---

### 3. Nord Ice

Inspired by the [Nord color palette](https://www.nordtheme.com/). A cool-toned light theme with frost and aurora accents.

| Token | Color | Hex |
|-------|-------|-----|
| Background | Snow storm | `#ECEFF4` |
| Surface | Lighter snow | `#E5E9F0` |
| Text | Polar night | `#2E3440` |
| Text secondary | Dark gray | `#4C566A` |
| Grid lines | Frost | `#D8DEE9` |
| Accent | Frost blue | `#5E81AC` |
| Header | Lighter snow | `#E5E9F0` |
| Today highlight | Blue tint | `rgba(94, 129, 172, 0.08)` |

**Event colors**: Frost blue, Aurora green, Aurora purple, Aurora orange, Aurora red, Frost cyan

---

### 4. Dracula

Based on the popular [Dracula theme](https://draculatheme.com/). A purple-accented dark theme with vibrant event colors.

| Token | Color | Hex |
|-------|-------|-----|
| Background | Dark gray | `#282A36` |
| Surface | Medium gray | `#44475A` |
| Text | White | `#F8F8F2` |
| Text secondary | Blue-gray | `#6272A4` |
| Grid lines | Medium gray | `#44475A` |
| Accent | Purple | `#BD93F9` |
| Header | Medium gray | `#44475A` |
| Today highlight | Purple tint | `rgba(189, 147, 249, 0.08)` |

**Event colors**: Cyan, Green, Purple, Orange, Pink, Yellow

---

### 5. Monokai

Inspired by the [Monokai](https://monokai.pro/) color scheme. A warm dark theme with a green accent.

| Token | Color | Hex |
|-------|-------|-----|
| Background | Dark olive | `#272822` |
| Surface | Medium olive | `#3E3D32` |
| Text | White | `#F8F8F2` |
| Text secondary | Olive gray | `#75715E` |
| Grid lines | Medium olive | `#3E3D32` |
| Accent | Green | `#A6E22E` |
| Header | Medium olive | `#3E3D32` |
| Today highlight | Green tint | `rgba(166, 226, 46, 0.06)` |

**Event colors**: Blue, Green, Purple, Orange, Pink/Magenta, Yellow

---

### 6. Rose

A soft, warm light theme with pink and rose tones. Ideal for a feminine or playful aesthetic.

| Token | Color | Hex |
|-------|-------|-----|
| Background | Pale rose | `#fff1f2` |
| Surface | White | `#ffffff` |
| Text | Dark brown | `#4a2c2a` |
| Text secondary | Muted brown | `#9b7a78` |
| Grid lines | Light rose | `#fce7e8` |
| Accent | Rose red | `#e11d48` |
| Header | White | `#ffffff` |
| Today highlight | Rose tint | `rgba(225, 29, 72, 0.05)` |

**Event colors**: Rose, Lavender, Peach, Pink, Sky, Lime

---

### 7. Forest

An earthy, nature-inspired light theme with warm greens and natural tones.

| Token | Color | Hex |
|-------|-------|-----|
| Background | Beige | `#f5f5dc` |
| Surface | Warm white | `#fefdf5` |
| Text | Dark olive | `#3d3929` |
| Text secondary | Muted olive | `#7c7560` |
| Grid lines | Sand | `#e8e4cc` |
| Accent | Forest green | `#5f7c47` |
| Header | Warm white | `#fefdf5` |
| Today highlight | Green tint | `rgba(95, 124, 71, 0.06)` |

**Event colors**: Sage, Olive/gold, Terracotta, Moss, Wheat, Muted teal

---

## Auto dark mode

Select **Auto (time)** in the theme selector to let Beacon switch themes automatically based on time of day.

| Time Range | Theme Used |
|------------|------------|
| 6:00 AM - 6:59 PM | Skylight (light) |
| 7:00 PM - 5:59 AM | Midnight (dark) |

### How it works

1. On load, Beacon checks the current hour
2. If between 6 AM and 7 PM, the Skylight theme is applied
3. Otherwise, the Midnight theme is applied
4. A timer re-evaluates every 60 seconds, so the switch happens automatically at the threshold hours
5. The `data-theme` attribute on `<html>` is set to `light` or `dark` based on the background color luminance

### Customizing the dark theme

The dark theme used by auto mode defaults to Midnight. The auto dark theme ID is stored in localStorage under `beacon-auto-dark-theme`. You can change it by setting that key to any theme ID (e.g., `dracula`, `monokai`).

---

## Creating custom themes (developer guide)

### Theme structure

Each theme is a TypeScript object implementing the `Theme` interface:

```typescript
interface Theme {
  id: string;
  name: string;
  colors: {
    background: string;    // Main background color
    surface: string;       // Card/panel background
    text: string;          // Primary text color
    textSecondary: string; // Secondary/muted text
    gridLines: string;     // Calendar grid lines, borders
    accent: string;        // Primary accent (buttons, highlights)
    headerBg: string;      // Header and sidebar background
    todayHighlight: string; // Today column background tint
    shadow: string;        // Box shadow for cards
  };
  eventColors: string[];   // 6 colors for calendar events
  fonts: {
    display: string;       // Large text (clock, headings)
    body: string;          // Body text
    mono: string;          // Monospace text
  };
}
```

### Step 1: Create the theme file

Create a new file at `src/styles/themes/mytheme.ts`:

```typescript
import type { Theme } from './index';

export const mytheme: Theme = {
  id: 'mytheme',
  name: 'My Theme',
  colors: {
    background: '#1a1a2e',
    surface: '#16213e',
    text: '#eaeaea',
    textSecondary: '#a0a0b0',
    gridLines: '#2a2a4e',
    accent: '#e94560',
    headerBg: '#16213e',
    todayHighlight: 'rgba(233, 69, 96, 0.06)',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
  },
  eventColors: ['#4cc9f0', '#7209b7', '#f72585', '#4361ee', '#4895ef', '#560bad'],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
```

### Step 2: Register the theme

Edit `src/styles/themes/index.ts`:

1. Add the export: `export { mytheme } from './mytheme';`
2. Add the import: `import { mytheme } from './mytheme';`
3. Add it to the `themes` array: `export const themes: Theme[] = [..., mytheme];`

### Step 3: Test

Run `npm run dev` and select your theme from the palette dropdown. Check:

- Text readability from 6 feet away
- Event color contrast against the background
- The theme in both bright and dim lighting conditions

---

## CSS custom properties reference

These CSS custom properties are set on `:root` by the theme system and used throughout all stylesheets:

| Property | Maps To | Description |
|----------|---------|-------------|
| `--bg-primary` | `colors.background` | Main page background |
| `--bg-surface` | `colors.surface` | Card and panel backgrounds |
| `--bg-header` | `colors.headerBg` | Header bar background |
| `--bg-sidebar` | `colors.headerBg` | Sidebar background |
| `--bg-today` | `colors.todayHighlight` | Today column tint |
| `--border` | `colors.gridLines` | Primary border color |
| `--border-subtle` | `colors.gridLines` | Subtle border color |
| `--text-primary` | `colors.text` | Primary text color |
| `--text-secondary` | `colors.textSecondary` | Secondary/muted text |
| `--grid-lines` | `colors.gridLines` | Calendar grid line color |
| `--accent` | `colors.accent` | Accent color for buttons, links |
| `--shadow` | `colors.shadow` | Box shadow for elevated elements |
| `--event-1` through `--event-6` | `eventColors[0-5]` | Calendar event colors |
| `--font-display` | `fonts.display` | Display/heading font family |
| `--font-body` | `fonts.body` | Body text font family |
| `--font-mono` | `fonts.mono` | Monospace font family |

### data-theme attribute

The `data-theme` attribute on `<html>` is automatically set to `light` or `dark` based on the perceived brightness of the background color. This allows CSS to use `[data-theme="dark"]` selectors for theme-specific styles that cannot be expressed through custom properties alone.

---

## Tips for good themes

- **Avoid pure black** (`#000000`) backgrounds. They create harsh contrast and look like holes on OLED displays.
- **Avoid pure white** (`#ffffff`) text on dark backgrounds. Use an off-white like `#f0f0f0` for a softer look.
- **Keep accent usage minimal.** The accent should highlight the current time, active day, and primary actions.
- **Test in dim lighting.** Wall displays are often viewed in dimly lit rooms.
- **Ensure event color contrast.** All 6 event colors must be distinguishable against both the background and the calendar grid.
- **Use the same font stack.** The default fonts (Plus Jakarta Sans, Inter, JetBrains Mono) work well at all sizes. Only change fonts if you have a specific reason.
