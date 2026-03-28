---
title: "Configuration"
date: 2026-03-25
description: "Complete reference for all Beacon configuration options — add-on options, environment variables, runtime config, and advanced settings."
categories: ["docs"]
tags: ["configuration", "settings", "customization", "reference"]
slug: "configuration"
draft: false
---

# Configuration Reference

Beacon can be configured through the Home Assistant add-on options panel, Docker environment variables, or Vite environment variables during development. All configuration is ultimately resolved at runtime through the `getConfig()` function.

---

## Complete add-on options reference

These options are set in **Settings > Add-ons > Beacon > Configuration** when running as an HA add-on.

| Option | Type | Default | Description | Example |
|--------|------|---------|-------------|---------|
| `family_name` | string | `"My Family"` | Your family name. Appears in the dashboard greeting ("Good morning, Sachs") and the calendar header. | `"Sachs"` |
| `theme` | string | `"skylight"` | The color theme to use. Options: `skylight`, `midnight`, `nord`, `dracula`, `monokai`, `rose`, `forest`. The theme selector in the sidebar overrides this value. | `"midnight"` |
| `auto_dark_mode` | boolean | `true` | When true and theme is set to `auto`, Beacon switches between Skylight (day) and Midnight (night) based on time of day. | `true` |
| `weather_entity` | string | `"weather.home"` | The Home Assistant weather entity ID to use for temperature and forecast data. Leave empty to disable weather. | `"weather.forecast_home"` |
| `photo_directory` | string | `"/media/beacon/photos"` | The path to the photo directory on the Home Assistant server. Photos in this directory are displayed in the Photo Frame view. | `"/media/family-photos"` |
| `photo_interval` | integer | `30` | Seconds between automatic photo transitions in the Photo Frame slideshow. | `15` |
| `screen_saver_timeout` | integer | `5` | Minutes of inactivity before the screen dimming phase activates. The clock screensaver activates at 2x this value. | `10` |

### Example add-on configuration

```yaml
family_name: "Sachs"
theme: "midnight"
auto_dark_mode: true
weather_entity: "weather.home"
photo_directory: "/media/beacon/photos"
photo_interval: 30
screen_saver_timeout: 5
```

---

## Environment variables (Docker and development)

When running Beacon as a standalone Docker container or in development mode, configuration is provided through environment variables.

### Docker environment variables

| Variable | Maps To | Default |
|----------|---------|---------|
| `SUPERVISOR_TOKEN` | `ha_token` | (none) |
| `HA_URL` | `ha_url` | `http://supervisor/core` |
| `FAMILY_NAME` | `family_name` | `My Family` |
| `THEME` | `theme` | `skylight` |
| `AUTO_DARK_MODE` | `auto_dark_mode` | `true` |
| `WEATHER_ENTITY` | `weather_entity` | `weather.home` |
| `PHOTO_DIRECTORY` | `photo_directory` | `/media/beacon/photos` |
| `PHOTO_INTERVAL` | `photo_interval` | `30` |
| `SCREEN_SAVER_TIMEOUT` | `screen_saver_timeout` | `5` |

### Vite environment variables (development)

Create a `.env` file in the project root:

| Variable | Maps To | Default |
|----------|---------|---------|
| `VITE_HA_URL` | `ha_url` | `http://supervisor/core` |
| `VITE_HA_TOKEN` | `ha_token` | (none) |
| `VITE_FAMILY_NAME` | `family_name` | `My Family` |
| `VITE_THEME` | `theme` | `skylight` |
| `VITE_AUTO_DARK_MODE` | `auto_dark_mode` | `true` (set to `false` to disable) |
| `VITE_HA_WEATHER_ENTITY` | `weather_entity` | `weather.home` |
| `VITE_PHOTO_DIRECTORY` | `photo_directory` | `/media/beacon/photos` |
| `VITE_PHOTO_INTERVAL` | `photo_interval` | `30` |
| `VITE_SCREEN_SAVER_TIMEOUT` | `screen_saver_timeout` | `5` |

### Example `.env` file

```bash
VITE_HA_URL=http://192.168.1.100:8123
VITE_HA_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_FAMILY_NAME="Sachs"
VITE_THEME=midnight
VITE_AUTO_DARK_MODE=true
VITE_HA_WEATHER_ENTITY=weather.home
VITE_PHOTO_DIRECTORY=/media/beacon/photos
VITE_PHOTO_INTERVAL=30
VITE_SCREEN_SAVER_TIMEOUT=5
```

---

## Runtime config system

Beacon uses a runtime configuration injection system that works across all deployment methods.

### How it works

1. **Add-on mode**: The `run.sh` script reads options from `/data/options.json` (populated by HA Supervisor) and generates a `runtime-config.js` file that sets `window.__BEACON_CONFIG__`. This script tag is injected into `index.html`.

2. **Development mode**: Vite reads `VITE_*` variables from `.env` and makes them available via `import.meta.env.*`.

3. **Resolution order**: For each config value, Beacon checks:
   1. `window.__BEACON_CONFIG__` (runtime injection, highest priority)
   2. `import.meta.env.VITE_*` (build-time environment variables)
   3. Hard-coded defaults

### The `getConfig()` function

```typescript
import { getConfig } from './config';

const config = getConfig();
// config.ha_url       - Home Assistant URL
// config.ha_token     - Access token
// config.family_name  - Family name
// config.theme        - Theme ID
// config.auto_dark_mode - Auto dark mode flag
// config.weather_entity - Weather entity ID
// config.photo_directory - Photo directory path
// config.photo_interval  - Photo interval in seconds
// config.screen_saver_timeout - Screen saver timeout in minutes
```

The config is cached after the first call — subsequent calls return the same object.

### `window.__BEACON_CONFIG__`

In add-on mode, `run.sh` generates this JavaScript object:

```javascript
window.__BEACON_CONFIG__ = {
  ha_url: "http://supervisor/core",
  ha_token: "SUPERVISOR_TOKEN_VALUE",
  family_name: "Sachs",
  theme: "midnight",
  auto_dark_mode: true,
  weather_entity: "weather.home",
  photo_directory: "/media/beacon/photos",
  photo_interval: 30,
  screen_saver_timeout: 5
};
```

This is injected as a `<script>` tag in `index.html` before the main application bundle loads.

---

## Advanced: Custom CSS injection

You can inject custom CSS to override any Beacon styles by adding a `<style>` tag to the `runtime-config.js` mechanism or through a browser extension.

### Example: Override the clock font size

```css
.dashboard-clock {
  font-size: 120px !important;
}
```

### Example: Hide the weather widget

```css
.dashboard-weather {
  display: none !important;
}
```

### Example: Change the sidebar width

```css
.sidebar--desktop {
  width: 80px !important;
}
```

All Beacon styles use CSS custom properties (see [Themes](/docs/themes/) for the complete list), so most visual customizations can be achieved by overriding the `--*` properties on `:root` rather than targeting specific class names.

---

## config.yaml reference (add-on manifest)

The `config.yaml` file in the repository root defines the add-on metadata for Home Assistant:

```yaml
name: Beacon
version: "1.0.0"
slug: beacon
description: "Family command center for wall-mounted displays"
url: "https://github.com/asachs01/beacon"
arch:
  - amd64
  - aarch64
  - armv7
startup: application
boot: auto
ingress: true
ingress_port: 3000
panel_icon: mdi:calendar-clock
panel_title: Beacon
homeassistant_api: true
auth_api: true
```

| Field | Description |
|-------|-------------|
| `arch` | Supported CPU architectures (AMD64, ARM64, ARMv7) |
| `ingress: true` | Beacon is accessible through HA's ingress proxy (sidebar panel) |
| `ingress_port: 3000` | The internal port Beacon listens on |
| `panel_icon` | The icon shown in HA's sidebar (`mdi:calendar-clock`) |
| `panel_title` | The label shown in HA's sidebar ("Beacon") |
| `homeassistant_api: true` | Beacon has access to the HA API |
| `auth_api: true` | Beacon uses HA's authentication system |

---

## Troubleshooting

### Configuration changes do not take effect

1. **Add-on**: After changing configuration, click **Save** and then **Restart** the add-on. Some changes require a container restart to regenerate `runtime-config.js`.
2. **Development**: After changing `.env`, restart the Vite dev server (`npm run dev`)
3. **Theme changes**: The theme selector saves to localStorage, which overrides the config value. Clear the `beacon-theme` localStorage key to revert to the configured theme.

### "No HA token configured" warning

This appears in the browser console when:
1. No `VITE_HA_TOKEN` is set in `.env` (development mode)
2. The `SUPERVISOR_TOKEN` environment variable is missing (Docker mode)
3. The runtime-config.js script did not generate correctly (add-on mode)

Without a token, Beacon runs in demo mode — no data is fetched from Home Assistant.

### Weather entity not found

If the weather widget does not appear:
1. Verify the entity ID in your configuration matches exactly (case-sensitive)
2. Check that the entity exists in **Developer Tools > States**
3. Some weather integrations create entities with different naming patterns (e.g., `weather.forecast_home` vs `weather.home`)
