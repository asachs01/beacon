# Beacon Hardware Guide

Beacon runs on any screen with a web browser. Here are tested and recommended setups, from budget to premium.

## Recommended Setups

### Wall-Mounted Display (Best Experience)

| Component | Model | Price | Notes |
|-----------|-------|-------|-------|
| **Monitor** | [ASUS VT229H 21.5" Touch](https://www.amazon.com/dp/B07GB8MJJJ) | ~$219 | 1080p IPS, 10-point touch, HDMI, VESA mountable. Amazon's Choice. |
| **Computer** | [Raspberry Pi 5 (4GB)](https://www.raspberrypi.com/products/raspberry-pi-5/) | ~$60 | Runs Chromium in kiosk mode. 4GB is plenty. |
| **Power** | Official Pi 5 USB-C PSU | ~$12 | 27W supply recommended for Pi 5 |
| **Storage** | Any 32GB+ microSD | ~$10 | Or USB SSD for better reliability |
| **Mount** | VESA wall mount bracket | ~$10-20 | 100x100mm VESA for the ASUS |
| | | **~$310 total** | |

### Budget Setup (Under $100)

| Component | Model | Price | Notes |
|-----------|-------|-------|-------|
| **Tablet** | Amazon Fire HD 10 (refurb) | ~$70 | Run Beacon as a PWA via Silk browser |
| **Stand** | Tablet wall mount or stand | ~$15 | Magnetic or adhesive mount |
| | | **~$85 total** | |

### Repurpose What You Have ($0)

- **Old iPad or Android tablet** — Open Beacon in Safari/Chrome, add to home screen
- **Old laptop** — Open in fullscreen (F11), prop up in the kitchen
- **Spare monitor + any PC** — Chromium kiosk mode

## Kiosk Setup (Raspberry Pi)

1. Install Raspberry Pi OS with Desktop and install **Family** in Home Assistant from `https://github.com/f1f1f1f1f1f1/Family`.
2. Sign in to Home Assistant on the Pi, open the Family sidebar panel, and keep that authenticated session on the kiosk device. The add-on is ingress-only: do **not** hardcode another installation's add-on slug, bookmark an expiring ingress token, or expose its internal port.
3. Launch Chromium in kiosk mode at your Home Assistant URL, then open Family from its sidebar:

   ```bash
   chromium-browser --kiosk --noerrdialogs 'https://YOUR-HA-HOST/'
   ```

For a separately managed [standalone Docker deployment](https://beacon-family-docs.netlify.app/docs/getting-started/deployment/), use its HTTPS reverse-proxy URL instead. Docker requires server-side HA credentials, HTTP Basic, a parent PIN, and a loopback-bound host port; do not use an unauthenticated plain-HTTP kiosk URL.

## Display Recommendations by Size

| Size | Use Case | Recommended |
|------|----------|-------------|
| 10-11" | Kitchen counter, bedside | Amazon Fire HD 10, iPad |
| 15-16" | Wall mount, Skylight replacement | WIMAXIT 15.6" portable touch (~$130) |
| 21-22" | Wall mount, family hub | **ASUS VT229H 21.5" touch (~$219)** |
| 24"+ | Large wall display, living room | Dell P2418HT 23.8" touch (~$250) |

## Tips

- **Touch is optional** — Beacon works great as a view-only display too
- **Landscape orientation** — Best for the calendar week view
- **Screen burn-in** — Beacon's screen saver prevents this on OLED/AMOLED
- **Power** — Most monitors can be powered via a single outlet; the Pi can share a USB-C hub
- **Wi-Fi** — Pi 5 has built-in Wi-Fi; no ethernet needed (but wired is more reliable)
