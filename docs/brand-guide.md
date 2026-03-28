# Beacon Brand Guide

> **Your family's daily signal.**

---

## 1. Brand Identity

### Name

**Beacon**

### Tagline

*"Your family's daily signal"*

### Positioning

Beacon is an open-source, self-hosted family dashboard designed for wall-mounted displays in smart homes. It replaces expensive commercial products like Skylight ($650+) with a free, privacy-respecting alternative that runs on commodity hardware. Beacon integrates with Home Assistant and standard calendar protocols (CalDAV/ICS) to give families a single glanceable view of their day.

### Personality

Beacon's personality is built around four pillars:

| Trait | What it means | What it does NOT mean |
|-------|--------------|----------------------|
| **Warm** | Feels like home, not like software | Cutesy, childish, or saccharine |
| **Reliable** | Always on, always accurate | Rigid, corporate, or cold |
| **Modern** | Clean design, current aesthetics | Trendy, flashy, or overwrought |
| **Approachable** | Anyone in the family can use it | Dumbed-down or patronizing |

Think of Beacon like a lighthouse for your family's day: steadily present, casting a warm glow, guiding everyone through the routine without demanding attention.

---

## 2. Logo Concepts

### Design Principles

The Beacon logo must:

- Work at sizes from 16px favicons to 512px app icons
- Render cleanly in monochrome (single color on transparent)
- Be SVG-native with no raster dependencies
- Convey warmth, light, and guidance without complexity

### Icon Description

The icon is a **minimal geometric beacon/lighthouse silhouette** viewed from the front. The shape consists of:

1. **Base**: A short, wide trapezoid representing the lighthouse foundation. Slightly wider at the bottom than the top. Rounded corners at the bottom edges (2px radius at icon scale).
2. **Tower**: A tall, narrow trapezoid tapering upward from the base. Clean straight edges. The tower is roughly 3x taller than the base.
3. **Lantern room**: A small rectangle at the top of the tower, slightly wider than the tower's top edge, creating a subtle overhang.
4. **Glow element**: Three concentric arc segments radiating outward from the lantern room to the upper-left and upper-right (like a Wi-Fi signal icon rotated 90 degrees, but with only the top half). The arcs use Beacon Gold (#f59e0b) while the tower structure uses the primary foreground color. The arcs decrease in opacity: innermost at 100%, middle at 60%, outermost at 30%.

The overall proportions fit within a square bounding box. The tower is centered horizontally. Negative space is generous -- the icon should breathe.

### Variation A: Icon Only

The standalone beacon icon as described above. Used for favicons, app icons, and contexts where the name appears separately (tab bars, system trays, Home Assistant sidebar).

- Minimum size: 16x16px
- Preferred clear space: 25% of icon width on all sides
- The glow arcs may be omitted below 24px for clarity

### Variation B: Icon + Wordmark (Horizontal)

The beacon icon to the left, the word "Beacon" to the right, vertically centered. The wordmark uses Plus Jakarta Sans at SemiBold (600) weight. Letter-spacing: -0.02em for a slightly tight, modern feel.

- Icon height equals the cap-height of the wordmark
- Gap between icon and wordmark: 0.75x the icon width
- Used for: headers, documentation, Open Graph images, README badges

### Variation C: Wordmark Only

The word "Beacon" in Plus Jakarta Sans SemiBold (600), letter-spacing -0.02em. The dot of the letter "a" is optionally replaced with a small filled circle in Beacon Gold to echo the glow motif. This substitution is subtle and optional -- skip it if it harms legibility at the target size.

- Used for: in-app header when the icon is already present elsewhere, marketing text
- Minimum size: 14px font size

---

## 3. Color Palette

### Primary Colors

| Name | HEX | RGB | HSL | Usage |
|------|-----|-----|-----|-------|
| Deep Navy | `#0f172a` | rgb(15, 23, 42) | hsl(222, 47%, 11%) | Dark mode backgrounds, primary dark surface |
| Warm White | `#f8fafc` | rgb(248, 250, 252) | hsl(210, 40%, 98%) | Primary text on dark, light mode background |
| Beacon Gold | `#f59e0b` | rgb(245, 158, 11) | hsl(38, 92%, 50%) | Accent color, the "glow", active states, highlights |
| Soft Blue | `#3b82f6` | rgb(59, 130, 246) | hsl(217, 91%, 60%) | Interactive elements, links, buttons |

### Calendar / Family Member Colors

Each family member is assigned a color for their calendar events. The palette is chosen for sufficient contrast against both dark and light backgrounds, and for distinguishability by people with common color vision deficiencies.

| Name | HEX | RGB | HSL |
|------|-----|-----|-----|
| Ocean | `#3b82f6` | rgb(59, 130, 246) | hsl(217, 91%, 60%) |
| Sage | `#10b981` | rgb(16, 185, 129) | hsl(160, 84%, 39%) |
| Lavender | `#8b5cf6` | rgb(139, 92, 246) | hsl(263, 90%, 66%) |
| Coral | `#f97316` | rgb(249, 115, 22) | hsl(25, 95%, 53%) |
| Rose | `#ec4899` | rgb(236, 72, 153) | hsl(330, 81%, 60%) |
| Teal | `#14b8a6` | rgb(20, 184, 166) | hsl(174, 80%, 40%) |

Assignment order: Ocean is the default first-member color. Additional members receive colors in the order listed. If more than six members are needed, cycle back with reduced opacity (80%).

### Semantic Colors

| Name | HEX | RGB | HSL | Usage |
|------|-----|-----|-----|-------|
| Success | `#22c55e` | rgb(34, 197, 94) | hsl(142, 71%, 45%) | Confirmation, completed states |
| Warning | `#f59e0b` | rgb(245, 158, 11) | hsl(38, 92%, 50%) | Caution states (shares value with Beacon Gold) |
| Error | `#ef4444` | rgb(239, 68, 68) | hsl(0, 84%, 60%) | Errors, destructive actions |
| Info | `#06b6d4` | rgb(6, 182, 212) | hsl(189, 94%, 43%) | Informational callouts, tips |

### Dark Mode Palette (Default / Nighttime)

| Role | HEX | Token Name |
|------|-----|------------|
| Background | `#0f172a` | `--color-bg` |
| Surface | `#1e293b` | `--color-surface` |
| Surface Raised | `#334155` | `--color-surface-raised` |
| Border | `#475569` | `--color-border` |
| Text Primary | `#f8fafc` | `--color-text` |
| Text Secondary | `#94a3b8` | `--color-text-secondary` |
| Text Muted | `#64748b` | `--color-text-muted` |
| Accent | `#f59e0b` | `--color-accent` |

### Light Mode Palette (Daytime)

| Role | HEX | Token Name |
|------|-----|------------|
| Background | `#f8fafc` | `--color-bg` |
| Surface | `#ffffff` | `--color-surface` |
| Surface Raised | `#f1f5f9` | `--color-surface-raised` |
| Border | `#e2e8f0` | `--color-border` |
| Text Primary | `#0f172a` | `--color-text` |
| Text Secondary | `#475569` | `--color-text-secondary` |
| Text Muted | `#94a3b8` | `--color-text-muted` |
| Accent | `#f59e0b` | `--color-accent` |

### Color Usage Rules

1. **Beacon Gold is the hero.** Use it sparingly for maximum impact: the current time, the active day indicator, primary action buttons, and the logo glow. Never use it for large filled areas.
2. **Dark mode is the default.** Wall-mounted displays in living spaces look best with dark backgrounds, especially in the evening. Light mode activates automatically during daytime hours.
3. **Calendar colors appear as left-border accents** on event cards (4px wide) and as small dots next to member names. They should never fill entire cards.
4. **Text on dark backgrounds** uses Warm White (#f8fafc) for primary content and #94a3b8 for secondary/supporting text. Never use pure white (#ffffff) on Dark Navy -- it creates excessive contrast.

---

## 4. Typography

### Font Stack

| Role | Font Family | Weight | Fallback Stack |
|------|------------|--------|----------------|
| Display | Plus Jakarta Sans | 700 (Bold), 600 (SemiBold) | system-ui, -apple-system, sans-serif |
| Body | Inter | 400 (Regular), 500 (Medium), 600 (SemiBold) | system-ui, -apple-system, sans-serif |
| Mono | JetBrains Mono | 400 (Regular), 500 (Medium) | "SF Mono", "Fira Code", monospace |

### Why These Fonts

- **Plus Jakarta Sans**: A geometric sans-serif with warmth. Its rounded terminals and open apertures give headings a friendly, modern feel without sacrificing professionalism. It avoids the sterility of purely geometric typefaces like Futura.
- **Inter**: Designed specifically for screens. Excellent readability at small sizes, which matters for event details viewed from across a room. The slightly tall x-height aids legibility on low-DPI displays.
- **JetBrains Mono**: Used exclusively for time displays and numerical data. Its tabular (fixed-width) figures prevent layout shifts when the clock updates. The subtle ligatures and clear digit differentiation (especially 0 vs O, 1 vs l) make it ideal for at-a-glance time reading.

### Sizing Scale (Wall Display Optimized)

These sizes are calibrated for readability at approximately 6 feet (1.8 meters) from a 15-27 inch wall-mounted display.

| Element | Size | Line Height | Weight | Font |
|---------|------|-------------|--------|------|
| Clock | 96px | 1.0 | 700 | JetBrains Mono |
| Date (full) | 32px | 1.2 | 600 | Plus Jakarta Sans |
| Section heading | 24px | 1.3 | 600 | Plus Jakarta Sans |
| Event title | 20px | 1.4 | 500 | Inter |
| Event time | 16px | 1.5 | 500 | JetBrains Mono |
| Body text | 16px | 1.5 | 400 | Inter |
| Labels | 14px | 1.4 | 500 | Inter |
| Caption / metadata | 12px | 1.4 | 400 | Inter |

### Typography Rules

1. **Never use more than two font families in a single view.** The clock panel uses JetBrains Mono + Plus Jakarta Sans. The calendar panel uses Inter + JetBrains Mono (for times). Avoid mixing all three in one card.
2. **Use font weight for hierarchy, not size alone.** Prefer a bold 20px heading over a regular 24px heading when space is tight.
3. **Time displays always use JetBrains Mono** with tabular figures enabled (`font-variant-numeric: tabular-nums`). This prevents the clock from "jittering" as digits change width.
4. **Letter-spacing adjustments**: Display text (32px+) uses -0.02em. Body text uses default (0). Labels use +0.02em for improved readability at small sizes.

---

## 5. Iconography

### Icon Library

**Lucide Icons** (https://lucide.dev)

Lucide is chosen for consistency with the Home Assistant ecosystem and its clean, minimal aesthetic. All icons in the Beacon interface must come from Lucide unless a custom icon is specifically required.

### Icon Specifications

| Property | Value |
|----------|-------|
| Default size | 24x24px |
| Compact size | 20x20px |
| Feature/hero size | 32x32px |
| Stroke width | 1.5px |
| Stroke cap | Round |
| Stroke join | Round |
| Color | Inherits from parent text color |

### Common Icon Mappings

| Concept | Lucide Icon Name |
|---------|-----------------|
| Calendar | `calendar` |
| Weather (sun) | `sun` |
| Weather (cloud) | `cloud` |
| Weather (rain) | `cloud-rain` |
| Temperature | `thermometer` |
| Time/Clock | `clock` |
| Family member | `user` |
| Settings | `settings` |
| Add event | `plus` |
| Home | `home` |
| Notification | `bell` |
| Meal/Food | `utensils` |
| Task/Todo | `check-square` |
| Photo | `image` |

### Icon Usage Rules

1. Icons always accompany text labels in navigation and section headings. Never use an unlabeled icon as the sole means of conveying meaning.
2. Interactive icons (buttons) have a minimum tap target of 44x44px regardless of the icon's visual size.
3. Icon color matches the adjacent text color. Active/selected state icons use Beacon Gold (#f59e0b).
4. Do not mix icon libraries. If Lucide does not have a needed icon, request a custom SVG drawn in the same style (1.5px stroke, round caps, round joins, 24px viewBox).

---

## 6. Spacing & Layout

### Base Unit

All spacing is derived from a **base unit of 8px**.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight gaps (icon-to-text inline) |
| `--space-2` | 8px | Minimum spacing between related items |
| `--space-3` | 12px | Compact padding (pills, tags) |
| `--space-4` | 16px | Default gap between sections, card internal padding (compact) |
| `--space-5` | 20px | Medium padding |
| `--space-6` | 24px | Content area padding, card internal padding (default) |
| `--space-8` | 32px | Large section separation |
| `--space-10` | 40px | Panel padding |
| `--space-12` | 48px | Major section breaks |

### Card Style

| Property | Value |
|----------|-------|
| Border radius | 16px |
| Internal padding | 24px (default), 16px (compact) |
| Background | `--color-surface` |
| Border | 1px solid `--color-border` (optional, prefer elevation) |
| Shadow (dark mode) | none (use surface color differentiation) |
| Shadow (light mode) | `0 1px 3px rgba(0,0,0,0.08)` |

### Three-Panel Layout

The primary Beacon display uses a three-panel horizontal layout:

```
+------------+------------------------+------------+
|            |                        |            |
|   Left     |        Center          |   Right    |
|   25%      |         50%            |    25%     |
|            |                        |            |
| Clock      |  Calendar / Events     |  Weather   |
| Date       |  Today's schedule      |  Todos     |
| Greeting   |                        |  Photos    |
|            |                        |            |
+------------+------------------------+------------+
```

| Panel | Width | Content |
|-------|-------|---------|
| Left | 25% | Clock, date, greeting, family status |
| Center | 50% | Today's calendar events, primary focus area |
| Right | 25% | Weather, tasks, photo frame, secondary info |

- Panels are separated by a 16px gap (`--space-4`)
- Each panel has 24px internal padding (`--space-6`)
- The layout is designed for landscape displays (16:9 or 16:10 aspect ratio)
- On smaller screens (tablets in portrait), collapse to a single-column scrolling layout

### Grid and Alignment

- All content aligns to an 8px grid
- Text baselines align across adjacent panels where possible
- Cards within a panel stack vertically with 16px gaps
- Horizontal arrangements of related items (e.g., weather icon + temperature) use 8px gaps

---

## 7. Motion & Animation

### General Principles

Wall-mounted displays are ambient. Motion should be **invisible** -- it should smooth transitions without calling attention to itself. Beacon is not a phone app; it does not need to entertain. It needs to inform.

### Transition Specifications

| Element | Duration | Easing | Property |
|---------|----------|--------|----------|
| Default transition | 200ms | ease-out | all |
| Color/opacity changes | 150ms | ease-out | color, opacity, background-color |
| Layout shifts | 200ms | ease-out | transform, height |
| Modal appearance | 150ms | ease-out | opacity, transform (translateY 8px to 0) |
| Modal dismissal | 100ms | ease-in | opacity |
| Event card hover | 200ms | ease-out | transform: scale(1.02) |
| Data refresh | 150ms | ease-out | opacity (fade old out, fade new in) |

### What Does NOT Animate

- **Clock digits**: No tick animation, no flip-clock effect, no transitions between numbers. The time simply updates. Animating the clock is distracting on a persistent display.
- **Page transitions**: There are none. Beacon is a single-page display. If settings or configuration panels appear, they overlay as modals.
- **Continuous animations**: No pulsing, spinning, or looping effects anywhere in the default display. The screen should be indistinguishable from a static image when no data changes.
- **Weather icons**: Static. No animated rain, no bouncing sun. Motion on a persistent display creates visual noise.

### Reduced Motion

When the user has `prefers-reduced-motion: reduce` enabled, all transitions become instant (0ms duration). The display remains fully functional.

---

## 8. Voice & Tone

### Guiding Principles

Beacon speaks like a helpful family member, not like software. The tone is warm and direct without being overly casual or resorting to jargon.

### Language Rules

1. **Use plain words.** "Today's Plan" not "Daily Agenda." "Add Event" not "Create Calendar Entry." "Settings" not "Configuration."
2. **Keep labels short.** If a label needs more than three words, rewrite it. Screen space on a wall display is precious.
3. **Address the family, not the user.** "Good morning, Sachs family" not "Welcome, user." Use the family name or a collective "everyone" when appropriate.
4. **Use time naturally.** "In 30 minutes" is better than "10:30 AM" for upcoming events (show both when space allows, but the relative time is primary). "Tomorrow" not "2026-03-28."
5. **Be encouraging, not pushy.** "Nothing planned this evening" not "You have no events. Add one?" Let the family breathe.
6. **Error messages should be helpful.** "Could not load calendar. Check your connection." not "Error 503: Service Unavailable." Never show stack traces or technical codes on the display.

### Vocabulary Reference

| Instead of... | Use... |
|---------------|--------|
| Daily Agenda | Today's Plan |
| Create Calendar Entry | Add Event |
| Configuration | Settings |
| Notification Preferences | Notification Settings |
| Authentication Required | Please sign in |
| No Data Available | Nothing here yet |
| Delete | Remove |
| Terminate Session | Sign out |
| Execute | Run |
| Modify | Edit |
| User Profile | Family Member |
| Dashboard | Home |
| Toggle | Turn on / Turn off |

### Greeting Logic

| Time of Day | Greeting |
|-------------|----------|
| 5:00 AM - 11:59 AM | Good morning |
| 12:00 PM - 4:59 PM | Good afternoon |
| 5:00 PM - 8:59 PM | Good evening |
| 9:00 PM - 4:59 AM | (No greeting -- dim/night mode, minimal UI) |

---

## 9. Asset Generation Guide

This section provides exact specifications for generating all brand assets. These specs are designed to be handed to a designer or used as prompts for AI image generation tools.

### Favicon

| Variant | Size | Format | Notes |
|---------|------|--------|-------|
| Standard | 32x32px | PNG, ICO | Icon-only mark, no glow arcs (too small). Solid Beacon Gold tower on transparent background. |
| Small | 16x16px | PNG, ICO | Simplified: tower shape only, no base detail. Solid fill, no stroke. |
| SVG | scalable | SVG | Full icon with glow arcs. Used for modern browsers that support SVG favicons. |

### App Icons

| Variant | Size | Format | Notes |
|---------|------|--------|-------|
| Primary | 512x512px | PNG | Full icon on Deep Navy (#0f172a) rounded-rectangle background (corner radius 80px). Icon centered with 20% padding on all sides. Glow arcs rendered in Beacon Gold with opacity gradient. |
| Standard | 192x192px | PNG | Same as 512 but optimized for the size. Simplify glow arcs if they become muddy. |
| Maskable | 512x512px | PNG | Icon centered with 40% safe zone. Background fills entire canvas in Deep Navy. For Android adaptive icons. |

### Open Graph Image

| Property | Value |
|----------|-------|
| Size | 1200x630px |
| Background | Deep Navy (#0f172a) |
| Layout | Icon + Wordmark centered horizontally. Icon on left, wordmark on right (Variation B). Vertically centered. |
| Tagline | "Your family's daily signal" in Inter Regular, 24px, #94a3b8, centered below the logo lockup with 32px spacing. |
| Bottom bar | Optional: a subtle 4px horizontal line in Beacon Gold at the bottom of the image. |
| Border | None. |
| Format | PNG or JPG (quality 90+). |

### Home Assistant Add-on Assets

**HA Add-on Icon:**

| Property | Value |
|----------|-------|
| Size | 256x256px |
| Format | PNG |
| Content | Icon-only mark (Variation A). Deep Navy background, fully rounded (circle or HA-standard square with rounded corners). Icon in Warm White with glow arcs in Beacon Gold. Centered with 20% padding. |

**HA Add-on Logo:**

| Property | Value |
|----------|-------|
| Size | 256x256px (or 512x128px horizontal if HA supports it) |
| Format | PNG |
| Content | Icon + Wordmark (Variation B). Deep Navy background. Icon and "Beacon" text in Warm White. Glow arcs in Beacon Gold. Scaled to fit with 15% padding. |

### Color Specification Reference

For every color in the palette, all three formats are provided above in Section 3. For quick reference during asset creation:

**Primary Brand Colors:**

```
Deep Navy
  HEX: #0f172a
  RGB: 15, 23, 42
  HSL: 222, 47%, 11%

Warm White
  HEX: #f8fafc
  RGB: 248, 250, 252
  HSL: 210, 40%, 98%

Beacon Gold
  HEX: #f59e0b
  RGB: 245, 158, 11
  HSL: 38, 92%, 50%

Soft Blue
  HEX: #3b82f6
  RGB: 59, 130, 246
  HSL: 217, 91%, 60%
```

### SVG Template Structure

When creating the logo as SVG, use this structure:

```
viewBox: 0 0 64 64
Tower base: trapezoid, x-center at 32, bottom y at 56, width 28 to 20
Tower body: trapezoid, bottom y at 44, top y at 16, width 20 to 12
Lantern room: rectangle, y at 12 to 16, width 16, centered
Glow arc 1 (inner): arc centered at (32, 14), radius 12, sweep 120deg upward, stroke-width 2
Glow arc 2 (middle): arc centered at (32, 14), radius 18, sweep 100deg upward, stroke-width 2, opacity 0.6
Glow arc 3 (outer): arc centered at (32, 14), radius 24, sweep 80deg upward, stroke-width 2, opacity 0.3
```

All strokes use round line caps. The tower and base use fill (no stroke). Glow arcs use stroke only (no fill).

---

## Appendix: CSS Custom Properties

For implementation reference, here are the recommended CSS custom property names:

```css
:root {
  /* Colors - Dark mode (default) */
  --color-bg: #0f172a;
  --color-surface: #1e293b;
  --color-surface-raised: #334155;
  --color-border: #475569;
  --color-text: #f8fafc;
  --color-text-secondary: #94a3b8;
  --color-text-muted: #64748b;
  --color-accent: #f59e0b;
  --color-interactive: #3b82f6;

  /* Calendar colors */
  --color-cal-ocean: #3b82f6;
  --color-cal-sage: #10b981;
  --color-cal-lavender: #8b5cf6;
  --color-cal-coral: #f97316;
  --color-cal-rose: #ec4899;
  --color-cal-teal: #14b8a6;

  /* Semantic */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #06b6d4;

  /* Typography */
  --font-display: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Radii */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  /* Motion */
  --transition-fast: 150ms ease-out;
  --transition-default: 200ms ease-out;
}

/* Light mode overrides */
@media (prefers-color-scheme: light) {
  :root {
    --color-bg: #f8fafc;
    --color-surface: #ffffff;
    --color-surface-raised: #f1f5f9;
    --color-border: #e2e8f0;
    --color-text: #0f172a;
    --color-text-secondary: #475569;
    --color-text-muted: #94a3b8;
  }
}

/* Respect motion preferences */
@media (prefers-reduced-motion: reduce) {
  :root {
    --transition-fast: 0ms;
    --transition-default: 0ms;
  }
}
```
