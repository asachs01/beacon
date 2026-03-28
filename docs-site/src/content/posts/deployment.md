---
title: "Deployment"
date: 2026-03-26
description: "Deploying Beacon — HA add-on, Docker standalone, reverse proxy, hardware recommendations, kiosk mode, and performance optimization."
categories: ["docs"]
tags: ["deployment", "docker", "nginx", "kiosk", "hardware"]
slug: "deployment"
draft: false
---

# Deployment

This guide covers all deployment options for Beacon: the Home Assistant add-on, standalone Docker, reverse proxy setup, hardware recommendations, kiosk mode configuration, and performance optimization.

---

## HA Add-on deployment

The simplest deployment. See [Getting Started](/docs/getting-started/) for the step-by-step installation.

**How it works under the hood:**

1. The Dockerfile uses a two-stage build:
   - **Build stage**: Node.js 20 Alpine builds the Vite/React app (`npm ci && npm run build`)
   - **Runtime stage**: Based on `ghcr.io/hassio-addons/base:16.3.2`, installs Node.js and the `serve` static file server
2. `run.sh` runs at container start:
   - Reads add-on options from `/data/options.json` via `bashio::config`
   - Generates `runtime-config.js` with the configuration values
   - Injects the script tag into `index.html`
   - Starts `serve` on port 3000
3. HA's ingress proxy forwards requests from the sidebar panel to port 3000

**Health check**: The container includes a health check that runs every 30 seconds:
```
wget -qO /dev/null http://localhost:3000/ || exit 1
```

---

## Docker standalone deployment

For running Beacon outside of Home Assistant's add-on system.

### Basic deployment

```bash
docker run -d \
  --name beacon \
  --restart unless-stopped \
  -p 3000:3000 \
  -e SUPERVISOR_TOKEN="YOUR_LONG_LIVED_TOKEN" \
  -e HA_URL="http://192.168.1.100:8123" \
  -e FAMILY_NAME="Sachs" \
  -e THEME="midnight" \
  -e WEATHER_ENTITY="weather.home" \
  ghcr.io/asachs01/beacon:latest
```

### Docker Compose

```yaml
version: "3.8"
services:
  beacon:
    image: ghcr.io/asachs01/beacon:latest
    container_name: beacon
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      SUPERVISOR_TOKEN: "${HA_TOKEN}"
      HA_URL: "http://192.168.1.100:8123"
      FAMILY_NAME: "Sachs"
      THEME: "midnight"
      AUTO_DARK_MODE: "true"
      WEATHER_ENTITY: "weather.home"
      PHOTO_DIRECTORY: "/media/beacon/photos"
      PHOTO_INTERVAL: "30"
      SCREEN_SAVER_TIMEOUT: "5"
```

### Building from source

```bash
git clone https://github.com/asachs01/beacon.git
cd beacon
docker build -t beacon .
docker run -d --name beacon -p 3000:3000 \
  -e SUPERVISOR_TOKEN="..." \
  -e HA_URL="..." \
  beacon
```

---

## Reverse proxy setup

If you want to access Beacon from outside your local network or behind a reverse proxy.

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name beacon.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for HA API passthrough)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Caddy

```
beacon.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Caddy handles SSL certificates automatically via Let's Encrypt.

### Important notes

- Beacon connects to Home Assistant's WebSocket API directly from the browser. The browser must be able to reach the HA URL configured in `ha_url`.
- If you put Beacon behind a reverse proxy but HA is on a different domain/port, you may need to configure CORS on HA or ensure both are accessible from the browser.
- For best results, keep Beacon and HA on the same network and access Beacon via the reverse proxy.

---

## Hardware recommendations

### Tablets (wall-mounted)

| Device | Display | Price | Best For |
|--------|---------|-------|----------|
| Amazon Fire HD 8 | 8" 1280x800 | $35-50 | Budget setup, small kitchen display |
| Amazon Fire HD 10 | 10.1" 1920x1200 | $75-100 | Family room, great value |
| Samsung Galaxy Tab A8 | 10.5" 1920x1200 | $150 | Better build quality, Android apps |
| iPad (10th gen) | 10.9" 2360x1640 | $300 | Premium display, reliable |
| Lenovo Tab M10 | 10.1" 1920x1200 | $100-130 | Good alternative to Fire |

### Mini PCs + Monitor

| Setup | Price | Best For |
|-------|-------|----------|
| Raspberry Pi 4 (4GB) + 10" HDMI monitor | $80-120 | DIY setup, larger displays |
| Raspberry Pi 5 + 15" touchscreen | $150-200 | Living room command center |
| Intel NUC + repurposed monitor | $100-200 | Desktop-class reliability |
| Beelink Mini S + any HDMI display | $120-180 | Compact, powerful |

### Mounting options

| Mount Type | Price | Notes |
|------------|-------|-------|
| 3M Command strips | $5 | Temporary, no damage to walls |
| Magnetic wall mount | $15 | Easy to detach for charging |
| VESA mount (for monitors) | $15-30 | Standard TV/monitor mounting |
| 3D-printed bracket | $5-10 | Custom fit for specific tablets |
| Recessed wall mount | $50+ | Professional look, flush with wall |

---

## Kiosk mode setup

Kiosk mode locks the device to showing only Beacon, preventing accidental navigation or app switching.

### Android (Fully Kiosk Browser)

[Fully Kiosk Browser](https://www.fully-kiosk.com/) is the recommended kiosk solution for Android tablets.

1. Install Fully Kiosk Browser from the APK (it is not on the Play Store)
2. Set the **Start URL** to your Beacon address
3. Enable these settings:
   - **Web Auto Reload**: Enable, set to reload on connectivity change
   - **Keep Screen On**: Yes
   - **Screen Brightness**: 40-60%
   - **Autostart on Boot**: Yes
   - **Kiosk Mode**: Enable (requires device admin)
   - **Hide Status Bar**: Yes
   - **Hide Navigation Bar**: Yes
   - **Disable Home Button**: Yes (kiosk mode)

### Chrome kiosk mode (desktop/Raspberry Pi)

```bash
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-translate \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  http://YOUR_BEACON_URL
```

Add this to a startup script (`~/.config/autostart/beacon.desktop` on Linux):

```ini
[Desktop Entry]
Type=Application
Name=Beacon
Exec=chromium-browser --kiosk --noerrdialogs http://YOUR_BEACON_URL
```

### Firefox kiosk mode

```bash
firefox --kiosk http://YOUR_BEACON_URL
```

### iPad Guided Access

1. Open Beacon in Safari
2. Triple-click the side button to enable Guided Access
3. Tap **Start** — the iPad is now locked to Safari
4. To exit, triple-click the side button and enter your passcode

---

## Multi-display setup

You can run Beacon on multiple displays simultaneously. Each display:

- Connects to the same Home Assistant instance
- Shows the same calendar events (since they come from HA)
- Has its own independent localStorage (family members, chores, theme preference)
- Can be configured with different themes or family names

### Example: Kitchen + Living Room

1. Set up a Fire tablet in the kitchen with the Skylight theme
2. Set up a Raspberry Pi + monitor in the living room with the Midnight theme
3. Both connect to the same HA URL and show the same calendars

---

## Performance optimization

### For tablets

- **Disable animations**: If the tablet is low-powered, some browsers allow disabling CSS animations via `prefers-reduced-motion`
- **Reduce photo resolution**: Resize photos to 1920x1080 before adding them to the photo directory
- **Increase refresh intervals**: In development, you can modify the refresh intervals (events: 5 min, weather: 10 min, grocery: 2 min) to reduce API calls

### For Raspberry Pi

- **Use Chromium**: It performs better than Firefox on ARM
- **Disable GPU compositing** if you see rendering artifacts: `--disable-gpu`
- **Allocate more GPU memory**: In `config.txt`, set `gpu_mem=128` or higher
- **Use a lightweight window manager**: `openbox` is sufficient — no need for a full desktop environment

### General

- Beacon's production build is a static site served by `serve`. It has minimal server overhead.
- The main resource consumption is in the browser (JavaScript, DOM rendering, WebSocket connection).
- Network usage is minimal: WebSocket messages for state changes, REST API calls for photos and grocery data.
- The health check (`wget` every 30 seconds) has negligible impact.

---

## Troubleshooting

### Container does not start

1. Check Docker logs: `docker logs beacon`
2. Verify the `SUPERVISOR_TOKEN` is valid (not expired)
3. Verify the `HA_URL` is reachable from the Docker container (try `docker exec beacon wget -qO- http://HA_URL/api/`)

### Beacon loads but shows "Demo Mode"

This means Beacon could not connect to Home Assistant. Check:
1. The `ha_url` is correct and reachable from the browser
2. The `ha_token` is valid
3. The HA instance is running and the WebSocket API is accessible

### Display goes to sleep / screen turns off

This is controlled by the device's OS, not by Beacon. Disable screen timeout:
- **Android**: Settings > Display > Screen timeout > Never (or use Fully Kiosk's "Keep Screen On")
- **iPad**: Settings > Display & Brightness > Auto-Lock > Never
- **Linux**: `xset s off && xset -dpms`
